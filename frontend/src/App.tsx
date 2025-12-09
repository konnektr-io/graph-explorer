import { useEffect } from "react";
import { GlobalErrorToaster } from "@/components/GlobalErrorToaster";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { ThemeProvider } from "@/components/theme-provider";
import { GraphHeader } from "@/components/layout/GraphHeader";
import { ModelSidebar } from "@/components/layout/ModelSidebar";
import { MainContent } from "@/components/layout/MainContent";
import { Inspector } from "@/components/inspector/Inspector";
// import { StatusBar } from "@/components/layout/StatusBar";
// import { ConnectionStatusBanner } from "@/components/layout/ConnectionStatusBanner";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useConnectionStore } from "@/stores/connectionStore";
import { CookieConsent } from "@/components/cookie-consent";
import { KtrlPlaneAuthProvider } from "@/components/KtrlPlaneAuthProvider";

function App() {
  const {
    showLeftPanel,
    showRightPanel,
    leftPanelSize,
    rightPanelSize,
    setPanelSize,
  } = useWorkspaceStore();

  const currentConnectionId = useConnectionStore(
    (state) => state.currentConnectionId
  );
  const setCurrentConnection = useConnectionStore(
    (state) => state.setCurrentConnection
  );

  // Initialize connection on app start if we have a saved connection
  useEffect(() => {
    console.log("App mounted, currentConnectionId:", currentConnectionId);
    if (currentConnectionId) {
      console.log("Initializing connection:", currentConnectionId);
      setCurrentConnection(currentConnectionId)
        .then(() => {
          console.log("Connection initialized successfully");
        })
        .catch((error) => {
          console.error("Failed to initialize connection:", error);
        });
    } else {
      console.log("No connection to initialize");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Set GTM consent using gtag API
  const setGtmConsent = (consent: "accepted" | "declined") => {
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
    }
  };

  // Callback for accepting cookies
  const handleAccept = () => {
    setGtmConsent("accepted");
  };

  // Callback for declining cookies
  const handleDecline = () => {
    setGtmConsent("declined");
  };

  return (
    <KtrlPlaneAuthProvider>
      <ThemeProvider defaultTheme="system" storageKey="konnektr-graph-theme">
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
        </div>
      </ThemeProvider>
    </KtrlPlaneAuthProvider>
  );
}

export default App;
