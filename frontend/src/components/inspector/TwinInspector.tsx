import { useState, useEffect, useCallback } from "react";
import { FileText, Database, GitBranch, Plus, ArrowRight, ArrowLeft, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EditableProperty } from "./EditableProperty";
import { MetadataTooltip } from "@/components/ui/metadata-tooltip";
import { useDigitalTwinsStore } from "@/stores/digitalTwinsStore";
import { useInspectorStore } from "@/stores/inspectorStore";
import type { DigitalTwinPropertyMetadata, BasicRelationship } from "@/types";
import {
  getModelDisplayName,
  getModelPropertyDefinitions,
  getModelRelationshipDefinitions,
} from "@/utils/dtdlHelpers";
import { useAuth0 } from "@auth0/auth0-react";
import { CreateRelationshipDialog } from "@/components/layout/CreateRelationshipDialog";

interface TwinInspectorProps {
  twinId: string;
}

export function TwinInspector({ twinId }: TwinInspectorProps) {
  const { getTwin, getTwinById, updateTwinProperty, queryRelationships, deleteRelationship } =
    useDigitalTwinsStore();
  const { selectItem } = useInspectorStore();
  const { getAccessTokenSilently, getAccessTokenWithPopup } = useAuth0();
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
      const outgoing = await queryRelationships(twinId, "outgoing", authCallbacks);
      // Query incoming relationships (where this twin is target)
      const incoming = await queryRelationships(twinId, "incoming", authCallbacks);
      setRelationships({ outgoing, incoming });
    } catch (err) {
      console.error("Failed to load relationships:", err);
    } finally {
      setIsLoadingRels(false);
    }
  }, [twinId, queryRelationships, getAccessTokenSilently, getAccessTokenWithPopup]);

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

  const handlePropertySave = async (propertyName: string, newValue: unknown) => {
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

  const handleDeleteRelationship = async (rel: BasicRelationship) => {
    setDeletingRelId(rel.$relationshipId);
    try {
      await deleteRelationship(rel.$sourceId, rel.$relationshipId, authCallbacks);
      // Refresh relationships after deletion
      await loadRelationships();
    } catch (err) {
      console.error("Failed to delete relationship:", err);
    } finally {
      setDeletingRelId(null);
    }
  };

  const totalRelationships = relationships.outgoing.length + relationships.incoming.length;

  return (
    <div className="space-y-4">
      {/* Twin Identity */}
      <div className="space-y-2">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Database className="w-4 h-4" />
          Digital Twin
        </h3>
        <div className="space-y-2">
          <div className="flex justify-between items-start text-sm">
            <span className="text-muted-foreground">Twin ID</span>
            <code className="font-mono text-xs bg-muted px-2 py-1 rounded select-all">
              {$dtId}
            </code>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Model</span>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {modelDisplayName}
              </Badge>
            </div>
          </div>
          <div className="flex justify-between items-start text-sm">
            <span className="text-muted-foreground">Model ID</span>
            <code className="font-mono text-xs text-right break-all max-w-[200px] select-all">
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
                      <Button
                        variant="ghost"
                        size="sm"
                        className="flex-1 justify-start h-auto p-0 gap-2 min-w-0"
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
                      </Button>
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
                      >
                        <Trash2 className="w-3 h-3 text-destructive" />
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
                      <Button
                        variant="ghost"
                        size="sm"
                        className="flex-1 justify-start h-auto p-0 gap-2 min-w-0"
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
            const metadata = $metadata[key] as DigitalTwinPropertyMetadata | undefined;
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

      {/* Quick Actions */}
      <div className="pt-4 border-t">
        <MetadataTooltip
          metadata={{
            lastUpdateTime: $metadata.$lastUpdateTime as string | undefined,
          }}
        >
          <div className="text-xs text-muted-foreground space-y-1">
            <div>Click properties to edit • Hover for metadata</div>
            <div>Changes save automatically</div>
          </div>
        </MetadataTooltip>
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
    </div>
  );
}
