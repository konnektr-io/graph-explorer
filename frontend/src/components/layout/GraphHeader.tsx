import { useEffect } from "react";
import {
  Settings,
  LogOut,
  Menu,
  PanelRightOpen,
  PanelLeftOpen,
  LogIn,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useConnectionStore } from "../../stores/connectionStore";
import { ModeToggle } from "../mode-toggle";
import { ConnectionSelector } from "@/components/ConnectionSelector";
import { ConnectionStatus } from "@/components/ConnectionStatus";
import { useAuth0 } from "@auth0/auth0-react";
import { fetchGraphResources } from "@/services/ktrlplaneClient";
import konnektrLogo from "../assets/konnektr.svg";

export function GraphHeader() {
  const {
    mainView,
    setMainView,
    showRightPanel,
    setShowRightPanel,
    showLeftPanel,
    setShowLeftPanel,
  } = useWorkspaceStore();

  const { setKtrlPlaneConnections } = useConnectionStore();

  const {
    isAuthenticated,
    isLoading,
    user,
    loginWithRedirect,
    logout,
    getAccessTokenSilently,
  } = useAuth0();

  // Fetch KtrlPlane Graph resources when authenticated
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      const loadKtrlPlaneResources = async () => {
        try {
          const token = await getAccessTokenSilently({
            authorizationParams: {
              audience:
                import.meta.env.VITE_AUTH0_KTRLPLANE_AUDIENCE ||
                "https://ktrlplane.konnektr.io",
            },
          });
          const resources = await fetchGraphResources(token);
          setKtrlPlaneConnections(resources);
          console.log("Loaded KtrlPlane Graph resources:", resources.length);
        } catch (error) {
          console.error("Failed to load KtrlPlane resources:", error);
          // Don't fail the app, just log the error
          // User can still use local connections
        }
      };
      loadKtrlPlaneResources();
    } else if (!isAuthenticated) {
      // Clear KtrlPlane connections when logged out
      setKtrlPlaneConnections([]);
    }
  }, [
    isAuthenticated,
    isLoading,
    getAccessTokenSilently,
    setKtrlPlaneConnections,
  ]);

  const handleLogout = () => {
    logout({ logoutParams: { returnTo: window.location.origin } });
  };

  const handleLogin = () => {
    loginWithRedirect();
  };

  return (
    <header className="border-b bg-background px-6 py-4">
      <div className="flex items-center justify-between h-10">
        <div className="flex items-center gap-4">
          {/* Left Panel Toggle */}
          {!showLeftPanel && (
            <Button
              variant="ghost"
              size="sm"
              className="p-2"
              onClick={() => setShowLeftPanel(true)}
              title="Open Models Panel"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </Button>
          )}

          {/* Logo and Title - Main Brand */}
          <div className="flex items-center gap-2">
            <img src={konnektrLogo} alt="Konnektr logo" className="h-7 w-7" />
            <span className="font-semibold text-foreground">
              Konnektr Graph
            </span>
          </div>

          {/* Connection Selector */}
          <ConnectionSelector />
        </div>

        <div className="flex items-center gap-4">
          {/* View Switcher */}
          <div className="flex gap-1 p-1 bg-muted rounded-md">
            <Button
              variant={mainView === "query" ? "default" : "ghost"}
              size="sm"
              className="px-3 py-1.5 text-xs"
              onClick={() => setMainView("query")}
            >
              Query Explorer
            </Button>
            <Button
              variant={mainView === "models" ? "default" : "ghost"}
              size="sm"
              className="px-3 py-1.5 text-xs"
              onClick={() => setMainView("models")}
            >
              Model Graph
            </Button>
          </div>

          {/* Inspector Panel Toggle */}
          {!showRightPanel && (
            <Button
              variant="ghost"
              size="sm"
              className="p-2"
              onClick={() => setShowRightPanel(true)}
              title="Open Inspector Panel"
            >
              <PanelRightOpen className="w-4 h-4" />
            </Button>
          )}

          {/* Connection Status */}
          <ConnectionStatus />

          {/* Settings Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <Menu className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              {isAuthenticated ? (
                <Button variant="ghost" size="sm" className="gap-2">
                  <Avatar className="h-6 w-6">
                    <AvatarImage
                      src={user?.picture || undefined}
                      alt={user?.name || "User"}
                    />
                    <AvatarFallback className="text-xs">
                      {user?.name
                        ? user.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .toUpperCase()
                        : "U"}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden md:inline text-sm">
                    {user?.email || user?.name || "User"}
                  </span>
                </Button>
              ) : (
                <Button variant="ghost" size="sm" className="gap-2">
                  <Avatar className="h-6 w-6">
                    <AvatarFallback className="text-xs">?</AvatarFallback>
                  </Avatar>
                  <span className="hidden md:inline text-sm">
                    Not signed in
                  </span>
                </Button>
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {isAuthenticated ? (
                <>
                  <DropdownMenuItem disabled className="flex-col items-start">
                    <div className="font-medium">{user?.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {user?.email}
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign out
                  </DropdownMenuItem>
                </>
              ) : (
                <DropdownMenuItem onClick={handleLogin}>
                  <LogIn className="mr-2 h-4 w-4" />
                  Sign in with KtrlPlane
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <ModeToggle />
        </div>
      </div>
    </header>
  );
}
