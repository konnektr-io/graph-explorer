/**
 * Utility for generating sample digital twins based on DTDL models
 */

import type { DtdlInterface, DtdlProperty } from "@/types";

interface SampleTwinData {
  $dtId: string;
  $metadata: {
    $model: string;
  };
  [key: string]: any;
}

// Sample data generators by property name pattern
const SAMPLE_DATA_BY_NAME: Record<string, () => any> = {
  name: () => `Sample-${Math.random().toString(36).substring(7)}`,
  temperature: () => Math.floor(Math.random() * 30) + 15, // 15-45
  humidity: () => Math.floor(Math.random() * 60) + 20, // 20-80
  status: () =>
    ["Active", "Inactive", "Maintenance"][Math.floor(Math.random() * 3)],
  capacity: () => Math.floor(Math.random() * 500) + 50,
  level: () => Math.floor(Math.random() * 10) + 1,
  floor: () => Math.floor(Math.random() * 10) + 1,
  area: () => Math.floor(Math.random() * 500) + 50,
  email: () => `user${Math.floor(Math.random() * 1000)}@example.com`,
  phone: () =>
    `+1-555-${Math.floor(Math.random() * 900) + 100}-${
      Math.floor(Math.random() * 9000) + 1000
    }`,
  address: () => `${Math.floor(Math.random() * 9999)} Main St`,
  city: () =>
    ["New York", "Los Angeles", "Chicago", "Houston", "Phoenix"][
      Math.floor(Math.random() * 5)
    ],
  country: () =>
    ["USA", "Canada", "UK", "Germany", "France"][Math.floor(Math.random() * 5)],
  priority: () =>
    ["Low", "Medium", "High", "Critical"][Math.floor(Math.random() * 4)],
  age: () => Math.floor(Math.random() * 60) + 20,
  weight: () => Math.floor(Math.random() * 100) + 50,
  height: () => Math.floor(Math.random() * 60) + 150,
  bloodPressure: () =>
    `${Math.floor(Math.random() * 40) + 100}/${
      Math.floor(Math.random() * 30) + 60
    }`,
  heartRate: () => Math.floor(Math.random() * 40) + 60,
  manufacturer: () =>
    ["Acme Corp", "TechCo", "IndustrialSys", "MegaFactory"][
      Math.floor(Math.random() * 4)
    ],
  serialNumber: () =>
    `SN-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
  model: () =>
    ["Model-A", "Model-B", "Model-C", "Model-X"][Math.floor(Math.random() * 4)],
  version: () =>
    `v${Math.floor(Math.random() * 3) + 1}.${Math.floor(
      Math.random() * 10
    )}.${Math.floor(Math.random() * 10)}`,
  constructionYear: () => 2000 + Math.floor(Math.random() * 24),
};

// Sample data generators by schema type
const SAMPLE_DATA_BY_TYPE: Record<string, () => any> = {
  string: () => `Value-${Math.random().toString(36).substring(7)}`,
  integer: () => Math.floor(Math.random() * 100),
  double: () => Math.random() * 100,
  float: () => Math.random() * 100,
  boolean: () => Math.random() > 0.5,
  date: () =>
    new Date(Date.now() - Math.floor(Math.random() * 365 * 24 * 60 * 60 * 1000))
      .toISOString()
      .split("T")[0],
  dateTime: () =>
    new Date(
      Date.now() - Math.floor(Math.random() * 30 * 24 * 60 * 60 * 1000)
    ).toISOString(),
  time: () => new Date().toISOString().split("T")[1],
  duration: () =>
    `PT${Math.floor(Math.random() * 24)}H${Math.floor(Math.random() * 60)}M`,
};

/**
 * Generate a sample value for a DTDL property
 */
function generatePropertyValue(property: DtdlProperty) {
  const propName = property.name.toLowerCase();

  // Try to match by property name first (more specific)
  for (const [pattern, generator] of Object.entries(SAMPLE_DATA_BY_NAME)) {
    if (propName.toLowerCase() === pattern.toLowerCase()) {
      return generator();
    }
  }

  // Fall back to schema type
  const schema =
    typeof property.schema === "string"
      ? property.schema.toLowerCase()
      : Array.isArray(property.schema?.["@type"])
      ? String(property.schema["@type"][0]).toLowerCase()
      : String(property.schema?.["@type"] || "").toLowerCase();

  if (schema && SAMPLE_DATA_BY_TYPE[schema]) {
    return SAMPLE_DATA_BY_TYPE[schema]();
  }
}

/**
 * Generate sample twins for a given DTDL model
 */
function generateSampleTwins(
  model: DtdlInterface,
  count: number = 3
): SampleTwinData[] {
  const twins: SampleTwinData[] = [];

  // Extract model ID
  const modelId = model["@id"];
  if (!modelId) {
    console.warn("Model missing @id, skipping twin generation");
    return twins;
  }

  // Get the display name for generating twin IDs
  const displayName =
    typeof model.displayName === "string"
      ? model.displayName
      : model.displayName?.en ||
        modelId.split(":").pop()?.split(";")[0] ||
        "Twin";

  // Get properties from the model
  const properties =
    (model.contents?.filter(
      (content) => content["@type"] === "Property"
    ) as DtdlProperty[]) || [];

  // Generate sample twins
  for (let i = 0; i < count; i++) {
    const twinId = `${displayName.replace(/\s+/g, "")}-${i + 1}`;

    const twin: SampleTwinData = {
      $dtId: twinId,
      $metadata: {
        $model: modelId,
      },
    };

    // Generate values for each property
    properties.forEach((property) => {
      if (property.name && !property.name.startsWith("$")) {
        const sampleValue = generatePropertyValue(property);
        if (sampleValue !== undefined) {
          twin[property.name] = sampleValue;
        }
      }
    });

    twins.push(twin);
  }

  return twins;
}

/**
 * Generate sample relationships for a set of twins based on DTDL relationships
 */
function generateSampleRelationships(
  model: DtdlInterface,
  twins: SampleTwinData[],
  allTwinsByModel: Record<string, SampleTwinData[]>
): any[] {
  const relationships =
    (model.contents?.filter(
      (content) => content["@type"] === "Relationship"
    ) as any[]) || [];

  const rels: any[] = [];
  twins.forEach((sourceTwin) => {
    relationships.forEach((rel) => {
      // Find possible targets by target type
      const targetModelId = rel.target;
      const possibleTargets = allTwinsByModel[targetModelId] || [];
      if (possibleTargets.length === 0) return;

      // Pick 1-2 random targets for each relationship
      const numLinks = Math.min(2, possibleTargets.length);
      const shuffled = [...possibleTargets].sort(() => 0.5 - Math.random());
      for (let i = 0; i < numLinks; i++) {
        const targetTwin = shuffled[i];
        if (!targetTwin || targetTwin.$dtId === sourceTwin.$dtId) continue;
        rels.push({
          $relationshipId: `${sourceTwin.$dtId}-${rel.name}-${targetTwin.$dtId}`,
          $sourceId: sourceTwin.$dtId,
          $targetId: targetTwin.$dtId,
          $relationshipName: rel.name,
        });
      }
    });
  });
  return rels;
}

/**
 * Generate sample twins for all models in a domain
 */
export function generateSampleTwinsForDomain(
  models: DtdlInterface[],
  twinsPerModel: number = 3
): { twins: SampleTwinData[]; relationships: any[] } {
  const allTwins: SampleTwinData[] = [];
  const allTwinsByModel: Record<string, SampleTwinData[]> = {};

  // Generate all twins and index by modelId
  models.forEach((model) => {
    const twins = generateSampleTwins(model, twinsPerModel);
    allTwins.push(...twins);
    if (model["@id"]) {
      allTwinsByModel[model["@id"]] = twins;
    }
  });

  // Generate relationships for all models
  const allRelationships: any[] = [];
  models.forEach((model) => {
    const modelId = model["@id"];
    if (!modelId) return;
    const twins = allTwinsByModel[modelId] || [];
    const rels = generateSampleRelationships(model, twins, allTwinsByModel);
    allRelationships.push(...rels);
  });

  return { twins: allTwins, relationships: allRelationships };
}

/**
 * Determine the number of sample twins to create based on model type
 */
export function getRecommendedTwinCount(model: DtdlInterface): number {
  const displayName =
    typeof model.displayName === "string"
      ? model.displayName
      : model.displayName?.en || "";

  const name = displayName.toLowerCase();

  // Base/abstract models - fewer instances
  if (name.includes("base") || name.includes("abstract")) {
    return 0;
  }

  // Core entities - more instances
  if (
    name.includes("building") ||
    name.includes("patient") ||
    name.includes("customer") ||
    name.includes("factory")
  ) {
    return 5;
  }

  // Sub-entities - moderate instances
  if (
    name.includes("room") ||
    name.includes("floor") ||
    name.includes("equipment") ||
    name.includes("observation")
  ) {
    return 8;
  }

  // Default
  return 3;
}
