import { useAuth0 } from "@auth0/auth0-react";
import { DigitalTwinsClient } from "@azure/digital-twins-core";
import { Auth0TokenCredential } from "@/services/auth/tokenCredentialFactory";
import { digitalTwinsClientFactoryLegacy } from "@/services/digitalTwinsClientFactory";
import { useConnectionStore } from "@/stores/connectionStore";
import { useMemo } from "react";

/**
 * Hook that provides an authenticated DigitalTwinsClient using Auth0.
 * This hook should be used in components that need to interact with the Digital Twins API.
 */
export function useDigitalTwinsClient(): DigitalTwinsClient | null {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0();
  const currentEnvironment = useConnectionStore((state) =>
    state.getCurrentConnection()
  );

  const client = useMemo(() => {
    if (!isAuthenticated || !currentEnvironment) {
      return null;
    }
    const audience = currentEnvironment.authConfig?.audience || "";
    const tokenCredential = new Auth0TokenCredential(
      getAccessTokenSilently,
      audience
    );
    return digitalTwinsClientFactoryLegacy(
      currentEnvironment.adtHost,
      tokenCredential
    );
  }, [isAuthenticated, currentEnvironment, getAccessTokenSilently]);

  return client;
}
