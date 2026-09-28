import { describe, it, expect } from "vitest";
import { pruneDeletedFromResults } from "@/utils/resultPruning";

const twin = (id: string, extra: Record<string, unknown> = {}) => ({
  $dtId: id,
  $metadata: { $model: "dtmi:com:x;1" },
  ...extra,
});

const rel = (id: string, source: string, target: string) => ({
  $relationshipId: id,
  $relationshipName: "contains",
  $sourceId: source,
  $targetId: target,
});

describe("pruneDeletedFromResults", () => {
  it("returns the input untouched when nothing was deleted", () => {
    const results = [twin("a"), twin("b")];
    expect(pruneDeletedFromResults(results, new Set(), new Set())).toBe(results);
  });

  it("passes null through", () => {
    expect(pruneDeletedFromResults(null, new Set(["a"]), new Set())).toBeNull();
  });

  it("removes a deleted twin from flat results", () => {
    const results = [twin("a"), twin("b"), twin("c")];
    const pruned = pruneDeletedFromResults(results, new Set(["b"]), new Set());
    expect(pruned).toEqual([twin("a"), twin("c")]);
  });

  it("removes a deleted relationship from flat results", () => {
    const results = [rel("r1", "a", "b"), rel("r2", "b", "c")];
    const pruned = pruneDeletedFromResults(results, new Set(), new Set(["r1"]));
    expect(pruned).toEqual([rel("r2", "b", "c")]);
  });

  it("removes nested twins and relationships from wrapper rows", () => {
    const results = [
      {
        building: twin("b1"),
        room: twin("r1"),
        relationship: rel("rel1", "b1", "r1"),
      },
      { other: twin("z1") },
    ];

    const pruned = pruneDeletedFromResults(
      results,
      new Set(["r1"]),
      new Set(["rel1"])
    );

    // The wrapper row survives with the deleted room/relationship gone.
    expect(pruned).toEqual([{ building: twin("b1") }, { other: twin("z1") }]);
  });

  it("drops a wrapper row entirely once every key is pruned away", () => {
    const results = [{ room: twin("r1") }];
    expect(pruneDeletedFromResults(results, new Set(["r1"]), new Set())).toEqual(
      []
    );
  });

  it("prunes entities inside arrays without disturbing siblings", () => {
    const results = [{ rooms: [twin("r1"), twin("r2")] }];
    expect(
      pruneDeletedFromResults(results, new Set(["r1"]), new Set())
    ).toEqual([{ rooms: [twin("r2")] }]);
  });

  it("keeps a row that carries its own payload columns", () => {
    // `MATCH (t) RETURN t, t.name` adds columns to the row itself. The twin is
    // gone, but the row is not *only* a twin, so the other columns must stay.
    const results = [{ t: twin("a"), name: "Pump A", distance: 3 }];
    const pruned = pruneDeletedFromResults(results, new Set(["a"]), new Set());
    expect(pruned).toEqual([{ name: "Pump A", distance: 3 }]);
  });

  it("keeps a relationship row whose source and target survived", () => {
    const results = [twin("a"), twin("b"), rel("r1", "a", "b")];
    const pruned = pruneDeletedFromResults(results, new Set(["a"]), new Set());
    // The twin is gone but the relationship row is untouched (it is its own
    // entity; only its endpoints no longer resolve in the graph).
    expect(pruned).toEqual([twin("b"), rel("r1", "a", "b")]);
  });

  it("preserves a deleted twin's $metadata sibling keys when the row is not pure", () => {
    const results = [{ t: twin("a", { $etag: "1" }), name: "Pump A" }];
    const pruned = pruneDeletedFromResults(results, new Set(["a"]), new Set());
    expect(pruned).toEqual([{ name: "Pump A" }]);
  });

  it("does not mutate the original results", () => {
    const results = [{ building: twin("b1"), room: twin("r1") }];
    const snapshot = structuredClone(results);
    pruneDeletedFromResults(results, new Set(["r1"]), new Set());
    expect(results).toEqual(snapshot);
  });

  it("handles twins and relationships deleted together", () => {
    const results = [twin("a"), twin("b"), rel("r1", "a", "b")];
    const pruned = pruneDeletedFromResults(
      results,
      new Set(["a", "b"]),
      new Set(["r1"])
    );
    expect(pruned).toEqual([]);
  });

  it("leaves unrelated data alone", () => {
    const results = [{ total: 42, label: "pumps" }];
    const pruned = pruneDeletedFromResults(results, new Set(["a"]), new Set());
    expect(pruned).toEqual(results);
  });
});
