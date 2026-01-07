import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Rocket,
  Building2,
  Heart,
  Factory,
  Briefcase,
  Upload,
  X,
  Cloud,
  Zap,
  Globe,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAuth0 } from "@auth0/auth0-react";
import { useConnectionStore } from "@/stores/connectionStore";
import { useModelsStore } from "@/stores/modelsStore";
import { useDigitalTwinsStore } from "@/stores/digitalTwinsStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { fetchDomainModels } from "@/utils/sampleDataLoader";
import { generateSampleTwinsForDomain } from "@/utils/sampleTwinGenerator";
import {} from "@/utils/sampleTwinGenerator";
import { toast } from "sonner";

interface OnboardingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Demo connection configuration
const DEMO_CONNECTION = {
  id: "demo",
  name: "Demo Environment",
  adtHost: "demo.api.graph.konnektr.io",
  authProvider: "none" as const,
  description: "Public demo environment with sample data",
} as const;

const SAMPLE_DOMAINS = [
  {
    id: "facility",
    name: "Facility Management",
    description: "Buildings, rooms, equipment, sensors, and maintenance",
    icon: Building2,
    models: 8,
  },
  {
    id: "healthcare",
    name: "Healthcare",
    description: "Patients, practitioners, observations, and care plans",
    icon: Heart,
    models: 8,
  },
  {
    id: "manufacturing",
    name: "Manufacturing",
    description: "Factories, production lines, machines, and work orders",
    icon: Factory,
    models: 8,
  },
  {
    id: "business",
    name: "Business & CRM",
    description: "Customers, opportunities, interactions, and organizations",
    icon: Briefcase,
    models: 10,
  },
];

