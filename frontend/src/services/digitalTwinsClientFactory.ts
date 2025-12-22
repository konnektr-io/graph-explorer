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
 */
const createCustomProxyPolicy = (
  adtHost: string,
  pathRewrite: (path: string) => string
): PipelinePolicy => {
  return {
    name: "customProxyPolicy",
    sendRequest: async (
      request: PipelineRequest,
      next: SendRequest
    ): Promise<PipelineResponse> => {
      // Add custom header
      request.headers.set("x-adt-host", adtHost);

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
 * Get the twins proxy path from environment or use default
 * TODO: Configure this properly in environment variables
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
  }) => Promise<string>
): Promise<DigitalTwinsClient> => {
  const { adtHost } = connection;

  // Cache key includes connection ID to support different auth configs for same host
  const cacheKey = `${adtHost}:${connection.id}`;

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

    const customPolicy = createCustomProxyPolicy(adtHost, _pathRewrite);

    const client = new DigitalTwinsClient(
      `https://${adtHost}/`,
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
