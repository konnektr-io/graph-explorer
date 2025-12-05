import { useModelsStore } from "@/stores/modelsStore";
import type { BasicDigitalTwin } from "@/types";

interface PropertyDefinition {
  name: string;
  displayName?: string | Record<string, string>;
  schema: string;
  description?: string | Record<string, string>;
}

interface DTDLContent {
  "@type": string;
  name: string;
  displayName?: string | Record<string, string>;
  schema?: string;
  description?: string | Record<string, string>;
}

// Helper to get localized text
const getLocalizedText = (
  text: string | Record<string, string> | undefined,
  fallback: string
): string => {
  if (!text) return fallback;
  if (typeof text === "string") return text;
  return text.en || Object.values(text)[0] || fallback;
};

// Get property definitions for a model
export const getModelPropertyDefinitions = (
  modelId: string
): Record<string, PropertyDefinition> => {
  const models = useModelsStore.getState().models;
  const model = models.find((m) => m.id === modelId);
  if (!model || !model.model) return {};

  const dtdlModel = model.model as unknown;
  let contents: unknown = undefined;
  if (
    typeof dtdlModel === "object" &&
    dtdlModel !== null &&
    "contents" in dtdlModel
  ) {
    contents = (dtdlModel as { contents?: unknown }).contents;
  }
  const contentsArr = Array.isArray(contents) ? contents : [];

  const properties: Record<string, PropertyDefinition> = {};

  contentsArr
    .filter(
      (content): content is DTDLContent =>
        typeof content === "object" &&
        content !== null &&
        "@type" in content &&
        (content as DTDLContent)["@type"] === "Property"
    )
    .forEach((prop) => {
      properties[prop.name] = {
        name: prop.name,
        displayName: prop.displayName,
        schema: prop.schema || "string",
        description: prop.description,
      };
    });

  return properties;
};

// Get display name for a property
export const getPropertyDisplayName = (
  modelId: string,
  propertyName: string
): string => {
  const properties = getModelPropertyDefinitions(modelId);
  const prop = properties[propertyName];

  if (prop?.displayName) {
    return getLocalizedText(prop.displayName, propertyName);
  }

  return propertyName;
};

export interface ColumnDefinition {
  key: string;
  displayName: string;
  originalName: string;
  isSystemProperty: boolean;
  schema: string;
  description?: string;
}

// Get all columns definitions for a twin including system properties
export const getTwinColumnDefinitions = (
  twin: BasicDigitalTwin
): ColumnDefinition[] => {
  const modelId = twin.$metadata.$model;
  const properties = getModelPropertyDefinitions(modelId);

  const columns: ColumnDefinition[] = [
    {
      key: "$dtId",
      displayName: "Id",
      originalName: "$dtId",
      isSystemProperty: true,
      schema: "string",
    },
    {
      key: "$metadata.$model",
      displayName: "Model",
      originalName: "$metadata.$model",
      isSystemProperty: true,
      schema: "string",
    },
  ];

  // Add custom properties
  Object.keys(twin).forEach((key) => {
    if (key !== "$dtId" && key !== "$metadata") {
      const prop = properties[key];
      columns.push({
        key,
        displayName: prop ? getLocalizedText(prop.displayName, key) : key,
        originalName: key,
        isSystemProperty: false,
        schema: prop?.schema || "string",
        description: prop?.description
          ? getLocalizedText(prop.description, "")
          : undefined,
      });
    }
  });

  return columns;
};

// Get value from twin using dot notation
export const getTwinValue = (twin: BasicDigitalTwin, path: string): any => {
  if (path === "$dtId") return twin.$dtId;
  if (path === "$metadata.$model") return twin.$metadata.$model;

  const keys = path.split(".");
  let value: any = twin;

  for (const key of keys) {
    if (value && typeof value === "object" && key in value) {
      value = value[key];
    } else {
      return undefined;
    }
  }

  return value;
};

// Get metadata for a property value
export const getPropertyMetadata = (
  twin: BasicDigitalTwin,
  propertyName: string
) => {
  const metadata = twin.$metadata[propertyName];
  if (metadata && typeof metadata === "object") {
    return {
      lastUpdateTime: (metadata as any).lastUpdateTime,
      sourceTime: (metadata as any).sourceTime,
    };
  }
  return null;
};