export function OnboardingDialog({
  open,
  onOpenChange,
}: OnboardingDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);

  // Auth0 hooks for authentication
  const { getAccessTokenSilently, getAccessTokenWithPopup } = useAuth0();

  // Store hooks
  const currentConnection = useConnectionStore((state) => {
    const allConnections = [
      ...state.ktrlPlaneConnections,
      ...state.connections,
    ];
    return (
      allConnections.find((c) => c.id === state.currentConnectionId) || null
    );
  });
  const addConnection = useConnectionStore((state) => state.addConnection);
  const setCurrentConnection = useConnectionStore(
    (state) => state.setCurrentConnection
  );
  const connections = useConnectionStore((state) => state.connections);
  const ktrlPlaneConnections = useConnectionStore(
    (state) => state.ktrlPlaneConnections
  );
  const uploadModels = useModelsStore((state) => state.uploadModels);
  const createTwin = useDigitalTwinsStore((state) => state.createTwin);
  const createRelationship = useDigitalTwinsStore(
    (state) => state.createRelationship
  );
  const loadModels = useModelsStore((state) => state.loadModels);
  const setHasSeenOnboarding = useWorkspaceStore(
    (state) => state.setHasSeenOnboarding
  );
  const dismissOnboarding = useWorkspaceStore(
    (state) => state.dismissOnboarding
  );

  const handleLoadDemo = async () => {
    try {
      // Check if demo connection already exists
      const allConnections = [...ktrlPlaneConnections, ...connections];
      const existingDemo = allConnections.find(
        (c) => c.adtHost === DEMO_CONNECTION.adtHost
      );

      if (existingDemo) {
        // Just switch to existing demo connection
        await setCurrentConnection(existingDemo.id);
        toast.success("Connected to demo environment");
      } else {
        // Add new demo connection
        addConnection(DEMO_CONNECTION);
        await setCurrentConnection(DEMO_CONNECTION.id);
        toast.success("Connected to demo environment", {
          description: "Explore the pre-loaded sample data in the graph",
        });
      }

      setHasSeenOnboarding(true);
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to connect to demo:", error);
      toast.error("Failed to connect to demo environment");
    }
  };

  const handleDeployNew = () => {
    window.open(
      "https://ktrlplane.konnektr.io/resources/create?resource_type=Konnektr.Graph&sku=standard&utm_source=graph_explorer&utm_medium=app&utm_campaign=onboarding",
      "_blank"
    );
    // Keep dialog open - user might want to try demo while waiting for deployment
  };

  const handleConnectCustom = () => {
    onOpenChange(false);
    // Trigger the connection selector "Add" button
    setTimeout(() => {
      const addButton = document.querySelector(
        '[data-testid="add-connection-button"]'
      ) as HTMLButtonElement;
      if (!addButton) {
        // Fallback: find by text content
        const buttons = Array.from(document.querySelectorAll("button"));
        const found = buttons.find((b) => b.textContent?.trim() === "Add");
        found?.click();
      } else {
        addButton.click();
      }
    }, 100);
  };

  const handleLoadSamples = async (domain: string) => {
    setIsLoading(true);
    setSelectedDomain(domain);
    try {
      toast.info(`Loading sample data...`, {
        description: `Loading ${domain} models`,
      });

      // Fetch models from local files
      const domainModels = await fetchDomainModels(domain);

      if (domainModels.length === 0) {
        throw new Error("No models found for this domain");
      }

      // Prepare auth callbacks based on connection type
      const authCallbacks =
        currentConnection?.authProvider === "none"
          ? undefined
          : currentConnection?.authProvider === "ktrlplane" ||
            currentConnection?.isKtrlPlaneManaged
          ? {
              getAccessTokenSilently,
              getAccessTokenWithPopup,
            }
          : undefined;

      // Upload models
      await uploadModels(domainModels, authCallbacks);

      toast.success(`Models imported!`, {
        description: `Imported ${domainModels.length} models. Now generating sample twins...`,
      });

      // Generate all sample twins and relationships for the domain
      const { twins: sampleTwins, relationships: sampleRelationships } =
        generateSampleTwinsForDomain(
          domainModels,
          undefined // use default per-model count logic
        );

      // Create twins one by one
      let totalTwinsCreated = 0;
      for (const twinData of sampleTwins) {
        try {
          await createTwin(twinData, authCallbacks);
          totalTwinsCreated++;
        } catch (err) {
          console.warn(`Failed to create twin ${twinData.$dtId}:`, err);
          // Continue with next twin
        }
      }

      // Create relationships one by one
      let totalRelationshipsCreated = 0;
      for (const relData of sampleRelationships) {
        try {
          await createRelationship(relData, authCallbacks);
          totalRelationshipsCreated++;
        } catch (err) {
          console.warn(
            `Failed to create relationship ${relData.$relationshipId}:`,
            err
          );
          // Continue with next relationship
        }
      }

      // Reload models to get updated twin counts
      await loadModels(
        authCallbacks?.getAccessTokenSilently,
        authCallbacks?.getAccessTokenWithPopup
      );

      toast.success(`Sample data loaded!`, {
        description: `Successfully imported ${domainModels.length} models and created ${totalTwinsCreated} sample twins. Try querying them in the Query Explorer!`,
        duration: 5000,
      });

      setHasSeenOnboarding(true);
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to load samples:", error);
      toast.error(`Failed to load samples`, {
        description:
          error instanceof Error ? error.message : "An error occurred",
      });
    } finally {
      setIsLoading(false);
      setSelectedDomain(null);
    }
  };

  const handleSkip = () => {
    dismissOnboarding();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Rocket className="w-6 h-6 text-primary" />
            <DialogTitle className="text-2xl">
              Welcome to Konnektr Graph Explorer!
            </DialogTitle>
          </div>
          <DialogDescription className="text-base pt-2">
            {!currentConnection
              ? "Choose how you'd like to get started with your digital twin environment"
              : "Let's get you started with your digital twin environment"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* New User Flow - No Connection */}
          {!currentConnection && (
            <>
              {/* Quick Start Section */}
              <div className="space-y-3">
                <h3 className="text-lg font-semibold">Quick Start Options</h3>
                <div className="space-y-2">
                  {/* Demo Environment */}
                  <Card
                    className="cursor-pointer hover:border-primary transition-colors"
                    onClick={handleLoadDemo}
                  >
                    <CardContent className="p-3">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                        <Zap className="w-8 h-8 text-primary flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <CardTitle className="text-base">
                              Try Demo Environment
                            </CardTitle>
                            <Badge variant="secondary" className="text-xs">
                              No Setup Required
                            </Badge>
                          </div>
                          <CardDescription className="text-xs">
                            Instant access to pre-loaded sample data. Perfect for
                            exploring features.
                          </CardDescription>
                        </div>
                        <Button size="sm" className="w-full sm:w-auto flex-shrink-0">
                          Connect to Demo
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Deploy New */}
                  <Card
                    className="cursor-pointer hover:border-primary transition-colors"
                    onClick={handleDeployNew}
                  >
                    <CardContent className="p-3">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                        <Cloud className="w-8 h-8 text-primary flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <CardTitle className="text-base">
                              Deploy on KtrlPlane
                            </CardTitle>
                            <Badge variant="secondary" className="text-xs">
                              Production Ready
                            </Badge>
                          </div>
                          <CardDescription className="text-xs">
                            Fully managed instance with automatic scaling and
                            backups.
                          </CardDescription>
                        </div>
                        <Button size="sm" variant="outline" className="w-full sm:w-auto flex-shrink-0">
                          Deploy New Instance
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Custom Connection */}
                  <Card
                    className="cursor-pointer hover:border-primary transition-colors"
                    onClick={handleConnectCustom}
                  >
                    <CardContent className="p-3">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                        <Globe className="w-8 h-8 text-primary flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <CardTitle className="text-base">
                              Connect Custom Instance
                            </CardTitle>
                            <Badge variant="secondary" className="text-xs">
                              Advanced
                            </Badge>
                          </div>
                          <CardDescription className="text-xs">
                            Connect to your own Azure Digital Twins or self-hosted
                            instance.
                          </CardDescription>
                        </div>
                        <Button size="sm" variant="outline" className="w-full sm:w-auto flex-shrink-0">
                          Add Connection
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* How It Works */}
              <div className="border-t pt-4">
                <div>
                  <h3 className="text-lg font-semibold mb-2">How It Works</h3>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <div className="flex items-start gap-3">
                      <Badge variant="outline" className="mt-0.5">
                        1
                      </Badge>
                      <div>
                        <strong className="text-foreground">
                          Load Data Models (DTDL)
                        </strong>
                        <p>
                          Define the structure and properties of your digital
                          twins using Digital Twin Definition Language
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Badge variant="outline" className="mt-0.5">
                        2
                      </Badge>
                      <div>
                        <strong className="text-foreground">
                          Create Twins
                        </strong>
                        <p>
                          Create instances (twins) based on your models with
                          actual data and properties
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Badge variant="outline" className="mt-0.5">
                        3
                      </Badge>
                      <div>
                        <strong className="text-foreground">
                          Build Relationships
                        </strong>
                        <p>
                          Connect twins together to represent real-world
                          relationships and hierarchies
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Badge variant="outline" className="mt-0.5">
                        4
                      </Badge>
                      <div>
                        <strong className="text-foreground">
                          Query & Visualize
                        </strong>
                        <p>
                          Use Cypher queries to explore your data and visualize
                          relationships in the graph view
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Existing User Flow - Has Connection */}
          {currentConnection && (
            <>
              {/* Explanation Section */}
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold mb-2">How It Works</h3>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <div className="flex items-start gap-3">
                      <Badge variant="outline" className="mt-0.5">
                        1
                      </Badge>
                      <div>
                        <strong className="text-foreground">
                          Load Data Models (DTDL)
                        </strong>
                        <p>
                          Define the structure and properties of your digital
                          twins using Digital Twin Definition Language
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Badge variant="outline" className="mt-0.5">
                        2
                      </Badge>
                      <div>
                        <strong className="text-foreground">
                          Create Twins
                        </strong>
                        <p>
                          Create instances (twins) based on your models with
                          actual data and properties
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Badge variant="outline" className="mt-0.5">
                        3
                      </Badge>
                      <div>
                        <strong className="text-foreground">
                          Build Relationships
                        </strong>
                        <p>
                          Connect twins together to represent real-world
                          relationships and hierarchies
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Badge variant="outline" className="mt-0.5">
                        4
                      </Badge>
                      <div>
                        <strong className="text-foreground">
                          Query & Visualize
                        </strong>
                        <p>
                          Use Cypher queries to explore your data and visualize
                          relationships in the graph view
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sample Domains */}
              <div>
                <h3 className="text-lg font-semibold mb-3">Load Sample Data</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Choose a sample domain to get started quickly. This will
                  import models and create sample twins.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {SAMPLE_DOMAINS.map((domain) => {
                    const Icon = domain.icon;
                    const loading = isLoading && selectedDomain === domain.id;
                    return (
                      <Card
                        key={domain.id}
                        className="cursor-pointer hover:border-primary transition-colors"
                        onClick={() =>
                          !isLoading && handleLoadSamples(domain.id)
                        }
                      >
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between">
                            <Icon className="w-8 h-8 text-primary" />
                            <Badge variant="secondary">
                              {domain.models} models
                            </Badge>
                          </div>
                          <CardTitle className="text-base">
                            {domain.name}
                          </CardTitle>
                          <CardDescription className="text-xs">
                            {domain.description}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <Button
                            size="sm"
                            className="w-full"
                            disabled={isLoading}
                          >
                            {loading ? "Loading..." : "Load This Sample"}
                          </Button>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>

              {/* Alternative Options for users with connection */}
              <div className="border-t pt-4">
                <h3 className="text-sm font-semibold mb-3">Other Options</h3>
                <div className="flex gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    onClick={() => {
                      onOpenChange(false);
                      // Trigger the import dialog in ModelSidebar
                      const importButton = document.querySelector(
                        "[data-import-models]"
                      ) as HTMLButtonElement;
                      importButton?.click();
                    }}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Import Your Own Models
                  </Button>
                  <Button variant="outline" onClick={handleLoadDemo}>
                    <Zap className="w-4 h-4 mr-2" />
                    Try Demo Environment
                  </Button>
                  <Button variant="outline" onClick={handleDeployNew}>
                    <Cloud className="w-4 h-4 mr-2" />
                    Deploy on KtrlPlane
                  </Button>
                  <Button variant="ghost" onClick={handleSkip}>
                    <X className="w-4 h-4 mr-2" />
                    Skip Onboarding
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
