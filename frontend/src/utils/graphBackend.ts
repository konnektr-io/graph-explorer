/**
 * Graph backend detection + twin-count parsing helpers.
 *
 * Two backends expose the same ADT-compatible query API:
 * - **Azure Digital Twins (ADT)** — SQL-like query language, no aggregation;
 * - **Konnektr Graph** (self-hosted / KtrlPlane) — accepts raw `MATCH`/`RETURN`
 *    Cypher and supports aggregation (COUNT).
 *
 * The two differ in (a) which query runs efficiently for per-model twin counts
 * and (b) the JSON shape of the returned rows, so backend kind must be resolved
 * consistently before parsing results.
 */
import type { Connection } from "@/stores/connectionStore";
import { classifyEnvironmentHost } from "@/services/environmentsClient";

export type GraphBackendKind = "adt" | "konnektr-graph";

/** Query that lists every twin's model (ADT: projection; no aggregation possible). */
export const ADT_TWIN_COUNT_QUERY = "SELECT $metadata.$model FROM DIGITALTWINS";

/** Query that counts twins per model in one server-side aggregation (Konnektr/Cypher). */
export const CYPHER_TWIN_COUNT_QUERY =
  "MATCH (t:Twin) RETURN t.`$metadata`.`$model` AS _model, count(*) AS _modelCount";

/** Default sample query shown when no connection is selected (Konnektr/Cypher). */
export const DEFAULT_CYPHER_SAMPLE_QUERY = "MATCH (n:Twin) RETURN n LIMIT 5";

/** Default sample query for Azure Digital Twins instances (ADT SQL). */
export const DEFAULT_ADT_SAMPLE_QUERY = "SELECT TOP(5) FROM DIGITALTWINS";

/**
 * Decide which backend a connection points at.
 *
 * Rule: anything that is *not* clearly Azure Digital Twins is treated as a
 * Konnektr Graph environment — ADT hosts end in `digitaltwins.azure.net`
 * (or the connection is explicitly tagged as ADT). Everything else (KtrlPlane
 * resources, `*.konnektr.io`, `cluster.local`, `*.arcadis.com`, localhost)
 * can run plain Cypher and gets the aggregation query.
 */
export function getGraphBackendKind(connection?: Connection | null): GraphBackendKind {
  if (!connection) return "konnektr-graph";

  if (connection.authProvider === "ktrlplane") return "konnektr-graph";
  // Environment-managed connections carry a classified backend kind.
  if (connection.environmentType === "azure") return "adt";
  if (
    connection.environmentType === "arcadis" ||
    connection.environmentType === "cluster" ||
    connection.environmentType === "konnektr"
  )
    return "konnektr-graph";
  // A `konnektr.io` host is always Konnektr Graph (KtrlPlane resources live on *.graph.konnektr.io).
  if (connection.adtHost?.includes("konnektr.io")) return "konnektr-graph";

  const kind = classifyEnvironmentHost(connection.adtHost);
  if (kind === "azure") return "adt";
  if (kind === "arcadis" || kind === "cluster" || kind === "konnektr")
    return "konnektr-graph";

  // Unmatched host (no host set, localhost, bare intranet host): anything not
  // Azure Digital Twins is Konnektr Graph.
  if (connection.adtHost) {
    const host = connection.adtHost.toLowerCase();
    if (!host.endsWith("digitaltwins.azure.net")) return "konnektr-graph";
    return "adt";
  }
  return "konnektr-graph";
}

export function isAdtBackend(connection?: Connection | null): boolean {
  return getGraphBackendKind(connection) === "adt";
}

/** Query + parse-mode for per-model twin counts on the current backend. */
export function getTwinCountQuery(connection?: Connection | null): {
  query: string;
  isCypher: boolean;
} {
  if (isAdtBackend(connection)) {
    return { query: ADT_TWIN_COUNT_QUERY, isCypher: false };
  }
  return { query: CYPHER_TWIN_COUNT_QUERY, isCypher: true };
}

const DTMI_HINT = "dtmi:";

/** ADT model ids always start with `dtmi:` — a cheap, reliable discriminator. */
function looksLikeModelId(value: unknown): value is string {
  return typeof value === "string" && value.trim().toLowerCase().startsWith(DTMI_HINT);
}

/** Pull the model id out of a row regardless of the backend's projection shape. */
function extractModelId(row: Record<string, unknown>): string | null {
  // ADT shape: `$metadata.$model`.
  const metadata = row.$metadata;
  if (metadata && typeof metadata === "object") {
    const model = (metadata as Record<string, unknown>).$model;
    if (looksLikeModelId(model)) return model;
  }
  // Direct $model key.
  if (looksLikeModelId(row.$model)) return row.$model;
  // Cypher aliased column (backticked names can surface as `t.$metadata.$model`),
  // or any dtmi-typed value in the row.
  for (const val of Object.values(row)) {
    if (looksLikeModelId(val)) return val;
  }
  return null;
}

/** Best-effort number out of a Cypher COUNT column (number, numeric string, or Integer). */
function toCount(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (!Number.isNaN(n)) return n;
  }
  // neo4j-style Integer object ({ low, high } / toNumber()).
  if (value && typeof value === "object") {
    const v = value as { low?: number; high?: number; toNumber?: () => number };
    if (typeof v.toNumber === "function") {
      try {
        return v.toNumber();
      } catch {
        /* fall through */
      }
    }
    if (typeof v.low === "number") return v.low;
  }
  return null;
}

/**
 * Turn a page of query rows into `{ modelId: count }`.
 *
 * @param rows     Raw `page.value` rows from the Azure twin-query iterator.
 * @param isCypher True when the query was the Konlektr-aggregation query (each
 *                 row already carries a grouped count); false for the ADT
 *                 projection (each row stands for one twin, count by +1).
 */
export function parseTwinCounts(rows: unknown[], isCypher: boolean): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const raw of rows) {
    if (raw == null || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;

    if (isCypher) {
      const modelId = String(row._model ?? row._modelId ?? extractModelId(row) ?? "");
      if (!modelId) continue;
      const countVal = row._modelCount ?? row.count ?? row["count(*)"];
      counts[modelId] = countVal == null ? 1 : toCount(countVal) ?? 1;
      continue;
    }

    // ADT projection — each row is one twin.
    const modelId = extractModelId(row);
    if (modelId) counts[modelId] = (counts[modelId] || 0) + 1;
  }

  return counts;
}
