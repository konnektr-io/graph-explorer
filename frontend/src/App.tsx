import { useEffect, useState } from "react";
import { GlobalErrorToaster } from "@/components/GlobalErrorToaster";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { ThemeProvider } from "next-themes";
import { GraphHeader } from "@/components/layout/GraphHeader";
import { ModelSidebar } from "@/components/layout/ModelSidebar";
import { MainContent } from "@/components/layout/MainContent";
import { Inspector } from "@/components/inspector/Inspector";
import { OnboardingDialog } from "@/components/OnboardingDialog";
import { KtrlPlaneAuthProvider } from "@/components/KtrlPlaneAuthProvider";
import { KtrlPlaneConnectionManager } from "@/components/KtrlPlaneConnectionManager";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useConnectionStore } from "@/stores/connectionStore";
import { useModelsStore } from "@/stores/modelsStore";
import { CookieConsent } from "@/components/cookie-consent";

function App() {
  const addConnection = useConnectionStore((state) => state.addConnection);
  const getAllConnections = useConnectionStore(
    (state) => state.getAllConnections
  );

  const models = useModelsStore((state) => state.models);
  const currentConnectionId = useConnectionStore(
    (state) => state.currentConnectionId
  );

  const hasSeenOnboarding = useWorkspaceStore(
    (state) => state.hasSeenOnboarding
  );

  const [showOnboarding, setShowOnboarding] = useState(false);

  // Auto-add demo connection from query param if needed
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const adtHost = params.get("x-adt-host");
    if (adtHost) {
      // Check if connection already exists for this host
      const allConnections = getAllConnections();
      const existing = allConnections.find((c) => {
        // Match by exact host, external endpoint, or resource ID pattern
        return (
          c.adtHost === adtHost ||
          c._externalEndpoint === adtHost ||
          (c.ktrlPlaneResourceId && adtHost.includes(c.ktrlPlaneResourceId))
        );
      });

      if (!existing) {
        // Add demo connection
        const demoConn = {
          id: "demo",
          name: adtHost === "demo.api.graph.konnektr.io" ? "Demo" : adtHost,
          adtHost,
          authProvider: "none" as const,
        };
        addConnection(demoConn);
        setCurrentConnection(demoConn.id);
      } else {
        // Auto-select if not already selected
        if (currentConnectionId !== existing.id) {
          setCurrentConnection(existing.id);
        }
      }
    }
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const {
    showLeftPanel,
    showRightPanel,
    leftPanelSize,
    rightPanelSize,
    setPanelSize,
  } = useWorkspaceStore();

  const setCurrentConnection = useConnectionStore(
    (state) => state.setCurrentConnection
  );

  // Initialize connection on app start if we have a saved connection (but not if we just auto-selected demo)
  useEffect(() => {
    // If we just set a demo connection above, skip this effect
    // (otherwise, it would immediately re-select the old persisted connection)
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const adtHost = params.get("x-adt-host");
    const allConnections = getAllConnections();
    if (adtHost) {
      const demoConn = allConnections.find((c) => c.adtHost === adtHost);
      if (demoConn && currentConnectionId === demoConn.id) {
        // Already selected demo, skip
        return;
      }
    }
    // Fallback to persisted connection logic
    if (currentConnectionId) {
      const connectionExists = allConnections.some(
        (c) => c.id === currentConnectionId
      );
      if (connectionExists) {
        setCurrentConnection(currentConnectionId)
          .then(() => {
            // ...existing code...
          })
          .catch(() => {
            // ...existing code...
          });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Check if onboarding should be shown
  useEffect(() => {
    // Only show onboarding if:
    // 1. User has a connection selected
    // 2. There are no models loaded
    // 3. User hasn't dismissed onboarding
    // 4. Not in demo mode (x-adt-host param)
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const isDemoMode = params.has("x-adt-host");

    if (
      currentConnectionId &&
      models.length === 0 &&
      !hasSeenOnboarding &&
      !isDemoMode
    ) {
      // Small delay to let the UI settle
      const timer = setTimeout(() => {
        setShowOnboarding(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [currentConnectionId, models.length, hasSeenOnboarding]);

  // Set GTM consent using gtag API
  const setConsent = (consent: "accepted" | "declined") => {
    if (typeof window !== "undefined") {
      // Declare window.gtag for TypeScript
      type GtagFn = (
        command: string,
        action: string,
        params: Record<string, string>
      ) => void;
      const gtag = (window as typeof window & { gtag?: GtagFn }).gtag;
      if (gtag) {
        if (consent === "accepted") {
          gtag("consent", "update", {
            ad_storage: "granted",
            analytics_storage: "granted",
          });
        } else {
          gtag("consent", "update", {
            ad_storage: "denied",
            analytics_storage: "denied",
          });
        }
      }
      type ClarityFn = (
        command: string,
        params: Record<string, string>
      ) => void;
      const clarity = (window as typeof window & { clarity?: ClarityFn })
        .clarity;
      if (clarity) {
        if (consent === "accepted") {
          clarity("consentv2", {
            ad_Storage: "granted",
            analytics_Storage: "granted",
          });
        } else {
          clarity("consentv2", {
            ad_Storage: "denied",
            analytics_Storage: "denied",
          });
        }
      }
    }
  };

  // Callback for accepting cookies
  const handleAccept = () => {
    setConsent("accepted");
  };

  // Callback for declining cookies
  const handleDecline = () => {
    setConsent("declined");
  };

  return (
    <KtrlPlaneAuthProvider>
      <KtrlPlaneConnectionManager />
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        storageKey="konnektr-graph-theme"
      >
        <GlobalErrorToaster />
        <div className="h-screen w-full flex flex-col bg-background text-foreground">
          {/* Header */}
          <GraphHeader />

          {/* Connection Status Banner */}
          {/* <ConnectionStatusBanner /> */}

          {/* Main Content Area with Resizable Panels */}
          <div className="flex-1 overflow-hidden">
            <PanelGroup
              direction="horizontal"
              className="h-full"
              key={`${showLeftPanel}-${showRightPanel}`} // Force re-render when panels change
            >
              {/* Left Sidebar */}
              {showLeftPanel && (
                <>
                  <Panel
                    id="left-panel"
                    defaultSize={leftPanelSize}
                    minSize={15}
                    maxSize={40}
                    onResize={(size: number) => setPanelSize("left", size)}
                    className="flex"
                  >
                    <ModelSidebar />
                  </Panel>
                  <PanelResizeHandle className="w-1 bg-border hover:bg-border/80 transition-colors data-[resize-handle-active]:bg-primary" />
                </>
              )}

              {/* Center Content */}
              <Panel id="center-panel" minSize={30} className="flex">
                <MainContent />
              </Panel>

              {/* Right Inspector Panel */}
              {showRightPanel && (
                <>
                  <PanelResizeHandle className="w-1 bg-border hover:bg-border/80 transition-colors data-[resize-handle-active]:bg-primary" />
                  <Panel
                    id="right-panel"
                    defaultSize={rightPanelSize}
                    minSize={15}
                    maxSize={40}
                    onResize={(size: number) => setPanelSize("right", size)}
                    className="flex flex-col"
                  >
                    <Inspector />
                  </Panel>
                </>
              )}
            </PanelGroup>
          </div>

          {/* Status Bar */}
          {/* <StatusBar /> */}

          {/* Cookie Consent Popup */}
          <CookieConsent
            variant="minimal"
            onAcceptCallback={handleAccept}
            onDeclineCallback={handleDecline}
          />

          {/* Onboarding Dialog */}
          <OnboardingDialog
            open={showOnboarding}
            onOpenChange={setShowOnboarding}
          />
        </div>
      </ThemeProvider>
    </KtrlPlaneAuthProvider>
  );
}

export default App;
