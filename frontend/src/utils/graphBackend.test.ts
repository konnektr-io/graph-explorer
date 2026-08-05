import { describe, it, expect } from "vitest";
import type { Connection } from "@/stores/connectionStore";
import {
  getGraphBackendKind,
  isAdtBackend,
  getTwinCountQuery,
  parseTwinCounts,
  ADT_TWIN_COUNT_QUERY,
  CYPHER_TWIN_COUNT_QUERY,
  DEFAULT_ADT_SAMPLE_QUERY,
  DEFAULT_CYPHER_SAMPLE_QUERY,
} from "@/utils/graphBackend";

function conn(partial: Partial<Connection>): Connection {
  return {
    id: "test",
    name: "Test",
    authProvider: "none",
    ...partial,
  } as Connection;
}

describe("graphBackend.getGraphBackendKind", () => {
  it("treats a missing connection as Konnektr Graph (cypher default)", () => {
    expect(getGraphBackendKind(undefined)).toBe("konnektr-graph");
    expect(getGraphBackendKind(null)).toBe("konnektr-graph");
  });

  it("treats KtrlPlane auth as Konnektr Graph", () => {
    expect(
      getGraphBackendKind(conn({ authProvider: "ktrlplane" }))
    ).toBe("konnektr-graph");
  });

  it("honours an explicitly tagged azure environment", () => {
    expect(
      getGraphBackendKind(
        conn({ environmentType: "azure", adtHost: "x.resource-name.api.konnektr.io" })
      )
    ).toBe("adt");
  });

  it("honours explicitly tagged non-azure environments", () => {
    for (const t of ["arcadis", "cluster", "konnektr"] as const) {
      expect(getGraphBackendKind(conn({ environmentType: t }))).toBe(
        "konnektr-graph"
      );
    }
  });

  it("classifies a konnektr.io host as Konnektr Graph", () => {
    expect(
      getGraphBackendKind(conn({ adtHost: "free-1.api.graph.konnektr.io" }))
    ).toBe("konnektr-graph");
  });

  it("classifies an Azure host as ADT", () => {
    expect(
      getGraphBackendKind(conn({ adtHost: "my-instance.api.digitaltwins.azure.net" }))
    ).toBe("adt");
  });

  it("classifies a custom / bare host as Konnektr Graph", () => {
    expect(getGraphBackendKind(conn({ adtHost: "graph.internal.local" }))).toBe(
      "konnektr-graph"
    );
    expect(getGraphBackendKind(conn({ adtHost: "10.0.0.5" }))).toBe(
      "konnektr-graph"
    );
  });
});

describe("graphBackend.isAdtBackend", () => {
  it("is true for azure hosts, false otherwise", () => {
    expect(
      isAdtBackend(conn({ adtHost: "inst.digitaltwins.azure.net" }))
    ).toBe(true);
    expect(isAdtBackend(conn({ adtHost: "x.konnektr.io" }))).toBe(false);
    expect(isAdtBackend(conn({ authProvider: "ktrlplane" }))).toBe(false);
    expect(isAdtBackend(undefined)).toBe(false);
  });
});

describe("graphBackend.getTwinCountQuery", () => {
  it("returns the aggregation query for Konnektr Graph", () => {
    const { query, isCypher } = getTwinCountQuery(
      conn({ adtHost: "x.konnektr.io" })
    );
    expect(query).toBe(CYPHER_TWIN_COUNT_QUERY);
    expect(isCypher).toBe(true);
  });

  it("returns the projection query for Azure ADT", () => {
    const { query, isCypher } = getTwinCountQuery(
      conn({ adtHost: "inst.digitaltwins.azure.net" })
    );
    expect(query).toBe(ADT_TWIN_COUNT_QUERY);
    expect(isCypher).toBe(false);
  });
});

describe("graphBackend.parseTwinCounts", () => {
  it("parses Konnektr aggregation rows keyed by _model/_modelCount", () => {
    const rows = [
      { _model: "dtmi:example:Building;1", _modelCount: 3 },
      { _model: "dtmi:example:Room;1", count: 5 },
    ];
    expect(parseTwinCounts(rows, true)).toEqual({
      "dtmi:example:Building;1": 3,
      "dtmi:example:Room;1": 5,
    });
  });

  it("parses Konnektr rows with raw count(*) column", () => {
    const rows = [{ _model: "dtmi:example:Room;1", "count(*)": 2 }];
    expect(parseTwinCounts(rows, true)).toEqual({
      "dtmi:example:Room;1": 2,
    });
  });

  it("reads model id from a dtmi-typed value and falls back to count 1", () => {
    const rows = [{ "t.$metadata.$model": "dtmi:example:Room;1", _modelCount: 4 }];
    expect(parseTwinCounts(rows, true)).toEqual({
      "dtmi:example:Room;1": 4,
    });
    // No count column at all -> assume 1 (single-row aggregation).
    const rows2 = [{ "t.$metadata.$model": "dtmi:example:Room;1" }];
    expect(parseTwinCounts(rows2, true)).toEqual({
      "dtmi:example:Room;1": 1,
    });
  });

  it("counts ADT projection rows by +1 per twin", () => {
    const rows = [
      { $metadata: { $model: "dtmi:example:Building;1" } },
      { $metadata: { $model: "dtmi:example:Room;1" } },
      { $metadata: { $model: "dtmi:example:Room;1" } },
    ];
    expect(parseTwinCounts(rows, false)).toEqual({
      "dtmi:example:Building;1": 1,
      "dtmi:example:Room;1": 2,
    });
  });

  it("skips rows without a model id", () => {
    expect(parseTwinCounts([{ _modelCount: 5 }], true)).toEqual({});
    expect(parseTwinCounts([null, "x"], false)).toEqual({});
  });

  it("handles numeric-string and neo4j Integer counts", () => {
    const rows = [
      { _model: "dtmi:a;B", _modelCount: "7" },
      { _model: "dtmi:b;C", _modelCount: { low: 2, high: 0 } },
    ];
    expect(parseTwinCounts(rows, true)).toEqual({
      "dtmi:a;B": 7,
      "dtmi:b;C": 2,
    });
  });
});

describe("graphBackend sample queries", () => {
  it("exposes distinct cypher and ADT samples", () => {
    expect(DEFAULT_CYPHER_SAMPLE_QUERY).toContain("MATCH");
    expect(DEFAULT_ADT_SAMPLE_QUERY.toUpperCase()).toContain("SELECT TOP(5)");
    expect(DEFAULT_CYPHER_SAMPLE_QUERY).not.toBe(DEFAULT_ADT_SAMPLE_QUERY);
  });
});