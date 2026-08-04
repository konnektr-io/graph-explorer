import { isEnvironmentRoutingConfigured } from "@/services/environmentRouting";

/**
 * Deployment flavor configuration.
 *
 * The Arcadis deployment disables/modifies Konnektr-specific functionality via
 * build-time environment variables. All functions read `import.meta.env` and are
 * pure, mirroring the style of `environmentRouting.ts`.
 *
 * The default build (no new vars set) keeps every feature enabled, so the public
 * Konnektr build is byte-identical in behavior.
 */

/**
 * True when the Konnektr Auth0 login is disabled for this build.
 * The Sign In button then triggers Azure B2C sign-in instead.
 */
export function isAuth0Disabled(): boolean {
  return import.meta.env.VITE_AUTH0_DISABLED === "true";
}

/**
 * True when the Connections dialog (Add button, custom connection form and the
 * "Deploy on KtrlPlane" section) is hidden. Environments are auto-fetched and
 * no manual connections are needed.
 */
export function isCustomConnectionsDisabled(): boolean {
  return import.meta.env.VITE_CUSTOM_CONNECTIONS_DISABLED === "true";
}

/**
 * True when the build is the Arcadis flavor. Implies environment-driven
 * connections and that Konnektr-specific flows should be hidden or adapted.
 */
export function isArcadisFlavor(): boolean {
  return (
    isAuth0Disabled() ||
    isCustomConnectionsDisabled() ||
    isEnvironmentRoutingConfigured()
  );
}
