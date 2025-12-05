import React from "react";
import { GitBranch, Database, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useInspectorStore } from "@/stores/inspectorStore";
import type { BasicRelationship } from "@/types";

interface RelationshipInspectorProps {
  relationshipId: string;
}

export function RelationshipInspector({
  relationshipId: _relationshipId,
}: RelationshipInspectorProps): React.JSX.Element {
  const selectedItem = useInspectorStore((state) => state.selectedItem);
  const selectItem = useInspectorStore((state) => state.selectItem);

  // Get relationship data from the inspector store's selected item
  // The data is passed when the relationship is selected (e.g., from query results or TwinInspector)
  const relationship: BasicRelationship | null =
    selectedItem?.type === "relationship" && selectedItem.data
      ? (selectedItem.data as BasicRelationship)
      : null;

  if (!relationship) {
    return (
      <div className="text-sm text-muted-foreground p-4">
        <p>No relationship data available.</p>
        <p className="text-xs mt-2">
          Select a relationship from query results or a twin's relationships to inspect it.
        </p>
      </div>
    );
  }

  const handleNavigateToTwin = (twinId: string) => {
    selectItem({
      type: "twin",
      id: twinId,
    });
  };

  // Extract custom properties (non-$ prefixed)
  const customProperties = Object.entries(relationship).filter(
    ([key]) => !key.startsWith("$")
  );

  return (
    <div className="space-y-4">
      {/* Relationship Identity */}
      <div className="space-y-2">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <GitBranch className="w-4 h-4" />
          Relationship
        </h3>
        <div className="space-y-2">
          <div className="flex justify-between items-start text-sm">
            <span className="text-muted-foreground">Relationship ID</span>
            <code className="font-mono text-xs bg-muted px-2 py-1 rounded select-all">
              {relationship.$relationshipId}
            </code>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Type</span>
            <Badge variant="secondary" className="text-xs">
              {relationship.$relationshipName}
            </Badge>
          </div>
        </div>
      </div>

      {/* Connection Details */}
      <div className="space-y-2">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Database className="w-4 h-4" />
          Connection
        </h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-2 border rounded-md">
            <div className="text-sm">
              <div className="font-medium">Source Twin</div>
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs text-muted-foreground hover:text-primary"
                onClick={() => handleNavigateToTwin(relationship.$sourceId)}
              >
                {relationship.$sourceId}
              </Button>
            </div>
            <div className="mx-2 text-muted-foreground">→</div>
            <div className="text-sm text-right">
              <div className="font-medium">Target Twin</div>
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs text-muted-foreground hover:text-primary"
                onClick={() => handleNavigateToTwin(relationship.$targetId)}
              >
                {relationship.$targetId}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Properties */}
      {customProperties.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Tag className="w-4 h-4" />
            Properties
          </h3>
          <div className="space-y-2">
            {customProperties.map(([key, value]) => (
              <div
                key={key}
                className="flex justify-between items-start text-sm"
              >
                <span className="text-muted-foreground min-w-0 flex-1">
                  {key}
                </span>
                <div className="ml-2 text-right">
                  <div className="font-mono text-xs break-all">
                    {typeof value === "object" && value !== null
                      ? JSON.stringify(value)
                      : String(value ?? "")}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="pt-4 border-t">
        <div className="text-xs text-muted-foreground space-y-1">
          <div>Click twin IDs to navigate</div>
        </div>
      </div>
    </div>
  );
}

