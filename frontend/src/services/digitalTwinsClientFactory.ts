import { DigitalTwinsClient } from "@azure/digital-twins-core";
import type {
  PipelinePolicy,
  PipelineRequest,
  PipelineResponse,
  SendRequest,
} from "@azure/core-rest-pipeline";
import type { Connection } from "@/stores/connectionStore";
import {
  getTokenCredential,
  KtrlPlaneGraphTokenCredential,
} from "@/services/auth";

/**
 * Pipeline policy that rewrites URLs and adds custom headers
 *
 * Supports two routing modes:
 * - **Host routing** (`x-adt-host`): The proxy routes to the specified backend hostname directly
 * - **Environment routing** (`x-adt-id`): The proxy resolves the backend hostname internally
 *   from the environment identifier (e.g., for proxy-resolved or tenant-aware deployments)
 */
const createCustomProxyPolicy = (
  adtHost: string | undefined,
  environmentId: string | undefined,
  pathRewrite: (path: string) => string
): PipelinePolicy => {
  return {
    name: "customProxyPolicy",
    sendRequest: async (
      request: PipelineRequest,
      next: SendRequest
    ): Promise<PipelineResponse> => {
      // Add routing header based on connection type
      if (environmentId) {
        // Environment-based routing: proxy resolves the backend host internally
        request.headers.set("x-adt-id", environmentId);
      } else if (adtHost) {
        // Direct host routing: proxy forwards to the specified backend host
        request.headers.set("x-adt-host", adtHost);
      }

      // Rewrite URL
      const url = new URL(request.url);
      const baseUrl = new URL(window.location.origin);
      url.host = baseUrl.host;
      url.pathname = pathRewrite(url.pathname);
      url.protocol = baseUrl.protocol;
      request.url = url.toString();

      // Pass to next policy in pipeline
      return next(request);
    },
  };
};

/** Digital Twins Clients cache object */
const digitalTwinsClients: { [adtHost: string]: DigitalTwinsClient } = {};

/**
 * Get the twins proxy path the API requests are rewritten through.
 * Configured per deployment via the `VITE_TWINS_PROXY` build arg.
 */
const getTwinsProxyPath = (): string => {
  return import.meta.env.VITE_TWINS_PROXY || "/api/proxy";
};

/**
 * Digital Twins client factory that returns cached Digital Twins Client
 *
 * @param connection - Connection with auth provider and config
 * @param getAccessTokenSilently - Optional Auth0 silent token getter for KtrlPlane connections
 * @param getAccessTokenWithPopup - Optional Auth0 popup token getter for KtrlPlane connections
 * @returns Promise that resolves to DigitalTwinsClient
 *
 * Note: This function is async because it needs to initialize MSAL if using MSAL auth
 */
export const digitalTwinsClientFactory = async (
  connection: Connection,
  getAccessTokenSilently?: (options?: {
    authorizationParams?: { audience?: string; scope?: string };
  }) => Promise<string>,
  getAccessTokenWithPopup?: (options?: {
    authorizationParams?: { audience?: string; scope?: string };
  }) => Promise<string | undefined>
): Promise<DigitalTwinsClient> => {
  const { adtHost, environmentId } = connection;

  if (!adtHost && !environmentId) {
    throw new Error(
      `Connection "${connection.id}" has neither adtHost nor environmentId set`
    );
  }

  // Environment-routed requests are rewritten to the current origin by the
  // pipeline policy, so there is no real backend host to build a URL from —
  // use the current origin as the (ignored) base.
  const baseHost = adtHost ?? window.location.host;

  // Cache key is namespaced by routing mode so an environment-routed connection
  // can never collide with a host-routed one that happens to share the origin.
  // The connection ID keeps it unique per environment and per auth config.
  const cacheKey = environmentId
    ? `env:${environmentId}:${connection.id}`
    : `host:${adtHost}:${connection.id}`;

  // For KtrlPlane connections, always create a new client to ensure fresh Auth0 context
  // For other auth providers, use cached client if available
  const shouldCache = connection.authProvider !== "ktrlplane";

  if (!shouldCache || !digitalTwinsClients[cacheKey]) {
    let tokenCredential;

    // Handle KtrlPlane-managed connections
    if (connection.authProvider === "ktrlplane") {
      if (!getAccessTokenSilently || !getAccessTokenWithPopup) {
        throw new Error(
          "KtrlPlane connections require Auth0 context. Please sign in."
        );
      }
      tokenCredential = new KtrlPlaneGraphTokenCredential(
        getAccessTokenSilently,
        getAccessTokenWithPopup
      );
    } else {
      // Get token credential based on auth provider
      tokenCredential = await getTokenCredential(connection);
    }

    // Only throw if tokenCredential is missing and authProvider is not 'none'
    if (!tokenCredential) {
      throw new Error("No authentication configured for this connection");
    }

    // find all consecutive forward slashes (two or more)
    const _pathRegex = /(\/){2,}/g;
    const _pathRewrite = (path: string) =>
      `${getTwinsProxyPath()}${path}`.replace(_pathRegex, "/");

    const customPolicy = createCustomProxyPolicy(
      adtHost,
      environmentId,
      _pathRewrite
    );

    const client = new DigitalTwinsClient(
      `https://${baseHost}/`,
      tokenCredential,
      {
        allowInsecureConnection: window.location.hostname === "localhost",
        additionalPolicies: [{ policy: customPolicy, position: "perCall" }],
      }
    );

    if (shouldCache) {
      digitalTwinsClients[cacheKey] = client;
    }

    return client;
  }

  return digitalTwinsClients[cacheKey];
};
