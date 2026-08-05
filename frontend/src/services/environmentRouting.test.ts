import { describe, it, expect, afterEach, vi } from "vitest";
import {
  ENVIRONMENTS_LABEL,
  getMsalConfig,
  getB2CScope,
  isEnvironmentRoutingConfigured,
  environmentToConnection,
  getMsalInstance,
  getInitializedMsalInstance,
  resetMsalInstance,
} from "@/services/environmentRouting";
import type { Environment } from "@/services/environmentsClient";

// MSAL v3: PublicClientApplication must be initialized (awaited) before any
// other API call. The real @azure/msal-browser throws
// uninitialized_public_client_application otherwise — this is exactly the
// crash v0.1.2 shipped with. Mock the module to verify OUR code never calls
// getAllAccounts before initialize() resolves.
const initializeMock = vi.fn();
const getAllAccountsMock = vi.fn();
vi.mock("@azure/msal-browser", () => ({
  PublicClientApplication: class {
    initialize = initializeMock;
    getAllAccounts = getAllAccountsMock;
    loginPopup = vi.fn();
    acquireTokenSilent = vi.fn();
    acquireTokenPopup = vi.fn();
    logoutPopup = vi.fn();
  },
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  resetMsalInstance();
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

describe("environmentRouting — MSAL initialize-before-use contract (v0.1.2 regression)", () => {
  it("starts initialize() as soon as the singleton is created", () => {
    vi.stubEnv("VITE_B2C_CLIENT_ID", "client-id");
    vi.stubEnv("VITE_B2C_AUTHORITY", "https://tenant.b2clogin.com/x/y");

    const instance = getMsalInstance();

    expect(instance).not.toBeNull();
    expect(initializeMock).toHaveBeenCalledTimes(1);
  });

  it("getInitializedMsalInstance awaits initialize() before returning", async () => {
    vi.stubEnv("VITE_B2C_CLIENT_ID", "client-id");
    vi.stubEnv("VITE_B2C_AUTHORITY", "https://tenant.b2clogin.com/x/y");

    let resolveInit: () => void = () => {};
    initializeMock.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveInit = resolve;
      })
    );

    // getAllAccounts would throw uninitialized_public_client_application if
    // called before initialize resolves. Track its order relative to init.
    getAllAccountsMock.mockReturnValue([{ username: "a@b.c" }]);
    let accountsReadBeforeInit = false;
    getAllAccountsMock.mockImplementation(() => {
      accountsReadBeforeInit = true;
      return [{ username: "a@b.c" }];
    });

    const pending = getInitializedMsalInstance();
    // Before resolve: no MSAL API may have been touched.
    await Promise.resolve();
    expect(getAllAccountsMock).not.toHaveBeenCalled();

    resolveInit();
    const instance = await pending;
    expect(instance).not.toBeNull();
    expect(accountsReadBeforeInit).toBe(false);
  });

  it("returns null when B2C is not configured", async () => {
    expect(await getInitializedMsalInstance()).toBeNull();
    expect(initializeMock).not.toHaveBeenCalled();
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

  it("derives environmentType from adtHost without touching routing fields", () => {
    const adt = environmentToConnection({
      id: "adt-1",
      name: "ADT",
      adtHost: "my-adt.digitaltwins.azure.net",
    });
    expect(adt.environmentType).toBe("azure");
    expect(adt.adtHost).toBeUndefined();
    expect(adt.environmentId).toBe("adt-1");

    const arcadis = environmentToConnection({
      id: "arc-1",
      name: "Arcadis",
      adtHost: "graph.arcadis.com",
    });
    expect(arcadis.environmentType).toBe("arcadis");
    expect(arcadis.adtHost).toBeUndefined();

    const cluster = environmentToConnection({
      id: "self-1",
      name: "Self-hosted Cluster",
      adtHost: "env-1.svc.cluster.local",
    });
    expect(cluster.environmentType).toBe("cluster");
    expect(cluster.adtHost).toBeUndefined();

    const konnektr = environmentToConnection({
      id: "kktr-1",
      name: "Konnektr Graph",
      adtHost: "graph.konnektr.io",
    });
    expect(konnektr.environmentType).toBe("konnektr");
    expect(konnektr.adtHost).toBeUndefined();
  });

  it("falls back to custom when the environment has no adtHost", () => {
    expect(
      environmentToConnection({ id: "x", name: "X" }).environmentType
    ).toBe("custom");
  });
});
