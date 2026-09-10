import { describe, it, expect } from "vitest";
import {
  filterConnections,
  orderConnections,
  sortConnectionsByName,
} from "@/utils/connectionList";

describe("sortConnectionsByName", () => {
  it("orders alphabetically regardless of the input order", () => {
    const input = [{ name: "Zulu" }, { name: "alpha" }, { name: "Mike" }];

    expect(sortConnectionsByName(input).map((c) => c.name)).toEqual([
      "alpha",
      "Mike",
      "Zulu",
    ]);
  });

  it("is case-insensitive", () => {
    const input = [{ name: "bravo" }, { name: "Alpha" }, { name: "charlie" }];

    expect(sortConnectionsByName(input).map((c) => c.name)).toEqual([
      "Alpha",
      "bravo",
      "charlie",
    ]);
  });

  it("sorts numbered names naturally (env-2 before env-10)", () => {
    const input = [{ name: "env-10" }, { name: "env-2" }, { name: "env-1" }];

    expect(sortConnectionsByName(input).map((c) => c.name)).toEqual([
      "env-1",
      "env-2",
      "env-10",
    ]);
  });

  it("breaks ties on id deterministically", () => {
    const input = [
      { id: "z", name: "Same" },
      { id: "a", name: "Same" },
    ];

    expect(sortConnectionsByName(input).map((c) => c.id)).toEqual(["a", "z"]);
  });

  it("does not mutate the input", () => {
    const input = [{ name: "B" }, { name: "A" }];
    const snapshot = [...input];

    sortConnectionsByName(input);

    expect(input).toEqual(snapshot);
  });
});

describe("filterConnections", () => {
  const items = [
    { id: "env-prod-01", name: "Production" },
    { id: "env-dev-01", name: "Development" },
    { id: "env-prd-eu", name: "Production EU" },
  ];

  it("returns a copy for a blank query (no filtering)", () => {
    const result = filterConnections(items, "   ");

    expect(result).toEqual(items);
    expect(result).not.toBe(items);
  });

  it("matches on name, case-insensitively", () => {
    expect(filterConnections(items, "PROD").map((c) => c.id)).toEqual([
      "env-prod-01",
      "env-prd-eu",
    ]);
  });

  it("matches on id too", () => {
    expect(filterConnections(items, "dev-01").map((c) => c.id)).toEqual([
      "env-dev-01",
    ]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(filterConnections(items, "nope")).toEqual([]);
  });
});

describe("orderConnections", () => {
  it("sorts then filters", () => {
    const items = [
      { id: "3", name: "Zulu" },
      { id: "1", name: "Alpine Prod" },
      { id: "2", name: "Bravo Prod" },
    ];

    expect(orderConnections(items, "prod").map((c) => c.name)).toEqual([
      "Alpine Prod",
      "Bravo Prod",
    ]);
  });
});
