import { describe, it, expect, afterEach, vi } from "vitest";
import {
  ENVIRONMENTS_LABEL,
  getMsalConfig,
  getB2CScope,
  isEnvironmentRoutingConfigured,
  environmentToConnection,
} from "@/services/environmentRouting";
import type { Environment } from "@/services/environmentsClient";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("environmentRouting — configuration gating", () => {
  // The public Konnektr build ships with none of these set. Every gate below
  // must therefore report "not configured" so the feature stays inert.
  it("getMsalConfig returns null when B2C vars are unset", () => {
    expect(getMsalConfig()).toBeNull();
  });

  it("getMsalConfig returns null when only the client id is set", () => {
    vi.stubEnv("VITE_B2C_CLIENT_ID", "client-id");
    expect(getMsalConfig()).toBeNull();
  });

  it("getMsalConfig returns null when only the authority is set", () => {
    vi.stubEnv("VITE_B2C_AUTHORITY", "https://tenant.b2clogin.com/x/y");
    expect(getMsalConfig()).toBeNull();
  });

  it("getMsalConfig builds a config when client id and authority are set", () => {
    vi.stubEnv("VITE_B2C_CLIENT_ID", "client-id");
    vi.stubEnv("VITE_B2C_AUTHORITY", "https://tenant.b2clogin.com/x/y");
    vi.stubEnv("VITE_B2C_KNOWN_AUTHORITY", "tenant.b2clogin.com");

    expect(getMsalConfig()).toEqual({
      auth: {
        clientId: "client-id",
        authority: "https://tenant.b2clogin.com/x/y",
        knownAuthorities: ["tenant.b2clogin.com"],
        redirectUri: window.location.origin,
      },
      cache: {
        cacheLocation: "localStorage",
        storeAuthStateInCookie: false,
      },
    });
  });

  it("getB2CScope has no default — a missing scope is undefined", () => {
    expect(getB2CScope()).toBeUndefined();
  });

  it("getB2CScope never falls back to the Azure Digital Twins resource", () => {
    // The proxy authorizes the caller's own B2C token; a token issued for
    // https://digitaltwins.azure.net would be rejected.
    expect(getB2CScope()).not.toBe("https://digitaltwins.azure.net/.default");
  });

  it("isEnvironmentRoutingConfigured requires client id, authority and scope", () => {
    expect(isEnvironmentRoutingConfigured()).toBe(false);

    vi.stubEnv("VITE_B2C_CLIENT_ID", "client-id");
    vi.stubEnv("VITE_B2C_AUTHORITY", "https://tenant.b2clogin.com/x/y");
    expect(isEnvironmentRoutingConfigured()).toBe(false);

    vi.stubEnv("VITE_B2C_SCOPE", "https://tenant.onmicrosoft.com/api/Scope");
    expect(isEnvironmentRoutingConfigured()).toBe(true);
  });

  it("defaults the group label to a deployment-neutral value", () => {
    expect(ENVIRONMENTS_LABEL).toBe("Environments");
  });
});

describe("environmentRouting — environmentToConnection", () => {
  const env: Environment = {
    id: "env-prd-01",
    name: "Production",
    description: "Prod graph",
    status: "Healthy",
  };

  it("routes by environmentId and never synthesises an adtHost", () => {
    const conn = environmentToConnection(env);
    expect(conn.environmentId).toBe("env-prd-01");
    expect(conn.adtHost).toBeUndefined();
  });

  it("namespaces the id and keeps distinct environments distinct", () => {
    expect(environmentToConnection(env).id).toBe("env-env-prd-01");

    const ids = [
      environmentToConnection({ id: "a", name: "A" }).id,
      environmentToConnection({ id: "b", name: "B" }).id,
    ];
    expect(new Set(ids).size).toBe(2);
  });

  it("carries metadata and the msal provider", () => {
    const conn = environmentToConnection(env);
    expect(conn).toMatchObject({
      name: "Production",
      description: "Prod graph",
      status: "Healthy",
      authProvider: "msal",
      managedSource: "environments",
    });
  });

  it("falls back to a generated description", () => {
    expect(environmentToConnection({ id: "x", name: "X" }).description).toBe(
      "Environment: X"
    );
  });
});
