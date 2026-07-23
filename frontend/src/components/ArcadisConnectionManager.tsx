import { useEffect, useState } from "react";
import type { AccountInfo } from "@azure/msal-browser";
import { PublicClientApplication } from "@azure/msal-browser";
import { fetchEnvironments, type Environment } from "@/services/environmentsClient";
import { useConnectionStore, type Connection, type AuthProvider } from "@/stores/connectionStore";

/**
 * MSAL B2C configuration — loaded from environment variables.
 * These must be set for Arcadis environment-based connections to work.
 */
function getMsalConfig() {
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
 * Singleton MSAL instance for Arcadis B2C authentication.
 * Created lazily and reused across the component lifecycle.
 */
let msalInstance: PublicClientApplication | null = null;

function getMsalInstance(): PublicClientApplication | null {
  if (msalInstance) return msalInstance;

  const config = getMsalConfig();
  if (!config) return null;

  msalInstance = new PublicClientApplication(config);
  return msalInstance;
}

/**
 * Acquire a B2C access token using MSAL.
 * Attempts silent acquisition first, falls back to popup login.
 */
async function acquireB2CToken(
  scopes?: string[]
): Promise<string | null> {
  const instance = getMsalInstance();
  if (!instance) return null;

  await instance.initialize();

  const accounts = instance.getAllAccounts();
  const scope = scopes || [
    import.meta.env.VITE_B2C_SCOPE || "https://digitaltwins.azure.net/.default",
  ];

  if (accounts.length === 0) {
    // No account — trigger login popup
    try {
      const result = await instance.loginPopup({
        scopes: scope,
      });
      return result.accessToken;
    } catch (error) {
      console.error("B2C login failed:", error);
      return null;
    }
  }

  const account: AccountInfo = accounts[0];
  try {
    const result = await instance.acquireTokenSilent({
      scopes: scope,
      account,
    });
    return result.accessToken;
  } catch {
    // Silent acquisition failed — try popup
    try {
      const result = await instance.acquireTokenPopup({
        scopes: scope,
        account,
      });
      return result.accessToken;
    } catch (error) {
      console.error("B2C token acquisition failed:", error);
      return null;
    }
  }
}

/**
 * Maps an environment API response to a Connection object for the store.
 */
function environmentToConnection(env: Environment): Connection {
  const adtHost = `arcadis-${env.id}`;

  return {
    id: `arcadis-${env.id}`,
    name: env.name,
    adtHost,
    environmentId: env.id,
    description: env.description || `Arcadis environment: ${env.name}`,
    authProvider: "msal" as AuthProvider,
    managedSource: "arcadis",
    status: env.status,
  };
}

/**
 * Manages Arcadis environment-based connections.
 *
 * Fetches available environments from the configured `/api/environments` endpoint
 * and populates the connection store with them.
 *
 * Must be used within a component tree that has access to the connection store.
 * The component renders nothing — it's a logic-only orchestrator.
 */
export function ArcadisConnectionManager() {
  const setArcadisConnections = useConnectionStore(
    (state) => state.setArcadisConnections
  );
  const [hasInitialFetch, setHasInitialFetch] = useState(false);

  // Use B2C scopes from env or fall back to digitaltwins default
  const scopes = import.meta.env.VITE_B2C_SCOPE
    ? [import.meta.env.VITE_B2C_SCOPE]
    : undefined;

  // Fetch environments on mount
  useEffect(() => {
    if (hasInitialFetch) return;

    const fetchEnvironmentsList = async () => {
      try {
        const token = await acquireB2CToken(scopes);
        if (!token) {
          console.warn(
            "Arcadis: No B2C token available — skipping environment fetch"
          );
          setHasInitialFetch(true);
          return;
        }

        const environments = await fetchEnvironments(token);
        const connections = environments.map(environmentToConnection);
        setArcadisConnections(connections);
        setHasInitialFetch(true);

        console.log(
          `Arcadis: Fetched ${environments.length} environment(s)`
        );
      } catch (error) {
        console.error("Arcadis: Failed to fetch environments:", error);
        setHasInitialFetch(true);
      }
    };

    fetchEnvironmentsList();
  }, [hasInitialFetch, setArcadisConnections, scopes]);

  return null; // Logic-only component
}
