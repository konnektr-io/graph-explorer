import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { AccountInfo } from "@azure/msal-browser";
import {
  acquireB2CToken,
  getB2CScope,
  getMsalInstance,
} from "@/services/environmentRouting";

/**
 * The auth surface the app consumes. When Auth0 is enabled this mirrors the
 * Auth0 getters; when the Arcadis flavor disables Auth0 it is backed by the
 * deployment-wide Azure B2C configuration instead.
 */
export interface AuthUser {
  sub?: string;
  name?: string;
  email?: string;
  picture?: string;
  nickname?: string;
}

export interface TokenRequestOptions {
  authorizationParams?: { audience?: string; scope?: string };
}

export interface AuthContextValue {
  isAuthenticated: boolean;
  user: AuthUser | undefined;
  login: () => Promise<void>;
  loginWithRedirect: () => Promise<void>;
  logout: (options?: { logoutParams?: { returnTo?: string } }) => void;
  getAccessTokenSilently: (
    options?: TokenRequestOptions
  ) => Promise<string>;
  getAccessTokenWithPopup: (
    options?: TokenRequestOptions
  ) => Promise<string | undefined>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Access the app's auth surface.
 * Must be used within an <AuthProvider>.
 */
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return value;
}

const accountToUser = (account: AccountInfo): AuthUser => {
  const claims = (account.idTokenClaims ?? {}) as Record<string, unknown>;
  const emails = claims.emails as string[] | undefined;
  return {
    sub: (claims.sub as string) || account.username,
    name: (claims.name as string) || account.name,
    email:
      (claims.email as string) ||
      emails?.[0] ||
      (claims.preferred_username as string) ||
      account.username,
    picture: (claims.picture as string) || undefined,
    nickname: (claims.name as string) || account.name,
  };
};

/**
 * B2C-backed auth surface for the Arcadis flavor (Auth0 disabled).
 * There is no Auth0Provider in this build — the whole surface is driven by the
 * shared MSAL singleton from `environmentRouting.ts`.
 */
export function useB2CAuthValue(): AuthContextValue {
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => (getMsalInstance()?.getAllAccounts() ?? []).length > 0
  );

  const login = useCallback(async () => {
    const scope = getB2CScope();
    await acquireB2CToken(scope ? [scope] : []);
    setIsAuthenticated(
      Boolean((getMsalInstance()?.getAllAccounts() ?? []).length > 0)
    );
  }, []);

  const logout = useCallback(() => {
    const instance = getMsalInstance();
    const account = instance?.getAllAccounts()[0];
    if (instance && account) {
      instance
        .logoutPopup({ account })
        .catch((error) => console.error("B2C logout failed:", error));
    }
    setIsAuthenticated(false);
  }, []);

  const getAccessTokenSilently = useCallback(async () => {
    const instance = getMsalInstance();
    const accounts = instance?.getAllAccounts() ?? [];
    const scope = getB2CScope();
    if (!instance || !scope || accounts.length === 0) {
      throw new Error("Authentication required. Please sign in.");
    }
    await instance.initialize();
    const result = await instance.acquireTokenSilent({
      scopes: [scope],
      account: accounts[0],
    });
    return result.accessToken;
  }, []);

  const getAccessTokenWithPopup = useCallback(async () => {
    const scope = getB2CScope();
    const token = await acquireB2CToken(scope ? [scope] : []);
    return token ?? undefined;
  }, []);

  const user = useMemo(() => {
    if (!isAuthenticated) return undefined;
    const account = getMsalInstance()?.getAllAccounts()[0];
    return account ? accountToUser(account) : undefined;
  }, [isAuthenticated]);

  const value = useMemo<AuthContextValue>(
    () => ({
      isAuthenticated,
      user,
      login,
      loginWithRedirect: login,
      logout,
      getAccessTokenSilently,
      getAccessTokenWithPopup,
    }),
    [
      isAuthenticated,
      user,
      login,
      logout,
      getAccessTokenSilently,
      getAccessTokenWithPopup,
    ]
  );

  return value;
}
