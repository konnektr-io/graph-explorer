import { useEffect, useState } from "react";
import { fetchEnvironments } from "@/services/environmentsClient";
import {
  acquireB2CToken,
  environmentToConnection,
  getB2CScope,
  getMsalConfig,
} from "@/services/environmentRouting";
import { useConnectionStore } from "@/stores/connectionStore";

/**
 * Manages environment-based connections for proxy-resolved deployments.
 *
 * Fetches available environments from the configured environments endpoint
 * (`VITE_ENVIRONMENTS_ENDPOINT`) and populates the connection store with them.
 * Connections created here route via the `x-adt-id` header; the proxy resolves
 * the backend host internally and enforces RBAC on the user's token.
 *
 * No-ops entirely when `VITE_B2C_CLIENT_ID`, `VITE_B2C_AUTHORITY` or
 * `VITE_B2C_SCOPE` are unset — this is what keeps the public Konnektr build
 * unaffected by the feature.
 *
 * Must be used within a component tree that has access to the connection store.
 * The component renders nothing — it's a logic-only orchestrator.
 */
export function EnvironmentConnectionManager() {
  const setEnvironmentConnections = useConnectionStore(
    (state) => state.setEnvironmentConnections
  );
  const [hasInitialFetch, setHasInitialFetch] = useState(false);

  useEffect(() => {
    if (hasInitialFetch) return;

    // Not configured for this deployment — nothing to do.
    if (!getMsalConfig()) {
      setHasInitialFetch(true);
      return;
    }

    const scope = getB2CScope();
    if (!scope) {
      console.error(
        "VITE_B2C_SCOPE is not configured — environment connections are disabled. " +
          "Set it to the platform API scope the proxy accepts."
      );
      setHasInitialFetch(true);
      return;
    }

    let cancelled = false;

    const loadEnvironments = async () => {
      try {
        const token = await acquireB2CToken([scope]);
        if (!token) {
          console.warn("No B2C token available — skipping environment fetch");
          return;
        }

        const environments = await fetchEnvironments(token);
        if (cancelled) return;

        setEnvironmentConnections(environments.map(environmentToConnection));
      } catch (error) {
        console.error("Failed to fetch environments:", error);
      } finally {
        if (!cancelled) setHasInitialFetch(true);
      }
    };

    loadEnvironments();

    return () => {
      cancelled = true;
    };
  }, [hasInitialFetch, setEnvironmentConnections]);

  return null; // Logic-only component
}
