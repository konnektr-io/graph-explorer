/**
 * Utility for loading sample DTDL models from local public folder
 */

const SAMPLES_BASE = "/samples";

export interface DomainInfo {
  id: string;
  name: string;
  description: string;
  models: string[];
}

// Map of available domains and their model files
const DOMAIN_MODELS: Record<string, string[]> = {
  facility: [
    "BaseFacilityEntity.json",
    "Building.json",
    "Floor.json",
    "Room.json",
    "Space.json",
    "Equipment.json",
    "HVACUnit.json",
    "Sensor.json",
    "MaintenanceTicket.json",
  ],
  healthcare: [
    "BaseHealthEntity.json",
    "Patient.json",
    "Practitioner.json",
    "Observation.json",
    "Condition.json",
    "Encounter.json",
    "CarePlan.json",
    "MedicalDevice.json",
  ],
  manufacturing: [
    "BaseManufacturingEntity.json",
    "Factory.json",
    "ProductionLine.json",
    "Machine.json",
    "RobotArm.json",
    "Product.json",
    "WorkOrder.json",
    "Defect.json",
  ],
  business: [
    "BaseEntity.json",
    "Party.json",
    "Person.json",
    "Organization.json",
    "Customer.json",
    "Product.json",
    "Opportunity.json",
    "SalesOrder.json",
    "Interaction.json",
    "EmailInteraction.json",
    "SocialSignal.json",
    "AgentInsight.json",
  ],
};

/**
 * Fetch DTDL models for a specific domain from local public folder
 */
export async function fetchDomainModels(domain: string): Promise<any[]> {
  const modelFiles = DOMAIN_MODELS[domain];
  if (!modelFiles) {
    throw new Error(`Unknown domain: ${domain}`);
  }

  const models: any[] = [];

  // Fetch all model files in parallel
  const fetchPromises = modelFiles.map(async (filename) => {
    const url = `${SAMPLES_BASE}/${domain}/${filename}`;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.warn(`Failed to fetch ${filename}: ${response.status}`);
        return null;
      }
      const model = await response.json();
      return model;
    } catch (error) {
      console.error(`Error fetching ${filename}:`, error);
      return null;
    }
  });

  const results = await Promise.all(fetchPromises);

  // Filter out failed fetches
  results.forEach((model) => {
    if (model) {
      models.push(model);
    }
  });

  return models;
}

/**
 * Get list of available sample domains
 */
export function getAvailableDomains(): DomainInfo[] {
  return [
    {
      id: "facility",
      name: "Facility Management",
      description: "Buildings, rooms, equipment, sensors, and maintenance",
      models: DOMAIN_MODELS.facility,
    },
    {
      id: "healthcare",
      name: "Healthcare",
      description: "Patients, practitioners, observations, and care plans",
      models: DOMAIN_MODELS.healthcare,
    },
    {
      id: "manufacturing",
      name: "Manufacturing",
      description: "Factories, production lines, machines, and work orders",
      models: DOMAIN_MODELS.manufacturing,
    },
    {
      id: "business",
      name: "Business & CRM",
      description: "Customers, opportunities, interactions, and organizations",
      models: DOMAIN_MODELS.business,
    },
  ];
}
