import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render } from "@testing-library/react";

const fetchEnvironmentsMock = vi.fn();
vi.mock("@/services/environmentsClient", () => ({
  fetchEnvironments: (...args: unknown[]) => fetchEnvironmentsMock(...args),
}));

const acquireB2CToken = vi.fn();
const environmentToConnection = vi.fn((e: { id: string; name: string }) => ({
  id: `env-${e.id}`,
  name: e.name,
  environmentId: e.id,
  authProvider: "msal",
  managedSource: "environments",
}));
const getMsalConfig = vi.fn();
const getB2CScope = vi.fn();

vi.mock("@/services/environmentRouting", () => ({
  acquireB2CToken: (...a: unknown[]) => acquireB2CToken(...a),
  environmentToConnection: (e: never) => environmentToConnection(e),
  getMsalConfig: () => getMsalConfig(),
  getB2CScope: () => getB2CScope(),
}));

const setEnvironmentConnections = vi.fn();
vi.mock("@/stores/connectionStore", () => ({
  useConnectionStore: (selector: (s: unknown) => unknown) =>
    selector({ setEnvironmentConnections }),
}));

import { EnvironmentConnectionManager } from "@/components/EnvironmentConnectionManager";

// Let the effect's async chain settle; wrapped in act() so the resulting
// state update is flushed the way React expects.
const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

beforeEach(() => {
  vi.clearAllMocks();
  // Default: a fully unconfigured (public Konnektr) build.
  getMsalConfig.mockReturnValue(null);
  getB2CScope.mockReturnValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("EnvironmentConnectionManager — unconfigured build", () => {
  // The public Konnektr build ships without B2C vars. Nothing in this feature
  // may run in that case: no token request, no network call, no store writes.
  it("renders nothing", () => {
    const { container } = render(<EnvironmentConnectionManager />);
    expect(container.firstChild).toBeNull();
  });

  it("performs no side effects at all", async () => {
    render(<EnvironmentConnectionManager />);
    await flush();

    expect(acquireB2CToken).not.toHaveBeenCalled();
    expect(fetchEnvironmentsMock).not.toHaveBeenCalled();
    expect(setEnvironmentConnections).not.toHaveBeenCalled();
  });

  it("does not log an error — an unconfigured build is a valid state", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    render(<EnvironmentConnectionManager />);
    await flush();

    expect(error).not.toHaveBeenCalled();
  });
});

describe("EnvironmentConnectionManager — misconfigured build", () => {
  it("errors and no-ops when B2C is set up but the scope is missing", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    getMsalConfig.mockReturnValue({ auth: { clientId: "c", authority: "a" } });
    getB2CScope.mockReturnValue(undefined);

    render(<EnvironmentConnectionManager />);
    await flush();

    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("VITE_B2C_SCOPE is not configured")
    );
    expect(acquireB2CToken).not.toHaveBeenCalled();
    expect(fetchEnvironmentsMock).not.toHaveBeenCalled();
    expect(setEnvironmentConnections).not.toHaveBeenCalled();
  });
});

describe("EnvironmentConnectionManager — configured build", () => {
  const configure = () => {
    getMsalConfig.mockReturnValue({ auth: { clientId: "c", authority: "a" } });
    getB2CScope.mockReturnValue("https://tenant.onmicrosoft.com/api/Scope");
  };

  it("requests a token for the configured scope and populates the store", async () => {
    configure();
    acquireB2CToken.mockResolvedValue("token-abc");
    fetchEnvironmentsMock.mockResolvedValue([
      { id: "env-dev", name: "Development" },
    ]);

    render(<EnvironmentConnectionManager />);
    await flush();

    expect(acquireB2CToken).toHaveBeenCalledWith([
      "https://tenant.onmicrosoft.com/api/Scope",
    ]);
    expect(fetchEnvironmentsMock).toHaveBeenCalledWith("token-abc");
    expect(setEnvironmentConnections).toHaveBeenCalledWith([
      expect.objectContaining({ id: "env-env-dev", environmentId: "env-dev" }),
    ]);
  });

  it("skips the fetch when no token could be acquired", async () => {
    configure();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    acquireB2CToken.mockResolvedValue(null);

    render(<EnvironmentConnectionManager />);
    await flush();

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("No B2C token available")
    );
    expect(fetchEnvironmentsMock).not.toHaveBeenCalled();
    expect(setEnvironmentConnections).not.toHaveBeenCalled();
  });

  it("logs and does not write to the store when the fetch fails", async () => {
    configure();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    acquireB2CToken.mockResolvedValue("token-abc");
    fetchEnvironmentsMock.mockRejectedValue(new Error("boom"));

    render(<EnvironmentConnectionManager />);
    await flush();

    expect(error).toHaveBeenCalledWith(
      "Failed to fetch environments:",
      expect.any(Error)
    );
    expect(setEnvironmentConnections).not.toHaveBeenCalled();
  });

  it("fetches only once across re-renders", async () => {
    configure();
    acquireB2CToken.mockResolvedValue("token-abc");
    fetchEnvironmentsMock.mockResolvedValue([]);

    const { rerender } = render(<EnvironmentConnectionManager />);
    await flush();
    await act(async () => {
      rerender(<EnvironmentConnectionManager />);
    });
    await flush();

    expect(fetchEnvironmentsMock).toHaveBeenCalledTimes(1);
  });
});
