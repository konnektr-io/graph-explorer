import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const deleteRelationship = vi.fn();
const deleteTwin = vi.fn();
const queryRelationships = vi.fn();
const getTwin = vi.fn();
const getTwinById = vi.fn();
const updateTwinProperty = vi.fn();

vi.mock("@/stores/digitalTwinsStore", () => ({
  useDigitalTwinsStore: () => ({
    deleteRelationship: (...a: unknown[]) => deleteRelationship(...a),
    deleteTwin: (...a: unknown[]) => deleteTwin(...a),
    queryRelationships: (...a: unknown[]) => queryRelationships(...a),
    getTwin: (...a: unknown[]) => getTwin(...a),
    getTwinById: (...a: unknown[]) => getTwinById(...a),
    updateTwinProperty: (...a: unknown[]) => updateTwinProperty(...a),
  }),
}));

const selectItem = vi.fn();
const clearSelection = vi.fn();
const inspectorState = { selectedItem: null as unknown };
// The component destructures the hook, so the mock must be a callable that
// also exposes getState (used to read the current selection after a delete).
vi.mock("@/stores/inspectorStore", () => ({
  useInspectorStore: Object.assign(
    () => ({ selectItem, clearSelection }),
    { getState: () => inspectorState }
  ),
}));

vi.mock("@/utils/dtdlHelpers", () => ({
  getModelDisplayName: (id: string) => id.split(":").pop() ?? id,
  getModelPropertyDefinitions: () => ({}),
  getModelRelationshipDefinitions: () => [],
}));

// The create-relationship dialog pulls in the client factory and query search;
// it is not under test here.
vi.mock("@/components/layout/CreateRelationshipDialog", () => ({
  CreateRelationshipDialog: () => null,
}));

const getAccessTokenSilently = vi.fn().mockResolvedValue("token");
const getAccessTokenWithPopup = vi.fn().mockResolvedValue("token");
vi.mock("@/services/auth/authContext", () => ({
  useAuth: () => ({ getAccessTokenSilently, getAccessTokenWithPopup }),
}));

import { TwinInspector } from "@/components/inspector/TwinInspector";

const twin = {
  $dtId: "pump-1",
  $metadata: { $model: "dtmi:com:example:Pump;1" },
  name: "Pump A",
};

const outgoingRel = {
  $relationshipId: "rel-out",
  $relationshipName: "contains",
  $sourceId: "pump-1",
  $targetId: "valve-1",
};

const incomingRel = {
  $relationshipId: "rel-in",
  $relationshipName: "feeds",
  $sourceId: "boiler-1",
  $targetId: "pump-1",
};

/** queryRelationships is called once per direction, in that order. */
const stubRels = (outgoing: unknown[], incoming: unknown[]) => {
  queryRelationships.mockImplementation((_id: string, type: string) =>
    Promise.resolve(type === "outgoing" ? outgoing : incoming)
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  getAccessTokenSilently.mockResolvedValue("token");
  getAccessTokenWithPopup.mockResolvedValue("token");
  getTwin.mockReturnValue(twin);
  getTwinById.mockResolvedValue(twin);
  deleteRelationship.mockResolvedValue(undefined);
  deleteTwin.mockResolvedValue(undefined);
  queryRelationships.mockResolvedValue([]);
  inspectorState.selectedItem = { type: "twin", id: "pump-1" };
});

