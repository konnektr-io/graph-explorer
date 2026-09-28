import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const deleteRelationship = vi.fn();
vi.mock("@/stores/digitalTwinsStore", () => ({
  useDigitalTwinsStore: (selector: (s: unknown) => unknown) =>
    selector({ deleteRelationship }),
}));

const selectItem = vi.fn();
const clearSelection = vi.fn();
const inspectorState = { selectedItem: null as unknown };
vi.mock("@/stores/inspectorStore", () => ({
  useInspectorStore: (selector: (s: unknown) => unknown) =>
    selector({ selectItem, clearSelection, selectedItem: inspectorState.selectedItem }),
}));

const getAccessTokenSilently = vi.fn().mockResolvedValue("token");
const getAccessTokenWithPopup = vi.fn().mockResolvedValue("token");
vi.mock("@/services/auth/authContext", () => ({
  useAuth: () => ({ getAccessTokenSilently, getAccessTokenWithPopup }),
}));

import { RelationshipInspector } from "@/components/inspector/RelationshipInspector";

const relationship = {
  $relationshipId: "rel-1",
  $relationshipName: "contains",
  $sourceId: "room-1",
  $targetId: "pump-1",
  capacity: 250,
};

const renderRelationship = () =>
  render(<RelationshipInspector relationshipId="rel-1" />);

beforeEach(() => {
  vi.clearAllMocks();
  getAccessTokenSilently.mockResolvedValue("token");
  getAccessTokenWithPopup.mockResolvedValue("token");
  deleteRelationship.mockResolvedValue(undefined);
  inspectorState.selectedItem = {
    type: "relationship",
    id: "rel-1",
    data: relationship,
  };
});

describe("RelationshipInspector — delete", () => {
  it("renders a delete affordance", () => {
    renderRelationship();
    expect(
      screen.getByRole("button", { name: /delete relationship/i })
    ).toBeInTheDocument();
  });

  it("confirms before deleting, and never calls the store on its own", async () => {
    const user = userEvent.setup();
    renderRelationship();

    await user.click(screen.getByRole("button", { name: /delete relationship/i }));

    expect(deleteRelationship).not.toHaveBeenCalled();
    const dialog = screen.getByRole("alertdialog", { name: /delete relationship/i });
    expect(dialog).toHaveTextContent(/only the link between them is removed/i);

    await user.click(screen.getByRole("button", { name: /^delete relationship$/i }));

    await waitFor(() => expect(deleteRelationship).toHaveBeenCalledTimes(1));
    // Addressed by the relationship's own source twin.
    expect(deleteRelationship.mock.calls[0][0]).toBe("room-1");
    expect(deleteRelationship.mock.calls[0][1]).toBe("rel-1");
  });

  it("shows both endpoints in the confirmation", async () => {
    const user = userEvent.setup();
    renderRelationship();

    await user.click(screen.getByRole("button", { name: /delete relationship/i }));

    const dialog = screen.getByRole("alertdialog", { name: /delete relationship/i });
    expect(dialog).toHaveTextContent("room-1");
    expect(dialog).toHaveTextContent("pump-1");
    expect(dialog).toHaveTextContent("contains");
  });

  it("closes and clears the selection after a successful delete", async () => {
    const user = userEvent.setup();
    renderRelationship();

    await user.click(screen.getByRole("button", { name: /delete relationship/i }));
    await user.click(screen.getByRole("button", { name: /^delete relationship$/i }));

    await waitFor(() => expect(clearSelection).toHaveBeenCalled());
    await waitFor(() =>
      expect(
        screen.queryByRole("alertdialog", { name: /delete relationship/i })
      ).not.toBeInTheDocument()
    );
  });

  it("keeps the dialog open and shows the error when the delete fails", async () => {
    const user = userEvent.setup();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    deleteRelationship.mockRejectedValue(new Error("Relationship not found"));
    renderRelationship();

    await user.click(screen.getByRole("button", { name: /delete relationship/i }));
    await user.click(screen.getByRole("button", { name: /^delete relationship$/i }));

    const dialog = await screen.findByRole("alertdialog", {
      name: /delete relationship/i,
    });
    await waitFor(() =>
      expect(dialog).toHaveTextContent(/relationship not found/i)
    );
    // The selection is not cleared — the relationship is still there.
    expect(clearSelection).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("lets the user cancel without deleting", async () => {
    const user = userEvent.setup();
    renderRelationship();

    await user.click(screen.getByRole("button", { name: /delete relationship/i }));
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    await waitFor(() =>
      expect(
        screen.queryByRole("alertdialog", { name: /delete relationship/i })
      ).not.toBeInTheDocument()
    );
    expect(deleteRelationship).not.toHaveBeenCalled();
    expect(clearSelection).not.toHaveBeenCalled();
  });

  it("offers no delete when there is no relationship selected", () => {
    inspectorState.selectedItem = null;
    renderRelationship();
    expect(
      screen.queryByRole("button", { name: /delete relationship/i })
    ).not.toBeInTheDocument();
    expect(screen.getByText(/no relationship data available/i)).toBeInTheDocument();
  });
});
