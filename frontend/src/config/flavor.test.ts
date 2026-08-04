import { describe, it, expect, afterEach, vi } from "vitest";
import {
  isAuth0Disabled,
  isCustomConnectionsDisabled,
  isArcadisFlavor,
} from "@/config/flavor";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("flavor — default (unset) build", () => {
  // The public Konnektr build ships without any of the flavor switches set.
  // Every gate must therefore report "off" so behavior is unchanged.
  it("keeps Auth0 enabled when VITE_AUTH0_DISABLED is unset", () => {
    expect(isAuth0Disabled()).toBe(false);
  });

  it("keeps custom connections when VITE_CUSTOM_CONNECTIONS_DISABLED is unset", () => {
    expect(isCustomConnectionsDisabled()).toBe(false);
  });

  it("is not an Arcadis flavor when no switch is set", () => {
    expect(isArcadisFlavor()).toBe(false);
  });
});

describe("flavor — switch gating", () => {
  it("VITE_AUTH0_DISABLED=true disables Auth0", () => {
    vi.stubEnv("VITE_AUTH0_DISABLED", "true");
    expect(isAuth0Disabled()).toBe(true);
  });

  it("only the literal value 'true' disables Auth0", () => {
    vi.stubEnv("VITE_AUTH0_DISABLED", "1");
    expect(isAuth0Disabled()).toBe(false);
  });

  it("VITE_CUSTOM_CONNECTIONS_DISABLED=true disables custom connections", () => {
    vi.stubEnv("VITE_CUSTOM_CONNECTIONS_DISABLED", "true");
    expect(isCustomConnectionsDisabled()).toBe(true);
  });

  it("isArcadisFlavor is true when Auth0 is disabled", () => {
    vi.stubEnv("VITE_AUTH0_DISABLED", "true");
    expect(isArcadisFlavor()).toBe(true);
  });

  it("isArcadisFlavor is true when custom connections are disabled", () => {
    vi.stubEnv("VITE_CUSTOM_CONNECTIONS_DISABLED", "true");
    expect(isArcadisFlavor()).toBe(true);
  });
});
