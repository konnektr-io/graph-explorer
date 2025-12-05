import { useState, useEffect } from "react";
import { FileText, Database } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EditableProperty } from "./EditableProperty";
import { MetadataTooltip } from "@/components/ui/metadata-tooltip";
import { useDigitalTwinsStore } from "@/stores/digitalTwinsStore";
import type { DigitalTwinPropertyMetadata } from "@/types";
import { getModelDisplayName, getModelPropertyDefinitions } from "@/utils/dtdlHelpers";
import { useAuth0 } from "@auth0/auth0-react";

interface TwinInspectorProps {
  twinId: string;
}

export function TwinInspector({ twinId }: TwinInspectorProps) {
  const { getTwin, getTwinById, updateTwinProperty } = useDigitalTwinsStore();
  const { getAccessTokenSilently, getAccessTokenWithPopup } = useAuth0();
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ... _mockTwin definition ...

  // Fetch twin data when ID changes to ensure we have latest data
  useEffect(() => {
    const fetchTwin = async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        await getTwinById(twinId, {
            getAccessTokenSilently,
            getAccessTokenWithPopup: async (options) => {
                const token = await getAccessTokenWithPopup(options);
                if (!token) throw new Error("Failed to get token with popup");
                return token;
            }
        });
      } catch (err) {
        console.error("Failed to fetch twin:", err);
        setLoadError("Failed to load twin data");
      } finally {
        setIsLoading(false);
      }
    };

    fetchTwin();
  }, [twinId, getTwinById, getAccessTokenSilently, getAccessTokenWithPopup]);

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
        if (definition.schema === 'double' || definition.schema === 'float' || definition.schema === 'integer' || definition.schema === 'long') {
            typedValue = Number(newValue);
        } else if (definition.schema === 'boolean') {
            typedValue = String(newValue).toLowerCase() === 'true';
        }
    }

    await updateTwinProperty(twinId, propertyName, typedValue, {
        getAccessTokenSilently,
        getAccessTokenWithPopup: async (options) => {
            const token = await getAccessTokenWithPopup(options);
            if (!token) throw new Error("Failed to get token with popup");
            return token;
          },
    });
  };

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
                name={definition?.displayName ? (typeof definition.displayName === 'string' ? definition.displayName : (definition.displayName as any).en || key) : key}
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
    </div>
  );
}