/**
 * Get display name from model ID
 * Extracts a human-readable name from DTDL model identifiers
 * @param modelId - DTDL model identifier (e.g., "dtmi:example:Building;1")
 * @returns Display name for the model
 */
export const getModelDisplayName = (modelId: string): string => {
  const models = useModelsStore.getState().models;
  const model = models.find((m) => m.id === modelId);
  if (model?.displayName) {
    if (typeof model.displayName === "string") return model.displayName;
    const displayNames = model.displayName as Record<string, string>;
    return displayNames.en || Object.values(displayNames)[0] || modelId;
  }
  // Fallback: extract name from DTMI (e.g., "dtmi:example:Building;1" -> "Building")
  return modelId.split(";")[0].split(":").pop() || modelId;
};

/**
 * Format twin for display
 * Currently a pass-through, but provides a hook for future transformations
 * @param twin - BasicDigitalTwin to format
 * @returns Formatted twin (currently unchanged)
 */
export const formatTwinForDisplay = (twin: BasicDigitalTwin): BasicDigitalTwin => {
  // Return the twin as-is, maintaining the correct BasicDigitalTwin structure
  // The displayName should be computed in the UI components when needed using getModelDisplayName
  return twin;
};

/**
 * Relationship definition from DTDL model
 */
export interface RelationshipDefinition {
  name: string;
  displayName?: string | Record<string, string>;
  target?: string; // Target model ID (if constrained)
  description?: string | Record<string, string>;
  properties?: Array<{
    name: string;
    displayName?: string | Record<string, string>;
    schema?: string;
  }>;
}

interface DTDLRelationshipContent {
  "@type": "Relationship" | string[];
  name: string;
  displayName?: string | Record<string, string>;
  description?: string | Record<string, string>;
  target?: string;
  properties?: Array<{
    name: string;
    displayName?: string | Record<string, string>;
    schema?: string;
  }>;
}

/**
 * Get relationship definitions from a model
 * @param modelId - DTDL model identifier
 * @returns Array of relationship definitions including inherited ones
 */
export const getModelRelationshipDefinitions = (
  modelId: string
): RelationshipDefinition[] => {
  const models = useModelsStore.getState().models;
  const model = models.find((m) => m.id === modelId);
  if (!model || !model.model) return [];

  const relationships: RelationshipDefinition[] = [];
  const processedNames = new Set<string>();

  // Helper to process a model and its base models
  const processModel = (currentModelId: string) => {
    const currentModel = models.find((m) => m.id === currentModelId);
    if (!currentModel || !currentModel.model) return;

    const dtdlModel = currentModel.model;
    const contents = dtdlModel.contents;

    if (Array.isArray(contents)) {
      contents.forEach((content) => {
        if (
          content &&
          typeof content === "object" &&
          "@type" in content
        ) {
          const contentType = (content as { "@type": string | string[] })["@type"];
          const isRelationship =
            contentType === "Relationship" ||
            (Array.isArray(contentType) && contentType.includes("Relationship"));

          if (isRelationship) {
            const relContent = content as DTDLRelationshipContent;
            if (!processedNames.has(relContent.name)) {
              processedNames.add(relContent.name);
              relationships.push({
                name: relContent.name,
                displayName: relContent.displayName,
                target: relContent.target,
                description: relContent.description,
                properties: relContent.properties,
              });
            }
          }
        }
      });
    }

    // Process base models (extends)
    if (dtdlModel.extends) {
      const extendsList = Array.isArray(dtdlModel.extends)
        ? dtdlModel.extends
        : [dtdlModel.extends];

      extendsList.forEach((ext) => {
        const extId = typeof ext === "string" ? ext : (ext as { "@id": string })["@id"];
        if (extId) processModel(extId);
      });
    }
  };

  processModel(modelId);
  return relationships;
};

/**
 * Get display name for a relationship definition
 */
export const getRelationshipDisplayName = (
  rel: RelationshipDefinition
): string => {
  if (rel.displayName) {
    if (typeof rel.displayName === "string") return rel.displayName;
    return rel.displayName.en || Object.values(rel.displayName)[0] || rel.name;
  }
  return rel.name;
};
