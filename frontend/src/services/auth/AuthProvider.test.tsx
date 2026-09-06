import { useEffect, useState } from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AuthProvider } from "@/services/auth/AuthProvider";
import { useAuth } from "@/services/auth/authContext";

afterEach(() => {
  vi.unstubAllEnvs();
});

// Consumer mirroring the real call sites (KtrlPlaneConnectionManager,
// ConnectionSelector, GraphHeader): calls useAuth() during render.
function Probe() {
  const { isAuthenticated, user, getAccessTokenSilently } = useAuth();
  const [tokenError, setTokenError] = useState<string | null>(null);
  useEffect(() => {
    getAccessTokenSilently().then(
      () => setTokenError("unexpected-success"),
      (e: unknown) => setTokenError(e instanceof Error ? e.message : "error")
    );
  }, [getAccessTokenSilently]);
  return (
    <div>
      <div data-testid="auth-state">
        {isAuthenticated ? "authed" : "anon"}:{user ? "user" : "nouser"}
      </div>
      <div data-testid="token-error">{tokenError ?? "pending"}</div>
    </div>
  );
}

describe("AuthProvider — Auth0 unconfigured ( stock konnektr build )", () => {
  it("still provides an (anonymous) auth context instead of crashing", async () => {
    // The konnektr flavor image is built without VITE_AUTH0_CLIENT_ID, so a
    // plain `Add -> custom connection (auth None)` deployment must work
    // without any sign-in. Regression: the misconfigured path rendered bare
    // children, and the first useAuth() threw
    // "useAuth must be used within an AuthProvider", unmounting the app.
    vi.stubEnv("VITE_AUTH0_DISABLED", "");
    vi.stubEnv("VITE_AUTH0_CLIENT_ID", "");
    vi.stubEnv("VITE_AUTH0_DOMAIN", "");

    expect(() =>
      render(
        <AuthProvider>
          <Probe />
        </AuthProvider>
      )
    ).not.toThrow();
    expect(screen.getByTestId("auth-state").textContent).toBe("anon:nouser");
    await waitFor(() =>
      expect(screen.getByTestId("token-error").textContent).not.toBe("pending")
    );
    expect(screen.getByTestId("token-error").textContent).not.toBe(
      "unexpected-success"
    );
  });
});
