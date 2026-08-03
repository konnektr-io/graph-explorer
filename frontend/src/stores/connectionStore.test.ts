import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  useConnectionStore,
  validateConnectionAuth,
  type Connection,
} from "@/stores/connectionStore";
import { environmentToConnection } from "@/services/environmentRouting";
import type { Environment } from "@/services/environmentsClient";

const envConnection = (id: string, name = id): Connection => ({
  id: `env-${id}`,
  name,
  environmentId: id,
  authProvider: "msal",
  managedSource: "environments",
});

const localConnection = (id: string, adtHost: string): Connection => ({
  id,
  name: id,
  adtHost,
  authProvider: "none",
});

const resetStore = () =>
  useConnectionStore.setState({
    connections: [],
    ktrlPlaneConnections: [],
    environmentConnections: [],
    currentConnectionId: null,
  });

beforeEach(resetStore);
afterEach(() => vi.restoreAllMocks());

describe("environmentToConnection", () => {
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

  it("namespaces the connection id so it cannot collide with other sources", () => {
    expect(environmentToConnection(env).id).toBe("env-env-prd-01");
  });

  it("produces unique ids for distinct environments", () => {
    const ids = [
      environmentToConnection({ id: "a", name: "A" }),
      environmentToConnection({ id: "b", name: "B" }),
    ].map((c) => c.id);

    expect(new Set(ids).size).toBe(2);
  });

  it("carries name, description, status and the msal provider", () => {
    const conn = environmentToConnection(env);

    expect(conn.name).toBe("Production");
    expect(conn.description).toBe("Prod graph");
    expect(conn.status).toBe("Healthy");
    expect(conn.authProvider).toBe("msal");
    expect(conn.managedSource).toBe("environments");
  });

  it("falls back to a generated description", () => {
    expect(environmentToConnection({ id: "x", name: "X" }).description).toBe(
      "Environment: X"
    );
  });
});

describe("connectionStore — environment connections", () => {
  it("stores environment connections separately from local ones", () => {
    const { setEnvironmentConnections } = useConnectionStore.getState();
    setEnvironmentConnections([envConnection("a"), envConnection("b")]);

    const state = useConnectionStore.getState();
    expect(state.environmentConnections).toHaveLength(2);
    expect(state.connections).toHaveLength(0);
  });

  it("exposes environment connections through getAllConnections", () => {
    useConnectionStore.setState({ connections: [localConnection("l", "h")] });
    useConnectionStore
      .getState()
      .setEnvironmentConnections([envConnection("a")]);

    const ids = useConnectionStore
      .getState()
      .getAllConnections()
      .map((c) => c.id);
    expect(ids).toContain("env-a");
    expect(ids).toContain("l");
  });

  it("keeps the current selection when the environment still exists", () => {
    const { setEnvironmentConnections } = useConnectionStore.getState();
    setEnvironmentConnections([envConnection("a"), envConnection("b")]);
    useConnectionStore.setState({ currentConnectionId: "env-b" });

    setEnvironmentConnections([envConnection("a"), envConnection("b")]);

    expect(useConnectionStore.getState().currentConnectionId).toBe("env-b");
  });

  it("falls back to the first environment when the selected one disappears", () => {
    const { setEnvironmentConnections } = useConnectionStore.getState();
    setEnvironmentConnections([envConnection("a"), envConnection("b")]);
    useConnectionStore.setState({ currentConnectionId: "env-b" });

    setEnvironmentConnections([envConnection("a")]);

    expect(useConnectionStore.getState().currentConnectionId).toBe("env-a");
  });

  it("does not steal a selection that belongs to a local connection", () => {
    useConnectionStore.setState({
      connections: [localConnection("local", "host")],
      currentConnectionId: "local",
    });

    useConnectionStore
      .getState()
      .setEnvironmentConnections([envConnection("a")]);

    expect(useConnectionStore.getState().currentConnectionId).toBe("local");
  });

  it("clears the selection when nothing resolves", () => {
    useConnectionStore.setState({ currentConnectionId: "gone" });
    useConnectionStore.getState().setEnvironmentConnections([]);

    expect(useConnectionStore.getState().currentConnectionId).toBeNull();
  });

  it("does not persist environment connections", () => {
    // Only local connections, the current id and dismissed banners are persisted.
    useConnectionStore
      .getState()
      .setEnvironmentConnections([envConnection("a")]);

    const persisted = JSON.parse(
      localStorage.getItem("konnektr-connections") ?? "{}"
    );

    expect(persisted.state?.environmentConnections).toBeUndefined();
  });
});

describe("connectionStore — KtrlPlane dedup with optional adtHost", () => {
  it("keeps environment-routed connections when deduplicating", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});

    // An environment-routed connection sitting in the local list has no
    // adtHost — dedup must not crash or drop it.
    useConnectionStore.setState({ connections: [envConnection("a")] });

    useConnectionStore.getState().setKtrlPlaneConnections([
      {
        resource_id: "res-1",
        project_id: "proj-1",
        name: "Res 1",
        sku: "standard",
        status: "Healthy",
      } as never,
    ]);

    const ids = useConnectionStore.getState().connections.map((c) => c.id);
    expect(ids).toContain("env-a");
  });
});

describe("validateConnectionAuth", () => {
  it("rejects a connection with neither adtHost nor environmentId", () => {
    expect(
      validateConnectionAuth({
        id: "x",
        name: "X",
        authProvider: "none",
      })
    ).toBe("A connection requires either a Host or an Environment ID");
  });

  it("accepts an environment-routed connection with no adtHost", () => {
    expect(
      validateConnectionAuth({
        id: "x",
        name: "X",
        environmentId: "e1",
        authProvider: "none",
      })
    ).toBeNull();
  });

  it("accepts a host-routed connection with no environmentId", () => {
    expect(validateConnectionAuth(localConnection("l", "host"))).toBeNull();
  });
});
