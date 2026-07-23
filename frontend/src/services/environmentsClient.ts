/**
 * Environments API Client
 *
 * Fetches available environments from a proxy endpoint.
 * Environments represent graph backend instances the user has access to,
 * resolved server-side by the proxy (via x-adt-id routing).
 *
 * This is a generic alternative to the KtrlPlane-specific resource fetching
 * and can be configured to point at any endpoint that returns an environment list.
 */

/**
 * Environment resource (API response format)
 */
export interface Environment {
  id: string;
  name: string;
  description?: string;
  status?: string;
}

/**
 * Default endpoint for fetching environments
 */
const DEFAULT_ENVIRONMENTS_ENDPOINT = "/api/environments";

/**
 * Fetch all available environments for the authenticated user
 *
 * @param accessToken - Bearer token for authorization
 * @param endpoint - Optional custom endpoint URL
 * @returns Array of Environment objects
 */
export async function fetchEnvironments(
  accessToken: string,
  endpoint?: string
): Promise<Environment[]> {
  const url =
    endpoint ||
    import.meta.env.VITE_ENVIRONMENTS_ENDPOINT ||
    DEFAULT_ENVIRONMENTS_ENDPOINT;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch environments: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();

  // Support both { environments: [...] } and [...] response formats
  if (Array.isArray(data)) {
    return data;
  }

  if (data.environments && Array.isArray(data.environments)) {
    return data.environments;
  }

  if (data.resources && Array.isArray(data.resources)) {
    return data.resources;
  }

  console.warn("Unexpected environments API response format:", data);
  return [];
}
