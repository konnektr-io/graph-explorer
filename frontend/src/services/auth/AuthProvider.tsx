import { Auth0Provider, useAuth0 } from "@auth0/auth0-react";
import type { ReactNode } from "react";
import { isAuth0Disabled } from "@/config/flavor";
import {
  AuthContext,
  useB2CAuthValue,
  type AuthContextValue,
} from "@/services/auth/authContext";

/**
 * B2C-backed implementation for the Arcadis flavor (Auth0 disabled).
 * There is no Auth0Provider in this build — the whole surface is driven by the
 * shared MSAL singleton from `environmentRouting.ts`.
 */
function B2CAuthBridge({ children }: { children: ReactNode }) {
  const value = useB2CAuthValue();
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Auth0-backed implementation — bridges the Auth0Provider context to the app's
 * auth surface so consumers share one code path for both backends.
 */
function Auth0Bridge({ children }: { children: ReactNode }) {
  const auth0 = useAuth0();

  const value: AuthContextValue = {
    isAuthenticated: auth0.isAuthenticated,
    user: auth0.user,
    login: () => auth0.loginWithRedirect(),
    loginWithRedirect: () => auth0.loginWithRedirect(),
    logout: (options) => auth0.logout(options),
    getAccessTokenSilently: auth0.getAccessTokenSilently,
    getAccessTokenWithPopup: auth0.getAccessTokenWithPopup,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

interface AuthProviderProps {
  children: ReactNode;
}

/**
 * Root auth provider.
 *
 * - Arcadis flavor (`VITE_AUTH0_DISABLED=true`): B2C-backed, no Auth0Provider.
 * - Auth0 enabled: wraps children in Auth0Provider (the Auth0 config previously
 *   owned by `KtrlPlaneAuthProvider`) and bridges its context.
 * - Auth0 enabled but misconfigured: renders children directly (current
 *   behavior — the app works without KtrlPlane auth).
 */
export function AuthProvider({ children }: AuthProviderProps) {
  if (isAuth0Disabled()) {
    return <B2CAuthBridge>{children}</B2CAuthBridge>;
  }

  const domain = import.meta.env.VITE_AUTH0_DOMAIN || "auth.konnektr.io";
  const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;
  const audience =
    import.meta.env.VITE_AUTH0_KTRLPLANE_AUDIENCE ||
    "https://ktrlplane.konnektr.io";
  const redirectUri = window.location.origin;

  if (!domain || !clientId) {
    console.warn(
      "KtrlPlane Auth0 configuration missing. User authentication will be unavailable."
    );
    return <>{children}</>;
  }

  const onRedirectCallback = (appState?: { returnTo?: string }) => {
    // After login, stay on current page or go to returnTo
    window.history.replaceState(
      {},
      document.title,
      appState?.returnTo || window.location.pathname
    );
  };

  return (
    <Auth0Provider
      domain={domain}
      clientId={clientId}
      authorizationParams={{
        redirect_uri: redirectUri,
        audience: audience,
        scope: "openid profile email offline_access",
      }}
      useRefreshTokens={true}
      cacheLocation="localstorage"
      onRedirectCallback={onRedirectCallback}
    >
      <Auth0Bridge>{children}</Auth0Bridge>
    </Auth0Provider>
  );
}
