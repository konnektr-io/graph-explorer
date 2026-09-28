import { useState, useEffect, useCallback } from "react";
import {
  FileText,
  Database,
  GitBranch,
  Plus,
  ArrowRight,
  ArrowLeft,
  Trash2,
  Edit2,
  X,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EditableProperty } from "./EditableProperty";
import { ModelSelector } from "./ModelSelector";
import { ConfirmDeleteDialog } from "./ConfirmDeleteDialog";
import { useDigitalTwinsStore } from "@/stores/digitalTwinsStore";
import { useInspectorStore } from "@/stores/inspectorStore";
import type { DigitalTwinPropertyMetadata, BasicRelationship } from "@/types";
import {
  getModelDisplayName,
  getModelPropertyDefinitions,
  getModelRelationshipDefinitions,
} from "@/utils/dtdlHelpers";
import { formatApiError } from "@/utils/errorHelpers";
import { useAuth } from "@/services/auth/authContext";
import { CreateRelationshipDialog } from "@/components/layout/CreateRelationshipDialog";

interface TwinInspectorProps {
  twinId: string;
}

export function TwinInspector({ twinId }: TwinInspectorProps) {
  const {
    getTwin,
    getTwinById,
    updateTwinProperty,
    queryRelationships,
    deleteRelationship,
    deleteTwin,
  } = useDigitalTwinsStore();
  const { selectItem, clearSelection } = useInspectorStore();
  const { getAccessTokenSilently, getAccessTokenWithPopup } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Relationships state
  const [relationships, setRelationships] = useState<{
    outgoing: BasicRelationship[];
    incoming: BasicRelationship[];
  }>({ outgoing: [], incoming: [] });
  const [isLoadingRels, setIsLoadingRels] = useState(false);
  const [showCreateRelDialog, setShowCreateRelDialog] = useState(false);
  const [deletingRelId, setDeletingRelId] = useState<string | null>(null);
  const [isEditingModel, setIsEditingModel] = useState(false);
  const [isSavingModel, setIsSavingModel] = useState(false);

  // Delete confirmation state. A twin delete cascades to its relationships, so
  // the count is part of what the user is agreeing to.
  const [isDeleteTwinDialogOpen, setIsDeleteTwinDialogOpen] = useState(false);
  const [deleteTwinError, setDeleteTwinError] = useState<string | null>(null);
  const [relationshipToDelete, setRelationshipToDelete] =
    useState<BasicRelationship | null>(null);
  const [deleteRelError, setDeleteRelError] = useState<string | null>(null);

  const authCallbacks = {
    getAccessTokenSilently,
    getAccessTokenWithPopup: async (options: any) => {
      const token = await getAccessTokenWithPopup(options);
      if (!token) throw new Error("Failed to get token with popup");
      return token;
    },
  };

  // Fetch twin data when ID changes to ensure we have latest data
  useEffect(() => {
    const fetchTwin = async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        await getTwinById(twinId, authCallbacks);
      } catch (err) {
        console.error("Failed to fetch twin:", err);
        setLoadError("Failed to load twin data");
      } finally {
        setIsLoading(false);
      }
    };

    fetchTwin();
  }, [twinId, getTwinById, getAccessTokenSilently, getAccessTokenWithPopup]);

  // Load relationships for this twin
  const loadRelationships = useCallback(async () => {
    setIsLoadingRels(true);
    try {
      // Query outgoing relationships (where this twin is source)
      const outgoing = await queryRelationships(
        twinId,
        "outgoing",
        authCallbacks
      );
      // Query incoming relationships (where this twin is target)
      const incoming = await queryRelationships(
        twinId,
        "incoming",
        authCallbacks
      );
      setRelationships({ outgoing, incoming });
    } catch (err) {
      console.error("Failed to load relationships:", err);
    } finally {
      setIsLoadingRels(false);
    }
  }, [
    twinId,
    queryRelationships,
    getAccessTokenSilently,
    getAccessTokenWithPopup,
  ]);

  useEffect(() => {
    loadRelationships();
  }, [loadRelationships]);

  const twin = getTwin(twinId);

  if (isLoading && !twin) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        <div className="flex flex-col items-center gap-2">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          <span>Loading twin data...</span>
        </div>
      </div>
    );
  }

  if (!twin) {
    return (
      <div className="text-sm text-destructive p-4">
        {loadError || "Twin not found"}
      </div>
    );
  }

  const { $dtId, $metadata, ...existingProperties } = twin;
  const modelId = $metadata.$model;
  const modelDisplayName = getModelDisplayName(modelId);
  const propertyDefinitions = getModelPropertyDefinitions(modelId);
  const relationshipDefinitions = getModelRelationshipDefinitions(modelId);

  // Merge existing properties with model definitions to show all available properties
  const allProperties = new Set([
    ...Object.keys(existingProperties),
    ...Object.keys(propertyDefinitions),
  ]);

  // Filter out system properties that shouldn't be edited directly here if they leak in
  const editableProperties = Array.from(allProperties).filter(
    (key) => key !== "$etag" && key !== "$metadata" && key !== "$dtId"
  );

  const handlePropertySave = async (
    propertyName: string,
    newValue: unknown
  ) => {
    // Basic type conversion based on schema
    const definition = propertyDefinitions[propertyName];
    let typedValue = newValue;

    if (definition?.schema) {
      if (
        definition.schema === "double" ||
        definition.schema === "float" ||
        definition.schema === "integer" ||
        definition.schema === "long"
      ) {
        typedValue = Number(newValue);
      } else if (definition.schema === "boolean") {
        typedValue = String(newValue).toLowerCase() === "true";
      }
    }

    await updateTwinProperty(twinId, propertyName, typedValue, authCallbacks);
  };

  const handleModelUpdate = async (newModelId: string) => {
    setIsSavingModel(true);
    try {
      // Update the model using the special metadata path
      await updateTwinProperty(
        twinId,
        "$metadata/$model",
        newModelId,
        authCallbacks
      );
      setIsEditingModel(false);
    } catch (error) {
      console.error("Failed to update model:", error);
      // TODO: Show error toast
    } finally {
      setIsSavingModel(false);
    }
  };

  const handleRelationshipClick = (rel: BasicRelationship) => {
    selectItem({
      type: "relationship",
      id: rel.$relationshipId,
      data: rel,
    });
  };

  const handleTwinClick = (clickedTwinId: string) => {
    selectItem({
      type: "twin",
      id: clickedTwinId,
    });
  };

  // Relationship delete is confirmed, so the row button only arms the dialog.
  const handleDeleteRelationship = (rel: BasicRelationship) => {
    setDeleteRelError(null);
    setRelationshipToDelete(rel);
  };

  const confirmDeleteRelationship = async () => {
    if (!relationshipToDelete) return;
    const rel = relationshipToDelete;
    setDeletingRelId(rel.$relationshipId);
    setDeleteRelError(null);
    try {
      // Address the relationship by its own source twin — that is correct for
      // both outgoing and incoming rows, and it works for a relationship that
      // arrived from a query on the *other* twin.
      await deleteRelationship(
        rel.$sourceId,
        rel.$relationshipId,
        authCallbacks
      );
      // Refresh relationships after deletion
      await loadRelationships();
      setRelationshipToDelete(null);
      // The inspector may be showing the relationship we just removed.
      const selected = useInspectorStore.getState().selectedItem;
      if (selected?.type === "relationship" && selected.id === rel.$relationshipId) {
        clearSelection();
      }
    } catch (err) {
      console.error("Failed to delete relationship:", err);
      setDeleteRelError(formatApiError(err, "Failed to delete relationship"));
      throw err; // keeps the dialog open
    } finally {
      setDeletingRelId(null);
    }
  };

  const confirmDeleteTwin = async () => {
    setDeleteTwinError(null);
    try {
      await deleteTwin(twinId, authCallbacks);
      setIsDeleteTwinDialogOpen(false);
      // The inspector is rendering a twin that no longer exists.
      clearSelection();
    } catch (err) {
      console.error("Failed to delete twin:", err);
      setDeleteTwinError(formatApiError(err, "Failed to delete twin"));
      throw err; // keeps the dialog open
    }
  };

  const totalRelationships =
    relationships.outgoing.length + relationships.incoming.length;

  return (
    <div className="space-y-4">
      {/* Twin Identity */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Database className="w-4 h-4" />
            Digital Twin
          </h3>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => {
              setDeleteTwinError(null);
              setIsDeleteTwinDialogOpen(true);
            }}
            title="Delete twin"
            aria-label="Delete twin"
            data-delete-twin
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
          </Button>
        </div>
        <div className="space-y-2">
          <div className="flex justify-between items-start text-sm">
            <span className="text-muted-foreground">Twin ID</span>
            <code className="font-mono text-xs bg-muted px-2 py-1 rounded select-all">
              {$dtId}
            </code>
          </div>
          <div className="flex justify-between items-start text-sm">
            <span className="text-muted-foreground">Model</span>
            {isEditingModel ? (
              <div className="flex items-center gap-2 flex-1 min-w-0 ml-2">
                <div className="flex-1 min-w-0">
                  <ModelSelector
                    value={$metadata.$model}
                    onChange={handleModelUpdate}
                    disabled={isSavingModel}
                  />
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0 shrink-0"
                  onClick={() => setIsEditingModel(false)}
                  disabled={isSavingModel}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            ) : (
              <div
                className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 px-2 py-1 rounded group"
                onClick={() => setIsEditingModel(true)}
              >
                <Badge variant="outline" className="text-xs">
                  {modelDisplayName}
                </Badge>
                <Edit2 className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity" />
              </div>
            )}
          </div>
          <div className="flex justify-between items-start text-sm">
            <span className="text-muted-foreground">Model ID</span>
            <code className="font-mono text-xs text-right break-all select-all">
              {$metadata.$model}
            </code>
          </div>
        </div>
      </div>

      {/* Relationships */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <GitBranch className="w-4 h-4" />
            Relationships
            {totalRelationships > 0 && (
              <Badge variant="secondary" className="text-xs">
                {totalRelationships}
              </Badge>
            )}
          </h3>
          {relationshipDefinitions.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={() => setShowCreateRelDialog(true)}
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Add
            </Button>
          )}
        </div>

        {isLoadingRels ? (
          <div className="text-xs text-muted-foreground italic py-2">
            Loading relationships...
          </div>
        ) : totalRelationships === 0 ? (
          <div className="text-xs text-muted-foreground italic py-2">
            No relationships.
            {relationshipDefinitions.length > 0 && (
              <Button
                variant="link"
                size="sm"
                className="ml-1 h-auto p-0 text-xs"
                onClick={() => setShowCreateRelDialog(true)}
              >
                Add one?
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {/* Outgoing relationships */}
            {relationships.outgoing.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <ArrowRight className="w-3 h-3" />
                  Outgoing ({relationships.outgoing.length})
                </div>
                <div className="space-y-1">
                  {relationships.outgoing.map((rel) => (
                    <div
                      key={rel.$relationshipId}
                      className="group flex items-center gap-2 p-2 border rounded-md hover:bg-muted/50 transition-colors text-xs"
                    >
                      <div
                        className="flex-1 flex items-center justify-start gap-2 min-w-0 cursor-pointer"
                        onClick={() => handleRelationshipClick(rel)}
                      >
                        <Badge variant="outline" className="shrink-0">
                          {rel.$relationshipName}
                        </Badge>
                        <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                        <Button
                          variant="link"
                          size="sm"
                          className="font-mono truncate h-auto p-0 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTwinClick(rel.$targetId);
                          }}
                        >
                          {rel.$targetId}
                        </Button>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="opacity-0 group-hover:opacity-100 h-6 w-6 hover:bg-destructive/10 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteRelationship(rel);
                        }}
                        disabled={deletingRelId === rel.$relationshipId}
                        title="Delete relationship"
                        aria-label={`Delete relationship ${rel.$relationshipName} to ${rel.$targetId}`}
                      >
                        {deletingRelId === rel.$relationshipId ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Trash2 className="w-3 h-3 text-destructive" />
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Incoming relationships */}
            {relationships.incoming.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <ArrowLeft className="w-3 h-3" />
                  Incoming ({relationships.incoming.length})
                </div>
                <div className="space-y-1">
                  {relationships.incoming.map((rel) => (
                    <div
                      key={rel.$relationshipId}
                      className="group flex items-center gap-2 p-2 border rounded-md hover:bg-muted/50 transition-colors text-xs"
                    >
                      <div
                        className="flex-1 flex items-center justify-start gap-2 min-w-0 cursor-pointer"
                        onClick={() => handleRelationshipClick(rel)}
                      >
                        <Button
                          variant="link"
                          size="sm"
                          className="font-mono truncate h-auto p-0 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTwinClick(rel.$sourceId);
                          }}
                        >
                          {rel.$sourceId}
                        </Button>
                        <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                        <Badge variant="outline" className="shrink-0">
                          {rel.$relationshipName}
                        </Badge>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="opacity-0 group-hover:opacity-100 h-6 w-6 hover:bg-destructive/10 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteRelationship(rel);
                        }}
                        disabled={deletingRelId === rel.$relationshipId}
                        title="Delete relationship"
                        aria-label={`Delete relationship ${rel.$relationshipName} from ${rel.$sourceId}`}
                      >
                        {deletingRelId === rel.$relationshipId ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Trash2 className="w-3 h-3 text-destructive" />
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Properties */}
      <div className="space-y-2">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <FileText className="w-4 h-4" />
          Properties
        </h3>
        <div className="space-y-2">
          {editableProperties.length === 0 && (
            <div className="text-xs text-muted-foreground italic">
              No properties defined in model.
            </div>
          )}
          {editableProperties.map((key) => {
            // Value from twin, or undefined if not set
            const value = (twin as any)[key];
            const metadata = $metadata[key] as
              | DigitalTwinPropertyMetadata
              | undefined;
            const definition = propertyDefinitions[key];

            return (
              <EditableProperty
                key={key}
                name={
                  definition?.displayName
                    ? typeof definition.displayName === "string"
                      ? definition.displayName
                      : (definition.displayName as any).en || key
                    : key
                }
                value={value}
                metadata={metadata}
                onSave={(newValue) => handlePropertySave(key, newValue)}
              />
            );
          })}
        </div>
      </div>

      {/* Create Relationship Dialog */}
      <CreateRelationshipDialog
        open={showCreateRelDialog}
        onOpenChange={(open) => {
          setShowCreateRelDialog(open);
          if (!open) {
            // Refresh relationships when dialog closes (in case one was created)
            loadRelationships();
          }
        }}
        sourceTwinId={$dtId}
        sourceModelId={modelId}
      />

      {/* Delete Twin — cascades to every relationship touching this twin */}
      <ConfirmDeleteDialog
        open={isDeleteTwinDialogOpen}
        onOpenChange={setIsDeleteTwinDialogOpen}
        title="Delete Digital Twin"
        description={
          <>
            Are you sure you want to delete{" "}
            <code className="bg-muted px-1 py-0.5 rounded text-xs select-all break-all">
              {$dtId}
            </code>
            ?
            {totalRelationships > 0 ? (
              <>
                {" "}
                Its {totalRelationships}{" "}
                {totalRelationships === 1 ? "relationship" : "relationships"} will
                be deleted as well
                {relationships.outgoing.length > 0 &&
                  relationships.incoming.length > 0 &&
                  ` — ${relationships.outgoing.length} outgoing and ${relationships.incoming.length} incoming`}
                .
              </>
            ) : (
              " It has no relationships."
            )}{" "}
            This action cannot be undone.
          </>
        }
        confirmLabel="Delete Twin"
        onConfirm={confirmDeleteTwin}
        error={deleteTwinError}
      />

      {/* Delete Relationship */}
      <ConfirmDeleteDialog
        open={relationshipToDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRelationshipToDelete(null);
            setDeleteRelError(null);
          }
        }}
        title="Delete Relationship"
        description={
          relationshipToDelete ? (
            <>
              This will delete the{" "}
              <Badge variant="secondary" className="text-xs">
                {relationshipToDelete.$relationshipName}
              </Badge>{" "}
              relationship from{" "}
              <code className="bg-muted px-1 py-0.5 rounded text-xs select-all break-all">
                {relationshipToDelete.$sourceId}
              </code>{" "}
              to{" "}
              <code className="bg-muted px-1 py-0.5 rounded text-xs select-all break-all">
                {relationshipToDelete.$targetId}
              </code>
              . Both twins are kept; only the link between them is removed. This
              action cannot be undone.
            </>
          ) : null
        }
        confirmLabel="Delete Relationship"
        onConfirm={confirmDeleteRelationship}
        error={deleteRelError}
      />
    </div>
  );
}
