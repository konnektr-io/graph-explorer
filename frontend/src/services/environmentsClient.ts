/**
 * Environments API Client
 *
 * Fetches available environments from a proxy endpoint.
 * Environments represent graph backend instances the user has access to,
 * resolved server-side by the proxy (via `x-adt-id` routing).
 *
 * This is a generic alternative to the KtrlPlane-specific resource fetching
 * and can be configured to point at any endpoint that returns an environment list.
 *
 * The response shape is deliberately tolerant: different deployments return
 * different payloads (a bare array, `{ environments: [...] }`, `{ resources: [...] }`,
 * or `{ value: [...] }`), and the identifier may be `id`, `environmentId` or
 * `$dtId` (when environments are themselves digital twins). The id/name fields
 * can additionally be pinned with `VITE_ENVIRONMENTS_ID_FIELD` /
 * `VITE_ENVIRONMENTS_NAME_FIELD` when auto-detection is not good enough.
 */

/**
 * Environment resource, normalised to the shape the app works with.
 */
export interface Environment {
  id: string;
  name: string;
  description?: string;
  status?: string;
  /**
   * Backend host of the graph instance the environment points at (when the
   * deployment exposes it). Display-only: used to classify the environment as
   * an Azure Digital Twins instance or a self-hosted Konnektr Graph.
   */
  adtHost?: string;
}

/**
 * Backend kind of an environment, derived from its `adtHost`.
 *
 * - `azure` — Azure Digital Twins (host ends with `digitaltwins.azure.net`)
 * - `arcadis` — Arcadis-managed self-hosted Konnektr Graph (`.arcadis.com`)
 * - `konnektr` — other self-hosted Konnektr Graph (`.cluster.local`)
 * - `custom` — host present but unrecognised
 */
export type EnvironmentType = "azure" | "arcadis" | "konnektr" | "custom";

const AZURE_HOST_SUFFIX = "digitaltwins.azure.net";
const ARCADIS_HOST_SUFFIX = "arcadis.com";
const KONNEKTR_HOST_SUFFIX = "cluster.local";

/**
 * Classify an environment's backend kind from its `adtHost`.
 *
 * The host is matched by suffix (case-insensitive, protocol-stripped), which is
 * the contract Arcadis deployments rely on: Azure Digital Twins instances end
 * with `digitaltwins.azure.net`, Arcadis-managed Konnektr Graph instances end
 * with `arcadis.com`, and other self-hosted Konnektr Graph instances end with
 * `cluster.local`. Anything else is "custom".
 */
export function classifyEnvironmentHost(adtHost?: string): EnvironmentType {
  if (!adtHost) return "custom";

  const host = adtHost
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");

  if (host.endsWith(AZURE_HOST_SUFFIX)) return "azure";
  if (host.endsWith(ARCADIS_HOST_SUFFIX)) return "arcadis";
  if (host.endsWith(KONNEKTR_HOST_SUFFIX)) return "konnektr";
  return "custom";
}

/** Display labels for {@link EnvironmentType}. */
export const ENVIRONMENT_TYPE_LABELS: Record<EnvironmentType, string> = {
  azure: "Azure",
  arcadis: "Arcadis",
  konnektr: "Konnektr",
  custom: "Custom",
};

/** Raw, unnormalised environment record as returned by the API. */
export type RawEnvironment = Record<string, unknown>;

/**
 * Default endpoint for fetching environments
 */
const DEFAULT_ENVIRONMENTS_ENDPOINT = "/api/environments";

/** Candidate keys for the environment identifier, in priority order. */
const ID_KEYS = ["$dtId", "id", "environmentId", "resource_id"] as const;

/** Candidate keys for the environment display name, in priority order. */
const NAME_KEYS = ["name", "displayName", "title"] as const;

/** Candidate keys for the environment backend host, in priority order. */
const ADT_HOST_KEYS = ["adtHost", "host", "hostName"] as const;

function readString(
  record: RawEnvironment,
  key: string | undefined
): string | undefined {
  if (!key) return undefined;
  const value = record[key];
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number") return String(value);
  return undefined;
}

function readFirstString(
  record: RawEnvironment,
  keys: readonly string[],
  configuredKey?: string
): string | undefined {
  // An explicitly configured field always wins when it yields a value.
  const configured = readString(record, configuredKey);
  if (configured) return configured;

  for (const key of keys) {
    const value = readString(record, key);
    if (value) return value;
  }
  return undefined;
}

/**
 * Normalise a raw environment record into an {@link Environment}.
 *
 * Returns `null` when no usable identifier can be found — such records are
 * dropped rather than surfaced as connections with `id: undefined`.
 */
export function normalizeEnvironment(
  raw: unknown,
  options?: { idField?: string; nameField?: string }
): Environment | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const record = raw as RawEnvironment;

  const idField =
    options?.idField ?? import.meta.env.VITE_ENVIRONMENTS_ID_FIELD ?? undefined;
  const nameField =
    options?.nameField ??
    import.meta.env.VITE_ENVIRONMENTS_NAME_FIELD ??
    undefined;

  const id = readFirstString(record, ID_KEYS, idField);
  if (!id) return null;

  const name = readFirstString(record, NAME_KEYS, nameField) ?? id;
  const description = readString(record, "description");
  const status = readString(record, "status");
  const adtHost = readFirstString(record, ADT_HOST_KEYS);

  return {
    id,
    name,
    ...(description ? { description } : {}),
    ...(status ? { status } : {}),
    ...(adtHost ? { adtHost } : {}),
  };
}

/**
 * Pull the environment array out of whatever envelope the API used.
 */
export function extractEnvironmentList(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;

  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    for (const key of ["environments", "resources", "value", "items"]) {
      const candidate = record[key];
      if (Array.isArray(candidate)) return candidate;
    }
  }

  return [];
}

/**
 * Parse an environments API payload into normalised environments.
 * Records without a resolvable identifier are skipped.
 */
export function parseEnvironmentsResponse(data: unknown): Environment[] {
  const list = extractEnvironmentList(data);

  if (list.length === 0 && data && !Array.isArray(data)) {
    console.warn("Unexpected environments API response format:", data);
    return [];
  }

  const environments: Environment[] = [];
  let skipped = 0;

  for (const entry of list) {
    const environment = normalizeEnvironment(entry);
    if (environment) {
      environments.push(environment);
    } else {
      skipped += 1;
    }
  }

  if (skipped > 0) {
    console.warn(
      `Skipped ${skipped} environment record(s) without a resolvable identifier ` +
        `(expected one of ${ID_KEYS.join(", ")})`
    );
  }

  return environments;
}

/**
 * Resolve the environments endpoint from configuration.
 */
export function getEnvironmentsEndpoint(endpoint?: string): string {
  return (
    endpoint ||
    import.meta.env.VITE_ENVIRONMENTS_ENDPOINT ||
    DEFAULT_ENVIRONMENTS_ENDPOINT
  );
}

/**
 * Fetch all available environments for the authenticated user
 *
 * @param accessToken - Bearer token for authorization
 * @param endpoint - Optional custom endpoint URL
 * @returns Array of normalised Environment objects
 */
export async function fetchEnvironments(
  accessToken: string,
  endpoint?: string
): Promise<Environment[]> {
  const url = getEnvironmentsEndpoint(endpoint);

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

  return parseEnvironmentsResponse(await response.json());
}
