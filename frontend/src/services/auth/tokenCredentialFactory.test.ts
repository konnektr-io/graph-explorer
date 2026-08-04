import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const acquireB2CToken = vi.fn();
const getB2CScope = vi.fn();

vi.mock("@/services/environmentRouting", () => ({
  acquireB2CToken: (...args: unknown[]) => acquireB2CToken(...args),
  getB2CScope: () => getB2CScope(),
}));

import {
  getTokenCredential,
  B2CTokenCredential,
} from "@/services/auth/tokenCredentialFactory";
import type { Connection } from "@/stores/connectionStore";

beforeEach(() => {
  vi.clearAllMocks();
  getB2CScope.mockReturnValue("https://tenant.onmicrosoft.com/api/Scope");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getTokenCredential — environment-managed connections", () => {
  const environmentConnection = (): Connection => ({
    id: "env-env-prd-01",
    name: "Production",
    environmentId: "env-prd-01",
    authProvider: "msal",
    managedSource: "environments",
  });

  it("returns a B2C token credential without requiring an authConfig", async () => {
    const credential = await getTokenCredential(environmentConnection());

    expect(credential).toBeInstanceOf(B2CTokenCredential);
  });

  it("covers connections that only set environmentId", async () => {
    const credential = await getTokenCredential({
      id: "x",
      name: "X",
      environmentId: "e1",
      authProvider: "msal",
    });

    expect(credential).toBeInstanceOf(B2CTokenCredential);
  });

  it("acquires a token for the deployment-wide B2C scope", async () => {
    acquireB2CToken.mockResolvedValue("token-abc");
    const credential = (await getTokenCredential(
      environmentConnection()
    )) as B2CTokenCredential;

    const result = await credential.getToken();

    expect(getB2CScope).toHaveBeenCalled();
    expect(acquireB2CToken).toHaveBeenCalledWith([
      "https://tenant.onmicrosoft.com/api/Scope",
    ]);
    expect(result).toMatchObject({ token: "token-abc" });
    expect(result.expiresOnTimestamp).toBeGreaterThan(Date.now());
  });
});

describe("getTokenCredential — custom msal connections", () => {
  it("still throws for a custom msal connection without authConfig", async () => {
    await expect(
      getTokenCredential({
        id: "custom",
        name: "Custom",
        adtHost: "custom.example.com",
        authProvider: "msal",
      })
    ).rejects.toThrow("MSAL authentication requires configuration");
  });
});
