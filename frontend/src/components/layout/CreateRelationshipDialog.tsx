import { useState, useMemo, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDigitalTwinsStore } from "@/stores/digitalTwinsStore";
import { useInspectorStore } from "@/stores/inspectorStore";
import {
  getModelRelationshipDefinitions,
  getRelationshipDisplayName,
  getModelDisplayName,
} from "@/utils/dtdlHelpers";
import { useAuth0 } from "@auth0/auth0-react";
import { Search, ArrowRight, AlertCircle, Loader2 } from "lucide-react";
import type { BasicDigitalTwin } from "@/types";

interface CreateRelationshipDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceTwinId: string;
  sourceModelId: string;
}

export function CreateRelationshipDialog({
  open,
  onOpenChange,
  sourceTwinId,
  sourceModelId,
}: CreateRelationshipDialogProps) {
  const [selectedRelationshipType, setSelectedRelationshipType] = useState<string>("");
  const [targetTwinId, setTargetTwinId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search state
  const [searchResults, setSearchResults] = useState<BasicDigitalTwin[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  const { createRelationship, queryTwins } = useDigitalTwinsStore();
  const { selectItem } = useInspectorStore();
  const { getAccessTokenSilently, getAccessTokenWithPopup } = useAuth0();

  const authCallbacks = useMemo(
    () => ({
      getAccessTokenSilently,
      getAccessTokenWithPopup: async (options: any) => {
        const token = await getAccessTokenWithPopup(options);
        if (!token) throw new Error("Failed to get token with popup");
        return token;
      },
    }),
    [getAccessTokenSilently, getAccessTokenWithPopup]
  );

  // Get relationship definitions from the source twin's model
  const relationshipDefs = useMemo(
    () => getModelRelationshipDefinitions(sourceModelId),
    [sourceModelId]
  );

  // Get the currently selected relationship definition
  const selectedRelDef = useMemo(
    () => relationshipDefs.find((r) => r.name === selectedRelationshipType),
    [relationshipDefs, selectedRelationshipType]
  );

  // Search for twins using ADT query
  const searchTwins = useCallback(
    async (input: string) => {
      if (!input.trim() && !selectedRelDef?.target) {
        setSearchResults([]);
        return;
      }

      setIsSearching(true);
      try {
        // Build ADT query similar to the example provided
        let query = "SELECT TOP (50) twins FROM DIGITALTWINS twins";

        const conditions: string[] = [];

        // Add search condition if input is provided
        if (input.trim()) {
          const searchCondition = `(CONTAINS(twins.$dtId,'${input}') OR CONTAINS(twins.name,'${input}') OR CONTAINS(twins.displayName,'${input}'))`;
          conditions.push(searchCondition);
        }

        // Add model filter if relationship has a target constraint
        if (selectedRelDef?.target) {
          conditions.push(`IS_OF_MODEL(twins,'${selectedRelDef.target}')`);
        }

        // Add WHERE clause if we have conditions
        if (conditions.length > 0) {
          query += ` WHERE ${conditions.join(" AND ")}`;
        }

        const result = await queryTwins(
          query,
          authCallbacks.getAccessTokenSilently,
          authCallbacks.getAccessTokenWithPopup
        );

        // Filter out the source twin from results
        const filteredTwins = result.twins.filter(
          (twin: BasicDigitalTwin) => twin.$dtId !== sourceTwinId
        );
        setSearchResults(filteredTwins);
      } catch (err) {
        console.error("Failed to search twins:", err);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    },
    [selectedRelDef, sourceTwinId, queryTwins, authCallbacks]
  );

  // Debounced search - trigger search after typing stops
  useEffect(() => {
    if (!selectedRelationshipType) return;

    const timer = setTimeout(() => {
      if (searchQuery.trim() || selectedRelDef?.target) {
        searchTwins(searchQuery);
        setShowDropdown(true);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, searchTwins, selectedRelationshipType, selectedRelDef?.target]);

  // Load initial results when relationship type is selected (for constrained targets)
  useEffect(() => {
    if (selectedRelationshipType && selectedRelDef?.target) {
      searchTwins("");
    }
  }, [selectedRelationshipType, selectedRelDef?.target, searchTwins]);

  const handleCreate = async () => {
    if (!selectedRelationshipType) {
      setError("Please select a relationship type");
      return;
    }
    if (!targetTwinId.trim()) {
      setError("Please select a target twin");
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const relationshipId = await createRelationship(
        {
          $sourceId: sourceTwinId,
          $targetId: targetTwinId.trim(),
          $relationshipName: selectedRelationshipType,
          $relationshipId: "",
        },
        authCallbacks
      );

      // Select the newly created relationship in inspector
      selectItem({
        type: "relationship",
        id: relationshipId,
        data: {
          $relationshipId: relationshipId,
          $sourceId: sourceTwinId,
          $targetId: targetTwinId.trim(),
          $relationshipName: selectedRelationshipType,
        },
      });

      // Reset and close
      onOpenChange(false);
      resetForm();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create relationship"
      );
    } finally {
      setIsCreating(false);
    }
  };

  const resetForm = () => {
    setSelectedRelationshipType("");
    setTargetTwinId("");
    setSearchQuery("");
    setSearchResults([]);
    setShowDropdown(false);
    setError(null);
  };

  const handleClose = () => {
    if (!isCreating) {
      onOpenChange(false);
      resetForm();
    }
  };

  const handleSelectTarget = (twin: BasicDigitalTwin) => {
    setTargetTwinId(twin.$dtId);
    setSearchQuery(twin.$dtId);
    setShowDropdown(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create Relationship</DialogTitle>
          <DialogDescription>
            Create a new relationship from{" "}
            <code className="bg-muted px-1 py-0.5 rounded text-xs">
              {sourceTwinId}
            </code>
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Relationship Type Selection */}
          <div className="grid gap-2">
            <Label htmlFor="relationship-type">Relationship Type</Label>
            {relationshipDefs.length > 0 ? (
              <Select
                value={selectedRelationshipType}
                onValueChange={(value) => {
                  setSelectedRelationshipType(value);
                  // Reset target when relationship type changes
                  setTargetTwinId("");
                  setSearchQuery("");
                  setSearchResults([]);
                }}
              >
                <SelectTrigger id="relationship-type">
                  <SelectValue placeholder="Select relationship type" />
                </SelectTrigger>
                <SelectContent>
                  {relationshipDefs.map((rel) => (
                    <SelectItem key={rel.name} value={rel.name}>
                      <div className="flex items-center gap-2">
                        <span>{getRelationshipDisplayName(rel)}</span>
                        {rel.target && (
                          <span className="text-muted-foreground text-xs">
                            → {getModelDisplayName(rel.target)}
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground p-2 border rounded-md">
                <AlertCircle className="w-4 h-4" />
                No relationships defined in model
              </div>
            )}
          </div>

          {/* Target Twin Search */}
          {selectedRelationshipType && (
            <div className="grid gap-2">
              <Label htmlFor="target-twin">
                Target Twin
                {selectedRelDef?.target && (
                  <span className="text-muted-foreground font-normal ml-2 text-xs">
                    ({getModelDisplayName(selectedRelDef.target)})
                  </span>
                )}
              </Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="target-twin"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setTargetTwinId(""); // Clear selection when typing
                  }}
                  onFocus={() => {
                    if (searchResults.length > 0) {
                      setShowDropdown(true);
                    }
                  }}
                  placeholder="Search twins by ID or name..."
                  className="pl-8 pr-8"
                />
                {isSearching && (
                  <Loader2 className="absolute right-2 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>

              {/* Search results dropdown */}
              {showDropdown && searchResults.length > 0 && (
                <div className="max-h-48 overflow-y-auto border rounded-md bg-popover shadow-md">
                  {searchResults.map((twin) => (
                    <Button
                      key={twin.$dtId}
                      variant="ghost"
                      className="w-full justify-start px-3 py-2 h-auto rounded-none hover:bg-muted"
                      onClick={() => handleSelectTarget(twin)}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="font-mono text-sm truncate">
                          {twin.$dtId}
                        </span>
                        <span className="text-muted-foreground text-xs ml-2 shrink-0">
                          {getModelDisplayName(twin.$metadata.$model)}
                        </span>
                      </div>
                    </Button>
                  ))}
                </div>
              )}

              {/* No results message */}
              {showDropdown &&
                !isSearching &&
                searchQuery.trim() &&
                searchResults.length === 0 && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground p-2 border rounded-md">
                    <AlertCircle className="w-4 h-4" />
                    No twins found matching "{searchQuery}"
                  </div>
                )}

              {/* Selected target preview */}
              {targetTwinId && (
                <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/50">
                  <code className="text-xs">{sourceTwinId}</code>
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">
                    {selectedRelationshipType}
                  </span>
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  <code className="text-xs">{targetTwinId}</code>
                </div>
              )}
            </div>
          )}

          {/* Error display */}
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isCreating}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={
              isCreating ||
              !selectedRelationshipType ||
              !targetTwinId.trim() ||
              relationshipDefs.length === 0
            }
          >
            {isCreating ? "Creating..." : "Create Relationship"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
