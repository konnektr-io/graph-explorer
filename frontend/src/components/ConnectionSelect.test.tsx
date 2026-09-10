import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConnectionSelect } from "@/components/ConnectionSelect";
import type { Connection } from "@/stores/connectionStore";

/** A local/custom connection. */
const local = (
  id: string,
  name: string,
  extra: Partial<Connection> = {}
): Connection => ({
  id,
  name,
  adtHost: `${id}.example.com`,
  authProvider: "none",
  ...extra,
});

/** An environment-managed connection (as produced by `environmentToConnection`). */
const environment = (
  id: string,
  name: string,
  extra: Partial<Connection> = {}
): Connection =>
  local(`env-${id}`, name, {
    environmentId: id,
    adtHost: undefined,
    authProvider: "msal",
    managedSource: "environments",
    ...extra,
  });

/** A KtrlPlane-managed connection. */
const ktrlPlane = (
  id: string,
  name: string,
  status = "Healthy"
): Connection => ({
  id: `ktrlplane-${id}`,
  name,
  adtHost: `${id}.api.graph.konnektr.io`,
  authProvider: "ktrlplane",
  managedSource: "ktrlplane",
  isKtrlPlaneManaged: true,
  status,
});

interface RenderOptions {
  value?: string | null;
  ktrlPlaneConnections?: Connection[];
  environmentConnections?: Connection[];
  localConnections?: Connection[];
}

const renderSelect = ({
  value = null,
  ktrlPlaneConnections = [],
  environmentConnections = [],
  localConnections = [],
}: RenderOptions = {}) => {
  const onValueChange = vi.fn();

  render(
    <ConnectionSelect
      value={value}
      onValueChange={onValueChange}
      ktrlPlaneConnections={ktrlPlaneConnections}
      environmentConnections={environmentConnections}
      localConnections={localConnections}
      environmentsLabel="Environments"
    />
  );

  return { onValueChange };
};

/** Open the popover and return the filter input. */
const openWith = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByTestId("connection-select-trigger"));
  return screen.getByTestId("connection-select-filter");
};

/** Ids of the rendered options, in DOM order. */
const optionIds = () =>
  screen
    .getAllByRole("option")
    .map((option) => option.getAttribute("data-connection-id"));

describe("ConnectionSelect", () => {
  it("shows the placeholder when nothing is selected", () => {
    renderSelect();

    expect(screen.getByTestId("connection-select-trigger")).toHaveTextContent(
      "Select connection..."
    );
  });

  it("shows the selected connection's name", () => {
    renderSelect({
      value: "env-prd-01",
      environmentConnections: [environment("prd-01", "Production")],
    });

    expect(screen.getByTestId("connection-select-trigger")).toHaveTextContent(
      "Production"
    );
  });

  it("orders environments alphabetically, not in payload order", async () => {
    const user = userEvent.setup();
    renderSelect({
      environmentConnections: [
        environment("z", "Zulu"),
        environment("a", "Alpha"),
        environment("m", "Mike"),
      ],
    });

    await openWith(user);

    expect(optionIds()).toEqual(["env-a", "env-m", "env-z"]);
  });

  it("orders numbered environment names naturally", async () => {
    const user = userEvent.setup();
    renderSelect({
      environmentConnections: [
        environment("10", "Cluster 10"),
        environment("2", "Cluster 2"),
      ],
    });

    await openWith(user);

    expect(optionIds()).toEqual(["env-2", "env-10"]);
  });

  it("filters across every group as the user types", async () => {
    const user = userEvent.setup();
    renderSelect({
      ktrlPlaneConnections: [ktrlPlane("shared", "Shared Graph")],
      environmentConnections: [
        environment("prd", "Production"),
        environment("dev", "Development"),
      ],
      localConnections: [local("local-prod", "Local Prod")],
    });

    const filter = await openWith(user);
    await user.type(filter, "prod");

    expect(optionIds()).toEqual(["env-prd", "local-prod"]);
  });

  it("matches on the connection id as well as the name", async () => {
    const user = userEvent.setup();
    renderSelect({
      environmentConnections: [
        environment("prd-eu-01", "Primary"),
        environment("dev-01", "Secondary"),
      ],
    });

    const filter = await openWith(user);
    await user.type(filter, "dev-01");

    expect(optionIds()).toEqual(["env-dev-01"]);
  });

  it("shows an empty state when nothing matches the filter", async () => {
    const user = userEvent.setup();
    renderSelect({
      environmentConnections: [environment("prd", "Production")],
    });

    const filter = await openWith(user);
    await user.type(filter, "no-such-environment");

    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(
      screen.getByText("No connections match your filter.")
    ).toBeInTheDocument();
  });

  it("selects a connection and closes the popover", async () => {
    const user = userEvent.setup();
    const { onValueChange } = renderSelect({
      environmentConnections: [
        environment("dev", "Development"),
        environment("prd", "Production"),
      ],
    });

    await openWith(user);
    await user.click(screen.getByText("Development"));

    expect(onValueChange).toHaveBeenCalledWith("env-dev");
    expect(screen.queryByTestId("connection-select-filter")).not.toBeInTheDocument();
  });

  it("clears the filter when the popover is closed and reopened", async () => {
    const user = userEvent.setup();
    renderSelect({
      environmentConnections: [
        environment("dev", "Development"),
        environment("prd", "Production"),
      ],
    });

    const filter = await openWith(user);
    await user.type(filter, "dev");
    expect(optionIds()).toEqual(["env-dev"]);

    // Close via Escape, then reopen.
    await user.keyboard("{Escape}");
    await openWith(user);

    expect(optionIds()).toEqual(["env-dev", "env-prd"]);
  });

  it("disables unhealthy environments", async () => {
    const user = userEvent.setup();
    renderSelect({
      environmentConnections: [
        environment("prd", "Production", { status: "Unhealthy" }),
        environment("dev", "Development", { status: "Healthy" }),
      ],
    });

    await openWith(user);

    expect(screen.getByText("Production").closest("button")).toBeDisabled();
    expect(screen.getByText("Development").closest("button")).not.toBeDisabled();
  });
});
