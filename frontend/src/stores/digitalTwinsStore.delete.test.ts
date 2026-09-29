import { describe, it, expect, vi, beforeEach } from "vitest";

// `vi.mock` factories are hoisted above module-level declarations, so the
// client object has to be hoisted with them or it is still in TDZ when the
// factory runs.
const { client, pruneDeletedTwins, pruneDeletedRelationships } = vi.hoisted(
  () => ({
    client: {
      deleteDigitalTwin: vi.fn(),
      deleteRelationship: vi.fn(),
      queryTwins: vi.fn(),
    },
    pruneDeletedTwins: vi.fn(),
    pruneDeletedRelationships: vi.fn(),
  })
);

vi.mock("@/services/digitalTwinsClientFactory", () => ({
  digitalTwinsClientFactory: vi.fn().mockResolvedValue(client),
}));

vi.mock("@/stores/connectionStore", () => ({
  useConnectionStore: {
    getState: () => ({
      getCurrentConnection: () => ({ id: "c1", adtHost: "h.example.com" }),
    }),
  },
}));

vi.mock("@/stores/queryStore", () => ({
  useQueryStore: { getState: () => ({ pruneDeletedTwins, pruneDeletedRelationships }) },
}));

import { useDigitalTwinsStore } from "@/stores/digitalTwinsStore";

/** Feed the query iterator the rows the relationship lookup should return. */
const stubRelationshipQuery = (rows: unknown[]) => {
  client.queryTwins.mockReturnValue({
    byPage: () => ({
      async *[Symbol.asyncIterator]() {
        yield { value: rows };
      },
    }),
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  client.deleteDigitalTwin.mockResolvedValue(undefined);
  client.deleteRelationship.mockResolvedValue(undefined);
  useDigitalTwinsStore.setState({
    twins: [],
    relationships: [],
    selectedTwinId: null,
    error: null,
    isLoading: false,
  });
});

describe("deleteTwin", () => {
  it("deletes every touching relationship before the twin itself", async () => {
    stubRelationshipQuery([
      { $relationshipId: "r1", $sourceId: "pump-1", $targetId: "room-1" },
      { $relationshipId: "r2", $sourceId: "room-1", $targetId: "pump-1" },
    ]);

    await useDigitalTwinsStore.getState().deleteTwin("pump-1");

    // An INCOMING relationship is addressed by its own source (room-1), which
    // is what makes the cascade work — deleting "pump-1"/r2 would 404.
    expect(client.deleteRelationship).toHaveBeenCalledWith("pump-1", "r1");
    expect(client.deleteRelationship).toHaveBeenCalledWith("room-1", "r2");
    expect(client.deleteDigitalTwin).toHaveBeenCalledWith("pump-1");
  });

  it("removes the twin and its relationships from local state", async () => {
    stubRelationshipQuery([]);
    useDigitalTwinsStore.setState({
      twins: [
        { $dtId: "pump-1", $metadata: { $model: "m" } },
        { $dtId: "pump-2", $metadata: { $model: "m" } },
      ] as never,
      relationships: [
        { $relationshipId: "r1", $sourceId: "pump-1", $targetId: "pump-2" },
      ] as never,
      selectedTwinId: "pump-1",
    });

    await useDigitalTwinsStore.getState().deleteTwin("pump-1");

    const state = useDigitalTwinsStore.getState();
    expect(state.twins.map((t) => t.$dtId)).toEqual(["pump-2"]);
    expect(state.relationships).toEqual([]);
    expect(state.selectedTwinId).toBeNull();
  });

  it("leaves another twin selected", async () => {
    stubRelationshipQuery([]);
    useDigitalTwinsStore.setState({ selectedTwinId: "pump-2" });

    await useDigitalTwinsStore.getState().deleteTwin("pump-1");

    expect(useDigitalTwinsStore.getState().selectedTwinId).toBe("pump-2");
  });

  it("prunes the deleted twin and its relationships from query results", async () => {
    stubRelationshipQuery([
      { $relationshipId: "r1", $sourceId: "pump-1", $targetId: "room-1" },
    ]);

    await useDigitalTwinsStore.getState().deleteTwin("pump-1");

    // Otherwise the table and graph keep drawing what no longer exists.
    expect(pruneDeletedTwins).toHaveBeenCalledWith(["pump-1"]);
    expect(pruneDeletedRelationships).toHaveBeenCalledWith(["r1"]);
  });

  it("throws and keeps the twin when the twin delete fails", async () => {
    stubRelationshipQuery([]);
    client.deleteDigitalTwin.mockRejectedValue(new Error("Twin not found"));

    await expect(
      useDigitalTwinsStore.getState().deleteTwin("pump-1")
    ).rejects.toThrow("Twin not found");

    expect(useDigitalTwinsStore.getState().error).toBe("Twin not found");
  });

  it("does not prune anything when a relationship delete fails", async () => {
    stubRelationshipQuery([
      { $relationshipId: "r1", $sourceId: "pump-1", $targetId: "room-1" },
    ]);
    client.deleteRelationship.mockRejectedValue(new Error("Relationship in use"));

    await expect(
      useDigitalTwinsStore.getState().deleteTwin("pump-1")
    ).rejects.toThrow("Relationship in use");

    // Partial state must not be pruned — the twin is still there.
    expect(pruneDeletedTwins).not.toHaveBeenCalled();
    expect(client.deleteDigitalTwin).not.toHaveBeenCalled();
  });
});

describe("deleteRelationship", () => {
  beforeEach(() => {
    useDigitalTwinsStore.setState({
      relationships: [
        { $relationshipId: "r1", $sourceId: "a", $targetId: "b" },
        { $relationshipId: "r2", $sourceId: "a", $targetId: "c" },
      ] as never,
    });
  });

  it("deletes only the addressed relationship", async () => {
    await useDigitalTwinsStore.getState().deleteRelationship("a", "r1");

    expect(client.deleteRelationship).toHaveBeenCalledWith("a", "r1");
    expect(
      useDigitalTwinsStore.getState().relationships.map((r) => r.$relationshipId)
    ).toEqual(["r2"]);
  });

  it("does not delete a same-id relationship from a different source twin", async () => {
    // ADT scopes relationship ids per source twin: a/r1 and b/r1 coexist.
    useDigitalTwinsStore.setState({
      relationships: [
        { $relationshipId: "r1", $sourceId: "a", $targetId: "b" },
        { $relationshipId: "r1", $sourceId: "b", $targetId: "c" },
      ] as never,
    });

    await useDigitalTwinsStore.getState().deleteRelationship("a", "r1");

    expect(
      useDigitalTwinsStore.getState().relationships.map(
        (r) => `${r.$sourceId}/${r.$relationshipId}`
      )
    ).toEqual(["b/r1"]);
  });

  it("prunes the relationship from query results", async () => {
    await useDigitalTwinsStore.getState().deleteRelationship("a", "r1");
    expect(pruneDeletedRelationships).toHaveBeenCalledWith(["r1"]);
  });

  it("throws and keeps the relationship when the call fails", async () => {
    client.deleteRelationship.mockRejectedValue(new Error("Not found"));

    await expect(
      useDigitalTwinsStore.getState().deleteRelationship("a", "r1")
    ).rejects.toThrow("Not found");

    expect(useDigitalTwinsStore.getState().relationships).toHaveLength(2);
    expect(pruneDeletedRelationships).not.toHaveBeenCalled();
  });
});
