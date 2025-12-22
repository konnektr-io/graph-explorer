import { useAuth0 } from "@auth0/auth0-react";
import type { Connection } from "@/stores/connectionStore";
import { digitalTwinsClientFactory } from "@/services/digitalTwinsClientFactory";
import type { DigitalTwinsClient } from "@azure/digital-twins-core";

/**
 * Hook to get Digital Twins client with Auth0 context
 * Use this instead of calling digitalTwinsClientFactory directly
 */
export function useDigitalTwinsClient() {
  const { getAccessTokenSilently, getAccessTokenWithPopup } = useAuth0();

  // Wrapper to match expected signature
  const getTokenWithPopup = async (options?: {
    authorizationParams?: { audience?: string; scope?: string };
  }) => {
    const token = await getAccessTokenWithPopup(options);
    if (!token) throw new Error("Failed to get token with popup");
    return token;
  };

  const getClient = async (
    connection: Connection
  ): Promise<DigitalTwinsClient> => {
    // For KtrlPlane connections, pass the Auth0 token getter
    if (connection.authProvider === "ktrlplane") {
      /* if (!isAuthenticated) {
        throw new Error("Please sign in to access Konnektr resources");
      } */
      return digitalTwinsClientFactory(
        connection,
        getAccessTokenSilently,
        getTokenWithPopup
      );
    }

    // For other auth providers, no Auth0 context needed
    return digitalTwinsClientFactory(connection);
  };

  return { getClient };
}
