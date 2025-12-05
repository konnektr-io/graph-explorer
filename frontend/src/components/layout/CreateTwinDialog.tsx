import { useState } from "react";
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
import { useDigitalTwinsStore } from "@/stores/digitalTwinsStore";
import { useInspectorStore } from "@/stores/inspectorStore";
import { getModelDisplayName } from "@/utils/dtdlHelpers"; // Assuming this exists as it is used in ModelSidebar

// Checking ModelSidebar imports, I don't see toast. I'll stick to store actions and local state.

interface CreateTwinDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modelId: string;
}

export function CreateTwinDialog({
  open,
  onOpenChange,
  modelId,
}: CreateTwinDialogProps) {
  const [twinId, setTwinId] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { createTwin } = useDigitalTwinsStore();
  const { selectItem } = useInspectorStore();

  const handleCreate = async () => {
    setIsCreating(true);
    setError(null);
    try {
      const idToUse = twinId.trim() || undefined; // If empty, store might auto-generate or we allow it
      
      const newTwinId = await createTwin({
        $dtId: idToUse || "", // If store handles empty string as "auto-generate", good. If not, we might need to handle it.
        // DigitalTwinsStore createTwin implementation:
        // const twinId = twinData.$dtId || `twin-${Date.now()}...`
        // So empty string is fine.
        $metadata: {
          $model: modelId,
        },
      });

      // Select the new twin in the inspector
      // Assuming inspector store supports 'twin' type
      selectItem({ type: "twin", id: newTwinId });

      onOpenChange(false);
      setTwinId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create twin");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create Twin</DialogTitle>
          <DialogDescription>
            Create a new digital twin from model{" "}
            <code className="bg-muted px-1 py-0.5 rounded text-xs select-all">
              {getModelDisplayName(modelId) || modelId}
            </code>
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="twin-id">Twin ID (Optional)</Label>
            <Input
              id="twin-id"
              value={twinId}
              onChange={(e) => setTwinId(e.target.value)}
              placeholder="Leave empty to auto-generate"
            />
          </div>
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">
              {error}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isCreating}
          >
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={isCreating}>
            {isCreating ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
