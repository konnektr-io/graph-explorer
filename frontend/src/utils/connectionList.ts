/**
 * Ordering and filtering helpers for the connection picker.
 *
 * The connection selector merges three sources — KtrlPlane-managed,
 * environment-managed and locally added connections. On deployments where a
 * user has access to many environments that merged list grows long enough that
 * scrolling to the right entry becomes the bottleneck, so the picker sorts the
 * entries alphabetically and offers a filter box.
 *
 * Kept as pure functions (and out of the component module, per the repo's
 * React Fast Refresh convention) so the behaviour is unit-testable without a
 * DOM.
 */

/**
 * The minimum shape the helpers need. A `Connection` satisfies this
 * structurally (`id: string`, `name: string`).
 */
export interface NamedItem {
  name: string;
  /** Secondary key — the picker also matches the filter against this. */
  id?: string;
}

/**
 * Sort items alphabetically by `name`.
 *
 * - Case-insensitive (`sensitivity: "base"`) so casing never affects the order.
 * - Numeric-aware (`numeric: true`) so `env-2` sorts BEFORE `env-10` rather
 *   than after it, which is what people expect from numbered environments.
 * - Ties break on `id` and finally on the original position, so the result is
 *   fully deterministic regardless of the order the sources were merged in.
 *
 * Returns a new array; the input is never mutated (it usually comes straight
 * from the store).
 */
export function sortConnectionsByName<T extends NamedItem>(
  items: readonly T[]
): T[] {
  const collator = { sensitivity: "base", numeric: true } as const;

  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const byName = a.item.name.localeCompare(b.item.name, undefined, collator);
      if (byName !== 0) return byName;

      const byId = (a.item.id ?? "").localeCompare(
        b.item.id ?? "",
        undefined,
        collator
      );
      if (byId !== 0) return byId;

      return a.index - b.index;
    })
    .map(({ item }) => item);
}

/**
 * Filter items by a free-text query.
 *
 * Matches case-insensitively against the display `name` and, when present, the
 * `id` — the KtrlPlane group renders its connection id next to the name, so
 * both are visible text a user may search for. A blank/whitespace-only query is
 * a no-op that returns a shallow copy.
 */
export function filterConnections<T extends NamedItem>(
  items: readonly T[],
  query: string
): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...items];

  return items.filter(
    (item) =>
      item.name.toLowerCase().includes(needle) ||
      (item.id ? item.id.toLowerCase().includes(needle) : false)
  );
}

/**
 * Sort then filter — the order the picker renders every group in.
 */
export function orderConnections<T extends NamedItem>(
  items: readonly T[],
  query: string
): T[] {
  return filterConnections(sortConnectionsByName(items), query);
}
