import { useEffect, useState } from "react";
import { useAuth } from "@/services/auth/authContext";
import { isAuth0Disabled } from "@/config/flavor";
import { fetchGraphResources } from "@/services/ktrlplaneClient";
import { useConnectionStore } from "@/stores/connectionStore";

/**
 * Manages KtrlPlane connection fetching and deduplication.
 * No-ops when Auth0 is disabled for the deployment.
 */
export function KtrlPlaneConnectionManager() {
  const { isAuthenticated, getAccessTokenSilently } = useAuth();
  const setKtrlPlaneConnections = useConnectionStore(
    (state) => state.setKtrlPlaneConnections
  );
  const [hasInitialFetch, setHasInitialFetch] = useState(false);

  // Fetch KtrlPlane connections on mount if authenticated
  useEffect(() => {
    if (isAuth0Disabled() || !isAuthenticated || hasInitialFetch) return;

    const fetchKtrlPlaneResources = async () => {
      try {
        const token = await getAccessTokenSilently({
          authorizationParams: {
            audience:
              import.meta.env.VITE_AUTH0_KTRLPLANE_AUDIENCE ||
              "https://ktrlplane.konnektr.io",
          },
        });
        const resources = await fetchGraphResources(token);
        setKtrlPlaneConnections(resources);
        setHasInitialFetch(true);
      } catch (error) {
        console.error("Failed to fetch KtrlPlane resources:", error);
        setHasInitialFetch(true); // Mark as attempted even if failed
      }
    };

    fetchKtrlPlaneResources();
  }, [
    isAuthenticated,
    hasInitialFetch,
    getAccessTokenSilently,
    setKtrlPlaneConnections,
  ]);

  return null; // This is a logic-only component
}
