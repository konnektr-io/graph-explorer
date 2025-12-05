import { useState, useRef } from "react";
import { Upload, FileJson, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useModelsStore } from "@/stores/modelsStore";
import { useAuth0 } from "@auth0/auth0-react";
import { cn } from "@/lib/utils";

type ImportMode = "paste" | "upload";

interface ImportModelsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMode?: ImportMode;
}

export function ImportModelsDialog({
  open,
  onOpenChange,
  initialMode = "paste",
}: ImportModelsDialogProps) {
  const [mode, setMode] = useState<ImportMode>(initialMode);
  const [jsonContent, setJsonContent] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { uploadModel, uploadModels } = useModelsStore();
  const { getAccessTokenSilently, getAccessTokenWithPopup } = useAuth0();

  // Helper to ensure auth tokens are passed
  const getAuth = () => ({
    getAccessTokenSilently,
    getAccessTokenWithPopup: async (options?: any) => {
      const token = await getAccessTokenWithPopup(options);
      if (!token) throw new Error("Failed to get token with popup");
      return token;
    },
  });

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      // Filter for JSON files only if needed, or just take them
      setFiles(e.dataTransfer.files);
    }
  };

  const handleImport = async () => {
    setIsImporting(true);
    setError(null);
    try {
      let modelsToUpload: any[] = [];

      if (mode === "paste") {
        if (!jsonContent.trim()) {
          throw new Error("Please paste JSON content");
        }
        try {
          const parsed = JSON.parse(jsonContent);
          if (Array.isArray(parsed)) {
            modelsToUpload = parsed;
          } else {
            modelsToUpload = [parsed];
          }
        } catch (e) {
          throw new Error("Invalid JSON syntax");
        }
      } else {
        if (!files || files.length === 0) {
          throw new Error("Please select files to upload");
        }

        // Read all files
        const filePromises = Array.from(files).map((file) => {
          return new Promise<any>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
              try {
                const text = e.target?.result as string;
                const parsed = JSON.parse(text);
                resolve(parsed);
              } catch (err) {
                reject(new Error(`Failed to parse ${file.name}: Invalid JSON`));
              }
            };
            reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
            reader.readAsText(file);
          });
        });

        const results = await Promise.all(filePromises);
        
        // Flatten results (handle files containing arrays)
        results.forEach((result) => {
          if (Array.isArray(result)) {
            modelsToUpload.push(...result);
          } else {
            modelsToUpload.push(result);
          }
        });
      }

      if (modelsToUpload.length === 0) {
        throw new Error("No models found to import");
      }

      // Check DTDL basic validity (has @id)
      const invalidModels = modelsToUpload.filter((m) => !m["@id"]);
      if (invalidModels.length > 0) {
        throw new Error(`Found ${invalidModels.length} models without @id`);
      }

      const auth = getAuth();
      if (modelsToUpload.length === 1) {
        await uploadModel(modelsToUpload[0], auth);
      } else {
        await uploadModels(modelsToUpload, auth);
      }

      onOpenChange(false);
      // Reset state
      setJsonContent("");
      setFiles(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import models");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Import Models</DialogTitle>
          <DialogDescription>
            Import DTDL models by pasting JSON or uploading files.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 mb-4">
          <Button
            variant={mode === "paste" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setMode("paste")}
            className="flex-1"
          >
            <Type className="w-4 h-4 mr-2" />
            Paste JSON
          </Button>
          <Button
            variant={mode === "upload" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setMode("upload")}
            className="flex-1"
          >
            <Upload className="w-4 h-4 mr-2" />
            Upload Files
          </Button>
        </div>

        <div className="grid gap-4">
          {mode === "paste" ? (
            <div className="grid gap-2">
              <Label htmlFor="json-content">DTDL JSON</Label>
              <Textarea
                id="json-content"
                value={jsonContent}
                onChange={(e) => setJsonContent(e.target.value)}
                placeholder='{ "@id": "dtmi:example:Model;1", ... }'
                className="h-[300px] font-mono text-xs"
              />
            </div>
          ) : (
            <div className="grid gap-2">
              <Label htmlFor="file-upload">Select DTDL Files</Label>
              <div
                className={cn(
                  "border-2 border-dashed rounded-lg p-8 flex flex-col items-center justify-center text-center transition-colors cursor-pointer",
                  isDragging ? "border-primary bg-primary/10" : "border-muted-foreground/25 hover:bg-muted/50"
                )}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="bg-primary/10 p-4 rounded-full mb-4">
                  <FileJson className="w-8 h-8 text-primary" />
                </div>
                <div className="text-sm font-medium mb-1">
                  Click to select files or drag and drop here
                </div>
                <div className="text-xs text-muted-foreground">
                  JSON files only
                </div>
                <Input
                  ref={fileInputRef}
                  id="file-upload"
                  type="file"
                  accept=".json"
                  multiple
                  className="hidden"
                  onChange={(e) => setFiles(e.target.files)}
                />
              </div>
              {files && files.length > 0 && (
                <div className="text-sm border rounded p-2 bg-muted/50">
                  <div className="font-semibold mb-1">Selected files:</div>
                  <ul className="list-disc list-inside text-muted-foreground">
                    {Array.from(files).slice(0, 5).map((f) => (
                      <li key={f.name} className="truncate">{f.name}</li>
                    ))}
                    {files.length > 5 && <li>...and {files.length - 5} more</li>}
                  </ul>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 p-3 rounded flex items-start gap-2 max-h-[100px] overflow-auto">
              <span>⚠️</span>
              <span className="break-all">{error}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isImporting}
          >
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={isImporting}>
            {isImporting ? "Importing..." : "Import Models"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
