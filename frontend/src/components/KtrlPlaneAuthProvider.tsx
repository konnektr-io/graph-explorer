import { Auth0Provider } from "@auth0/auth0-react";
import type { ReactNode } from "react";

interface KtrlPlaneAuthProviderProps {
  children: ReactNode;
}

/**
 * Auth0 Provider configured for KtrlPlane authentication
 * Uses https://api.ktrlplane.konnektr.io audience for Control Plane API access
 */
export function KtrlPlaneAuthProvider({
  children,
}: KtrlPlaneAuthProviderProps): React.ReactElement {
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
    // Return children without auth provider - app will work without KtrlPlane auth
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
        scope: "openid profile email",
      }}
      useRefreshTokens={true}
      cacheLocation="localstorage"
      onRedirectCallback={onRedirectCallback}
    >
      {children}
    </Auth0Provider>
  );
}
