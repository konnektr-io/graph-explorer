/**
 * Environment-based routing configuration and helpers.
 *
 * Deployments that sit behind a proxy which resolves the graph backend from an
 * environment identifier (`x-adt-id`) configure this feature entirely through
 * build args. When the B2C variables are unset the feature is inert, which is
 * what keeps the public Konnektr build unaffected.
 *
 * Kept separate from the component so the component module only exports a
 * component (React Fast Refresh requirement).
 */
import type { AccountInfo } from "@azure/msal-browser";
import { PublicClientApplication } from "@azure/msal-browser";
import type { Environment } from "@/services/environmentsClient";
import type { AuthProvider, Connection } from "@/stores/connectionStore";

/**
 * Display label for the environments group in the connection selector.
 * Deployment-specific — configured at build time.
 */
export const ENVIRONMENTS_LABEL =
  import.meta.env.VITE_ENVIRONMENTS_LABEL || "Environments";

/**
 * MSAL B2C configuration — loaded from environment variables.
 * Returns `null` when the deployment has not configured B2C.
 */
export function getMsalConfig() {
  const clientId = import.meta.env.VITE_B2C_CLIENT_ID;
  const authority = import.meta.env.VITE_B2C_AUTHORITY;
  const knownAuthority = import.meta.env.VITE_B2C_KNOWN_AUTHORITY;

  if (!clientId || !authority) {
    return null;
  }

  return {
    auth: {
      clientId,
      authority,
      knownAuthorities: knownAuthority ? [knownAuthority] : undefined,
      redirectUri: window.location.origin,
    },
    cache: {
      cacheLocation: "localStorage" as const,
      storeAuthStateInCookie: false,
    },
  };
}

/**
 * The platform API scope the proxy accepts.
 *
 * There is deliberately no default. The proxy authorizes the caller's B2C token
 * and then uses its own identity towards the graph backend, so a token issued
 * for the Azure Digital Twins resource (the previous fallback) would simply be
 * rejected. A missing scope is treated as "not configured" instead.
 */
export function getB2CScope(): string | undefined {
  return import.meta.env.VITE_B2C_SCOPE || undefined;
}

/**
 * True when the deployment is fully configured for environment-based connections.
 */
export function isEnvironmentRoutingConfigured(): boolean {
  return Boolean(getMsalConfig() && getB2CScope());
}

/**
 * Singleton MSAL instance for B2C authentication.
 * Created lazily and reused across the component lifecycle.
 */
let msalInstance: PublicClientApplication | null = null;

export function getMsalInstance(): PublicClientApplication | null {
  if (msalInstance) return msalInstance;

  const config = getMsalConfig();
  if (!config) return null;

  msalInstance = new PublicClientApplication(config);
  return msalInstance;
}

/** Test seam — resets the lazily created MSAL singleton. */
export function resetMsalInstance(): void {
  msalInstance = null;
}

/**
 * Acquire a B2C access token using MSAL.
 * Attempts silent acquisition first, falls back to popup login.
 */
export async function acquireB2CToken(
  scopes: string[]
): Promise<string | null> {
  if (scopes.length === 0) return null;

  const instance = getMsalInstance();
  if (!instance) return null;

  await instance.initialize();

  const accounts = instance.getAllAccounts();

  if (accounts.length === 0) {
    // No account — trigger login popup
    try {
      const result = await instance.loginPopup({ scopes });
      return result.accessToken;
    } catch (error) {
      console.error("B2C login failed:", error);
      return null;
    }
  }

  const account: AccountInfo = accounts[0];
  try {
    const result = await instance.acquireTokenSilent({ scopes, account });
    return result.accessToken;
  } catch {
    // Silent acquisition failed — try popup
    try {
      const result = await instance.acquireTokenPopup({ scopes, account });
      return result.accessToken;
    } catch (error) {
      console.error("B2C token acquisition failed:", error);
      return null;
    }
  }
}

/**
 * Maps an environment API response to a Connection object for the store.
 *
 * No synthetic host is generated: `adtHost` is left unset and the client derives
 * its base URL from the current origin, because environment-routed requests are
 * rewritten to the current origin anyway. Connection ids are namespaced with
 * `env-` so they cannot collide with KtrlPlane or local connection ids.
 */
export function environmentToConnection(env: Environment): Connection {
  return {
    id: `env-${env.id}`,
    name: env.name,
    environmentId: env.id,
    description: env.description || `Environment: ${env.name}`,
    authProvider: "msal" as AuthProvider,
    managedSource: "environments",
    status: env.status,
  };
}