describe("TwinInspector — delete twin", () => {
  it("does not call the store until the dialog is confirmed", async () => {
    const user = userEvent.setup();
    stubRels([], []);
    render(<TwinInspector twinId="pump-1" />);

    await user.click(screen.getByRole("button", { name: "Delete twin" }));

    expect(deleteTwin).not.toHaveBeenCalled();
    expect(
      screen.getByRole("alertdialog", { name: /delete digital twin/i })
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete Twin" }));

    await waitFor(() => expect(deleteTwin).toHaveBeenCalledTimes(1));
    expect(deleteTwin.mock.calls[0][0]).toBe("pump-1");
  });

  it("clears the inspector selection after a successful delete", async () => {
    const user = userEvent.setup();
    stubRels([], []);
    render(<TwinInspector twinId="pump-1" />);

    await user.click(screen.getByRole("button", { name: "Delete twin" }));
    await user.click(screen.getByRole("button", { name: "Delete Twin" }));

    await waitFor(() => expect(clearSelection).toHaveBeenCalled());
  });

  it("warns that relationships will be deleted too", async () => {
    const user = userEvent.setup();
    stubRels([outgoingRel], [incomingRel]);
    render(<TwinInspector twinId="pump-1" />);

    await screen.findByText("valve-1");
    await user.click(screen.getByRole("button", { name: "Delete twin" }));

    const dialog = screen.getByRole("alertdialog", { name: /delete digital twin/i });
    expect(dialog).toHaveTextContent(/its 2 relationships will be deleted/i);
    expect(dialog).toHaveTextContent(/1 outgoing and 1 incoming/i);
  });

  it("uses the singular form for a single relationship", async () => {
    const user = userEvent.setup();
    stubRels([outgoingRel], []);
    render(<TwinInspector twinId="pump-1" />);

    await screen.findByText("valve-1");
    await user.click(screen.getByRole("button", { name: "Delete twin" }));

    const dialog = screen.getByRole("alertdialog", { name: /delete digital twin/i });
    expect(dialog).toHaveTextContent(/its 1 relationship will be deleted/i);
  });

  it("says the twin has no relationships when it has none", async () => {
    const user = userEvent.setup();
    stubRels([], []);
    render(<TwinInspector twinId="pump-1" />);

    await user.click(screen.getByRole("button", { name: "Delete twin" }));

    const dialog = screen.getByRole("alertdialog", { name: /delete digital twin/i });
    expect(dialog).toHaveTextContent(/it has no relationships/i);
  });

  it("keeps the dialog open and shows the error when the delete fails", async () => {
    const user = userEvent.setup();
    stubRels([], []);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    deleteTwin.mockRejectedValue(new Error("Twin still has relationships"));
    render(<TwinInspector twinId="pump-1" />);

    await user.click(screen.getByRole("button", { name: "Delete twin" }));
    await user.click(screen.getByRole("button", { name: "Delete Twin" }));

    const dialog = await screen.findByRole("alertdialog", {
      name: /delete digital twin/i,
    });
    await waitFor(() =>
      expect(dialog).toHaveTextContent(/twin still has relationships/i)
    );
    // Still open, and the selection was not cleared behind the user's back.
    expect(clearSelection).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("lets the user back out without deleting", async () => {
    const user = userEvent.setup();
    stubRels([], []);
    render(<TwinInspector twinId="pump-1" />);

    await user.click(screen.getByRole("button", { name: "Delete twin" }));
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    await waitFor(() =>
      expect(
        screen.queryByRole("alertdialog", { name: /delete digital twin/i })
      ).not.toBeInTheDocument()
    );
    expect(deleteTwin).not.toHaveBeenCalled();
  });
});

describe("TwinInspector — delete relationship", () => {
  it("offers delete on an OUTGOING relationship and confirms first", async () => {
    const user = userEvent.setup();
    stubRels([outgoingRel], []);
    render(<TwinInspector twinId="pump-1" />);

    await screen.findByText("valve-1");
    await user.click(
      screen.getByRole("button", { name: /delete relationship contains to valve-1/i })
    );

    expect(deleteRelationship).not.toHaveBeenCalled();
    expect(
      screen.getByRole("alertdialog", { name: /delete relationship/i })
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /^delete relationship$/i })
    );

    await waitFor(() => expect(deleteRelationship).toHaveBeenCalledTimes(1));
    // Addressed by its own source twin.
    expect(deleteRelationship.mock.calls[0][0]).toBe("pump-1");
    expect(deleteRelationship.mock.calls[0][1]).toBe("rel-out");
  });

  it("offers delete on an INCOMING relationship, addressed by the other twin", async () => {
    const user = userEvent.setup();
    stubRels([], [incomingRel]);
    render(<TwinInspector twinId="pump-1" />);

    await screen.findByText("boiler-1");
    await user.click(
      screen.getByRole("button", { name: /delete relationship feeds from boiler-1/i })
    );

    await user.click(
      screen.getByRole("button", { name: /^delete relationship$/i })
    );

    await waitFor(() => expect(deleteRelationship).toHaveBeenCalledTimes(1));
    // The relationship's source is boiler-1, NOT the inspected twin.
    expect(deleteRelationship.mock.calls[0][0]).toBe("boiler-1");
    expect(deleteRelationship.mock.calls[0][1]).toBe("rel-in");
  });

  it("does not navigate to the relationship when its delete button is clicked", async () => {
    const user = userEvent.setup();
    stubRels([outgoingRel], []);
    render(<TwinInspector twinId="pump-1" />);

    await screen.findByText("valve-1");
    selectItem.mockClear();
    await user.click(
      screen.getByRole("button", { name: /delete relationship contains to valve-1/i })
    );

    expect(selectItem).not.toHaveBeenCalled();
  });

  it("clears the selection when the deleted relationship is the one on screen", async () => {
    const user = userEvent.setup();
    stubRels([outgoingRel], []);
    inspectorState.selectedItem = {
      type: "relationship",
      id: "rel-out",
      data: outgoingRel,
    };
    render(<TwinInspector twinId="pump-1" />);

    await screen.findByText("valve-1");
    await user.click(
      screen.getByRole("button", { name: /delete relationship contains to valve-1/i })
    );
    await user.click(
      screen.getByRole("button", { name: /^delete relationship$/i })
    );

    await waitFor(() => expect(clearSelection).toHaveBeenCalled());
  });

  it("keeps the dialog open and shows the error when the delete fails", async () => {
    const user = userEvent.setup();
    stubRels([outgoingRel], []);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    deleteRelationship.mockRejectedValue(new Error("Relationship not found"));
    render(<TwinInspector twinId="pump-1" />);

    await screen.findByText("valve-1");
    await user.click(
      screen.getByRole("button", { name: /delete relationship contains to valve-1/i })
    );
    await user.click(
      screen.getByRole("button", { name: /^delete relationship$/i })
    );

    const dialog = await screen.findByRole("alertdialog", {
      name: /delete relationship/i,
    });
    await waitFor(() =>
      expect(dialog).toHaveTextContent(/relationship not found/i)
    );
    expect(clearSelection).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("re-queries relationships after a successful delete", async () => {
    const user = userEvent.setup();
    stubRels([outgoingRel], []);
    render(<TwinInspector twinId="pump-1" />);

    await screen.findByText("valve-1");
    const before = queryRelationships.mock.calls.length;
    await user.click(
      screen.getByRole("button", { name: /delete relationship contains to valve-1/i })
    );
    await user.click(
      screen.getByRole("button", { name: /^delete relationship$/i })
    );

    await waitFor(() =>
      expect(queryRelationships.mock.calls.length).toBeGreaterThan(before)
    );
  });
});
