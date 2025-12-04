/**
 * KtrlPlane API Client
 * Handles communication with KtrlPlane Control Plane API
 */

const KTRLPLANE_PROXY_BASE = "/api/ktrlplane";

/**
 * KtrlPlane resource type (API response format)
 */
export interface KtrlPlaneResource {
  resource_id: string;
  project_id: string;
  name: string;
  type: string;
  sku: string;
  status: string;
  endpoint?: string;
  settings_json?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/**
 * Fetch all Graph resources the user has access to from KtrlPlane
 */
export async function fetchGraphResources(
  accessToken: string
): Promise<KtrlPlaneResource[]> {
  const response = await fetch(
    `${KTRLPLANE_PROXY_BASE}/resources?resource_type=Konnektr.Graph`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch Graph resources: ${response.statusText}`);
  }

  const data = await response.json();
  return data.resources || [];
}

/**
 * Fetch resources for a specific project
 */
export async function fetchProjectResources(
  accessToken: string,
  projectId: string
): Promise<KtrlPlaneResource[]> {
  const response = await fetch(
    `${KTRLPLANE_PROXY_BASE}/projects/${projectId}/resources`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok) {
    throw new Error(
      `Failed to fetch project resources: ${response.statusText}`
    );
  }

  const data = await response.json();
  return data.resources || [];
}
