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
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAuth0 } from "@auth0/auth0-react";
import { useConnectionStore } from "@/stores/connectionStore";
import { useModelsStore } from "@/stores/modelsStore";
import { useDigitalTwinsStore } from "@/stores/digitalTwinsStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { fetchDomainModels } from "@/utils/sampleDataLoader";
import {
  generateSampleTwins,
  getRecommendedTwinCount,
} from "@/utils/sampleTwinGenerator";
import { toast } from "sonner";

interface OnboardingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

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
  const currentConnection = useConnectionStore((state) =>
    state.getCurrentConnection()
  );
  const uploadModels = useModelsStore((state) => state.uploadModels);
  const createTwin = useDigitalTwinsStore((state) => state.createTwin);
  const loadModels = useModelsStore((state) => state.loadModels);
  const setHasSeenOnboarding = useWorkspaceStore(
    (state) => state.setHasSeenOnboarding
  );
  const dismissOnboarding = useWorkspaceStore(
    (state) => state.dismissOnboarding
  );

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

      // Generate and create sample twins
      let totalTwinsCreated = 0;
      for (const model of domainModels) {
        const twinCount = getRecommendedTwinCount(model);
        if (twinCount > 0) {
          const sampleTwins = generateSampleTwins(model, twinCount);

          // Create twins one by one
          for (const twinData of sampleTwins) {
            try {
              await createTwin(twinData, authCallbacks);
              totalTwinsCreated++;
            } catch (err) {
              console.warn(`Failed to create twin ${twinData.$dtId}:`, err);
              // Continue with next twin
            }
          }
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
            Let's get you started with your digital twin environment
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
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
                      Define the structure and properties of your digital twins
                      using Digital Twin Definition Language
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Badge variant="outline" className="mt-0.5">
                    2
                  </Badge>
                  <div>
                    <strong className="text-foreground">Create Twins</strong>
                    <p>
                      Create instances (twins) based on your models with actual
                      data and properties
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
              Choose a sample domain to get started quickly. This will import
              models and create sample twins.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {SAMPLE_DOMAINS.map((domain) => {
                const Icon = domain.icon;
                const loading = isLoading && selectedDomain === domain.id;
                return (
                  <Card
                    key={domain.id}
                    className="cursor-pointer hover:border-primary transition-colors"
                    onClick={() => !isLoading && handleLoadSamples(domain.id)}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <Icon className="w-8 h-8 text-primary" />
                        <Badge variant="secondary">
                          {domain.models} models
                        </Badge>
                      </div>
                      <CardTitle className="text-base">{domain.name}</CardTitle>
                      <CardDescription className="text-xs">
                        {domain.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <Button size="sm" className="w-full" disabled={isLoading}>
                        {loading ? "Loading..." : "Load This Sample"}
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Alternative Options */}
          <div className="border-t pt-4">
            <h3 className="text-sm font-semibold mb-3">
              Or Start From Scratch
            </h3>
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
              <Button variant="ghost" onClick={handleSkip}>
                <X className="w-4 h-4 mr-2" />
                Skip Onboarding
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
