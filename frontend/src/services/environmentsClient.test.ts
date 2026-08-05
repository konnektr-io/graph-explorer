import { describe, it, expect, vi, afterEach } from "vitest";
import {
  extractEnvironmentList,
  normalizeEnvironment,
  parseEnvironmentsResponse,
  getEnvironmentsEndpoint,
  fetchEnvironments,
  classifyEnvironmentHost,
  ENVIRONMENT_TYPE_LABELS,
} from "@/services/environmentsClient";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("environmentsClient", () => {
  describe("extractEnvironmentList", () => {
    it("accepts a bare array", () => {
      expect(extractEnvironmentList([{ id: "a" }])).toEqual([{ id: "a" }]);
    });

    it("unwraps { environments: [...] }", () => {
      expect(extractEnvironmentList({ environments: [{ id: "a" }] })).toEqual([
        { id: "a" },
      ]);
    });

    it("unwraps { resources: [...] }", () => {
      expect(extractEnvironmentList({ resources: [{ id: "a" }] })).toEqual([
        { id: "a" },
      ]);
    });

    it("unwraps { value: [...] }", () => {
      expect(extractEnvironmentList({ value: [{ id: "a" }] })).toEqual([
        { id: "a" },
      ]);
    });

    it("returns an empty array for unknown shapes", () => {
      expect(extractEnvironmentList({ nope: 1 })).toEqual([]);
      expect(extractEnvironmentList(null)).toEqual([]);
      expect(extractEnvironmentList("string")).toEqual([]);
    });
  });

  describe("normalizeEnvironment", () => {
    it("maps a plain { id, name } record", () => {
      expect(normalizeEnvironment({ id: "e1", name: "One" })).toEqual({
        id: "e1",
        name: "One",
      });
    });

    // This is the shape the Arcadis /api/environments endpoint returns:
    // a plain array of BasicDigitalTwin, identified by $dtId.
    it("maps a BasicDigitalTwin record identified by $dtId", () => {
      const twin = {
        $dtId: "env-prod-01",
        $etag: 'W/"abc"',
        $metadata: { $model: "dtmi:com:example:Environment;1" },
        name: "Production",
      };

      expect(normalizeEnvironment(twin)).toEqual({
        id: "env-prod-01",
        name: "Production",
      });
    });

    it("prefers $dtId over id when both are present", () => {
      expect(
        normalizeEnvironment({ $dtId: "dt", id: "plain", name: "n" })
      ).toEqual({ id: "dt", name: "n" });
    });

    it("falls back to the id when no name field exists", () => {
      expect(normalizeEnvironment({ $dtId: "env-1" })).toEqual({
        id: "env-1",
        name: "env-1",
      });
    });

    it("carries description and status when present", () => {
      expect(
        normalizeEnvironment({
          id: "e1",
          name: "One",
          description: "desc",
          status: "Healthy",
        })
      ).toEqual({
        id: "e1",
        name: "One",
        description: "desc",
        status: "Healthy",
      });
    });

    it("carries adtHost when present (Arcadis shape)", () => {
      expect(
        normalizeEnvironment({
          $dtId: "env-adt-01",
          name: "ADT Prod",
          adtHost: "my-adt.digitaltwins.azure.net",
        })
      ).toEqual({
        id: "env-adt-01",
        name: "ADT Prod",
        adtHost: "my-adt.digitaltwins.azure.net",
      });
    });

    it("accepts host / hostName as alternative adtHost keys", () => {
      expect(normalizeEnvironment({ id: "h1", name: "H", host: "x.arcadis.com" })).toEqual({
        id: "h1",
        name: "H",
        adtHost: "x.arcadis.com",
      });
      expect(
        normalizeEnvironment({ id: "h2", name: "H", hostName: "y.cluster.local" })
      ).toEqual({
        id: "h2",
        name: "H",
        adtHost: "y.cluster.local",
      });
    });

    it("omits adtHost entirely when the payload has none", () => {
      const result = normalizeEnvironment({ $dtId: "e1", name: "One" });
      expect(result).not.toBeNull();
      expect(result).not.toHaveProperty("adtHost");
    });

    it("omits status entirely when the payload has no status field", () => {
      const result = normalizeEnvironment({ $dtId: "e1", name: "One" });
      expect(result).not.toBeNull();
      expect(result).not.toHaveProperty("status");
    });

    it("returns null when no identifier can be resolved", () => {
      expect(normalizeEnvironment({ name: "nameless" })).toBeNull();
      expect(normalizeEnvironment({})).toBeNull();
      expect(normalizeEnvironment(null)).toBeNull();
      expect(normalizeEnvironment("nope")).toBeNull();
      expect(normalizeEnvironment([])).toBeNull();
    });

    it("honours explicitly configured id and name fields", () => {
      expect(
        normalizeEnvironment(
          { envKey: "k1", label: "Custom" },
          { idField: "envKey", nameField: "label" }
        )
      ).toEqual({ id: "k1", name: "Custom" });
    });

    it("coerces a numeric identifier to a string", () => {
      expect(normalizeEnvironment({ id: 42, name: "Forty-two" })).toEqual({
        id: "42",
        name: "Forty-two",
      });
    });
  });

  describe("classifyEnvironmentHost", () => {
    it("classifies Azure Digital Twins hosts by .digitaltwins.azure.net suffix", () => {
      expect(classifyEnvironmentHost("my-adt.digitaltwins.azure.net")).toBe(
        "azure"
      );
      expect(classifyEnvironmentHost("dev.digitaltwins.azure.net")).toBe(
        "azure"
      );
    });

    it("classifies Arcadis-managed Konnektr Graph hosts by .arcadis.com suffix", () => {
      expect(classifyEnvironmentHost("graph.arcadis.com")).toBe("arcadis");
      expect(classifyEnvironmentHost("twins.arcadis.com")).toBe("arcadis");
    });

    it("classifies self-hosted Konnektr Graph cluster hosts by .cluster.local suffix", () => {
      expect(classifyEnvironmentHost("env-1.svc.cluster.local")).toBe(
        "cluster"
      );
    });

    it("classifies Konnektr Graph hosts by .konnektr.io suffix", () => {
      expect(classifyEnvironmentHost("graph.konnektr.io")).toBe("konnektr");
      expect(classifyEnvironmentHost("api.konnektr.io")).toBe("konnektr");
    });

    it("strips protocol and is case-insensitive", () => {
      expect(
        classifyEnvironmentHost("HTTPS://MY-ADT.DIGITALTWINS.AZURE.NET")
      ).toBe("azure");
      expect(classifyEnvironmentHost("https://graph.arcadis.com/")).toBe(
        "arcadis"
      );
    });

    it("returns custom for unrecognised or missing hosts", () => {
      expect(classifyEnvironmentHost("something.else.com")).toBe("custom");
      expect(classifyEnvironmentHost(undefined)).toBe("custom");
      expect(classifyEnvironmentHost("")).toBe("custom");
    });

    it("exposes a display label for every type", () => {
      expect(ENVIRONMENT_TYPE_LABELS.azure).toBe("Azure");
      expect(ENVIRONMENT_TYPE_LABELS.arcadis).toBe("Arcadis");
      expect(ENVIRONMENT_TYPE_LABELS.cluster).toBe("Cluster");
      expect(ENVIRONMENT_TYPE_LABELS.konnektr).toBe("Konnektr");
      expect(ENVIRONMENT_TYPE_LABELS.custom).toBe("Custom");
    });
  });

  describe("parseEnvironmentsResponse", () => {
    it("parses a plain array of BasicDigitalTwin (Arcadis shape)", () => {
      const payload = [
        { $dtId: "env-dev", name: "Development" },
        { $dtId: "env-prd", name: "Production" },
      ];

      expect(parseEnvironmentsResponse(payload)).toEqual([
        { id: "env-dev", name: "Development" },
        { id: "env-prd", name: "Production" },
      ]);
    });

    it("parses the KtrlPlane-style envelope", () => {
      const payload = {
        environments: [{ id: "e1", name: "One", status: "Healthy" }],
      };

      expect(parseEnvironmentsResponse(payload)).toEqual([
        { id: "e1", name: "One", status: "Healthy" },
      ]);
    });

    it("skips records without an identifier instead of emitting id: undefined", () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});

      const result = parseEnvironmentsResponse([
        { $dtId: "ok", name: "Good" },
        { name: "Broken" },
      ]);

      expect(result).toEqual([{ id: "ok", name: "Good" }]);
      expect(result.every((e) => typeof e.id === "string")).toBe(true);
    });

    it("returns an empty array for an empty payload", () => {
      expect(parseEnvironmentsResponse([])).toEqual([]);
    });
  });

  describe("getEnvironmentsEndpoint", () => {
    it("prefers an explicit endpoint argument", () => {
      expect(getEnvironmentsEndpoint("/custom")).toBe("/custom");
    });

    it("falls back to the default endpoint", () => {
      // VITE_ENVIRONMENTS_ENDPOINT is unset in the test env
      expect(getEnvironmentsEndpoint()).toBe("/api/environments");
    });
  });

  describe("fetchEnvironments", () => {
    it("sends a bearer token and normalises the response", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [{ $dtId: "env-1", name: "One" }],
      });
      vi.stubGlobal("fetch", fetchMock);

      const result = await fetchEnvironments("token-123", "/api/environments");

      expect(result).toEqual([{ id: "env-1", name: "One" }]);
      expect(fetchMock).toHaveBeenCalledWith("/api/environments", {
        headers: {
          Authorization: "Bearer token-123",
          "Content-Type": "application/json",
        },
      });
    });

    it("throws on a non-ok response", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 403,
          statusText: "Forbidden",
        })
      );

      await expect(fetchEnvironments("t")).rejects.toThrow(
        "Failed to fetch environments: 403 Forbidden"
      );
    });
  });
});
