import { useAuth } from "@/services/auth/authContext";
import type { Connection } from "@/stores/connectionStore";
import { digitalTwinsClientFactory } from "@/services/digitalTwinsClientFactory";
import type { DigitalTwinsClient } from "@azure/digital-twins-core";

/**
 * Hook to get Digital Twins client with Auth0 context
 * Use this instead of calling digitalTwinsClientFactory directly
 */
export function useDigitalTwinsClient() {
  const { getAccessTokenSilently, getAccessTokenWithPopup } = useAuth();

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
        getAccessTokenWithPopup
      );
    }

    // For other auth providers, no Auth0 context needed
    return digitalTwinsClientFactory(connection);
  };

  return { getClient };
}
