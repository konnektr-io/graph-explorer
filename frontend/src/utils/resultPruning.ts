/**
 * Prune deleted twins and relationships out of raw query results.
 *
 * The table and graph views are both rendered from `queryStore.queryResults` —
 * *not* from the twins store. So deleting a twin removes it from the store and
 * the graph keeps drawing it until the query is re-run. These helpers rewrite
 * the result rows in place, so a delete is reflected immediately in every view
 * without a refetch.
 *
 * Results are not a flat list of entities. A query can return:
 *  - flat rows: `[{ $dtId, $metadata }, { $relationshipId, ... }]`
 *  - nested rows: `[{ building: {...}, room: {...}, relationship: {...} }]`
 *  - arrays of either of the above
 *
 * so pruning recurses and rebuilds containers as needed.
 */

/** A row is a twin when it carries a `$dtId`; a relationship when it carries a `$relationshipId`. */
function isTwin(value: Record<string, unknown>): boolean {
  return typeof value.$dtId === "string";
}

function isRelationship(value: Record<string, unknown>): boolean {
  return typeof value.$relationshipId === "string";
}

/** Keys reserved by ADT for a twin or relationship's own identity. */
const RESERVED_KEYS = new Set([
  "$dtId",
  "$metadata",
  "$relationshipId",
  "$relationshipName",
  "$sourceId",
  "$targetId",
  "$etag",
]);

/**
 * True when a row is *only* a twin or relationship record — no payload columns
 * of its own (a Cypher `RETURN t` can add `name`/`distance`/etc.).
 *
 * Such a row is removed wholesale when its entity is gone. A row that carries
 * extra columns is kept: dropping it would delete data the query author asked
 * for, and the entity it describes is gone from the graph anyway.
 */
function isPureEntityRow(value: Record<string, unknown>): boolean {
  return Object.keys(value).every((key) => RESERVED_KEYS.has(key));
}

/**
 * Recursively rebuild `value` with deleted entities removed.
 *
 * Returns the rebuilt value, or `undefined` when the value itself should be
 * dropped (an entity row that is entirely a deleted twin/relationship).
 */
function pruneValue(
  value: unknown,
  deletedTwinIds: ReadonlySet<string>,
  deletedRelationshipIds: ReadonlySet<string>
): unknown {
  if (Array.isArray(value)) {
    return value
      .map((item) => pruneValue(item, deletedTwinIds, deletedRelationshipIds))
      .filter((item) => item !== undefined);
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  const record = value as Record<string, unknown>;

  // A deleted entity: drop the whole row, but only when it is a pure entity
  // record (see isPureEntityRow).
  if (isTwin(record) && deletedTwinIds.has(record.$dtId as string)) {
    return isPureEntityRow(record) ? undefined : {};
  }
  if (
    isRelationship(record) &&
    deletedRelationshipIds.has(record.$relationshipId as string)
  ) {
    return isPureEntityRow(record) ? undefined : {};
  }

  // Not a deleted entity — recurse into its properties. A relationship's own
  // $sourceId/$targetId must survive so the row stays navigable.
  const next: Record<string, unknown> = {};
  let changed = false;
  for (const [key, child] of Object.entries(record)) {
    const prunedChild = pruneValue(child, deletedTwinIds, deletedRelationshipIds);
    if (prunedChild === undefined) {
      changed = true;
      continue;
    }
    if (prunedChild !== child) changed = true;
    next[key] = prunedChild;
  }

  // A wrapper row left with nothing to show is noise — drop it entirely so the
  // results table does not keep a row of empty cells.
  if (changed && Object.keys(next).length === 0) return undefined;

  return changed ? next : record;
}

/**
 * Remove deleted entities from query results.
 *
 * @param results  Raw rows from `queryStore.queryResults`.
 * @param twins    Ids of deleted twins.
 * @param relationships Ids of deleted relationships.
 */
export function pruneDeletedFromResults(
  results: unknown[] | null,
  twins: ReadonlySet<string>,
  relationships: ReadonlySet<string>
): unknown[] | null {
  if (!results) return results;
  if (twins.size === 0 && relationships.size === 0) return results;

  const pruned = (
    pruneValue(results, twins, relationships) as unknown[] | undefined
  )?.filter((row) => row !== undefined);

  return pruned ?? [];
}
