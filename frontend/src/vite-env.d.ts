/// <reference types="vite/client" />

/**
 * Build-time configuration.
 *
 * All values are baked into the bundle at build time via Docker build args,
 * so they must be public (no secrets). Deployment-specific values are supplied
 * per GitHub Environment in the build workflow.
 */
interface ImportMetaEnv {
  // Platform auth (Konnektr / KtrlPlane)
  readonly VITE_AUTH0_DOMAIN?: string;
  readonly VITE_AUTH0_CLIENT_ID?: string;
  readonly VITE_AUTH0_KTRLPLANE_AUDIENCE?: string;
  readonly VITE_AUTH0_GRAPH_AUDIENCE?: string;
  readonly VITE_AUTH0_GRAPH_SCOPE?: string;

  // API routing
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_API_BASE_PATH?: string;
  /** Path the Digital Twins API requests are rewritten through. */
  readonly VITE_TWINS_PROXY?: string;

  // Environment-based routing (x-adt-id)
  /** Endpoint returning the list of environments the user can access. */
  readonly VITE_ENVIRONMENTS_ENDPOINT?: string;
  /** Group label shown in the connection selector. Defaults to "Environments". */
  readonly VITE_ENVIRONMENTS_LABEL?: string;
  /** Override for the identifier field in the environments response. */
  readonly VITE_ENVIRONMENTS_ID_FIELD?: string;
  /** Override for the display-name field in the environments response. */
  readonly VITE_ENVIRONMENTS_NAME_FIELD?: string;

  // Azure AD B2C (environment-based connections)
  readonly VITE_B2C_CLIENT_ID?: string;
  readonly VITE_B2C_AUTHORITY?: string;
  readonly VITE_B2C_KNOWN_AUTHORITY?: string;
  /** Platform API scope the proxy accepts. Required — no default. */
  readonly VITE_B2C_SCOPE?: string;

  // Analytics — empty disables tracking and the cookie consent banner
  readonly VITE_GTM_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
