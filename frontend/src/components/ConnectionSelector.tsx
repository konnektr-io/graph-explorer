import { useState, useEffect } from "react";
import {
  useConnectionStore,
  validateConnectionAuth,
  type AuthProvider,
} from "@/stores/connectionStore";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
} from "@/components/ui/select";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Trash2, MoreVertical, RefreshCw, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAuth0 } from "@auth0/auth0-react";
import { fetchGraphResources } from "@/services/ktrlplaneClient";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

export function ConnectionSelector(): React.ReactElement {
  const ktrlPlaneConnections = useConnectionStore(
    (state) => state.ktrlPlaneConnections
  );
  const localConnections = useConnectionStore((state) => state.connections);
  const currentConnectionId = useConnectionStore(
    (state) => state.currentConnectionId
  );
  const setCurrentConnection = useConnectionStore(
    (state) => state.setCurrentConnection
  );
  const addConnection = useConnectionStore((state) => state.addConnection);
  const removeConnection = useConnectionStore(
    (state) => state.removeConnection
  );
  const updateConnection = useConnectionStore(
    (state) => state.updateConnection
  );
  const setKtrlPlaneConnections = useConnectionStore(
    (state) => state.setKtrlPlaneConnections
  );

  const { isAuthenticated, getAccessTokenSilently, getAccessTokenWithPopup } =
    useAuth0();

  const [open, setOpen] = useState(false);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editingConnectionId, setEditingConnectionId] = useState<string | null>(
    null
  );
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [form, setForm] = useState({
    name: "",
    adtHost: "",
    description: "",
    authProvider: "none" as AuthProvider,
    // MSAL fields
    clientId: "",
    tenantId: "",
    scopes: "",
    // Auth0 fields
    domain: "",
    audience: "",
  });
  const [error, setError] = useState<string | null>(null);

  // Initial fetch and auto-select on auth
  useEffect(() => {
    if (isAuthenticated) {
      handleRefresh();
    }
  }, [isAuthenticated]);

  // Poll KtrlPlane resources every 30s while authenticated
  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = setInterval(() => {
      handleRefresh();
    }, 30000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  const handleRefresh = async () => {
    if (!isAuthenticated) return;

    setIsRefreshing(true);
    try {
      let token: string | undefined;
      try {
        token = await getAccessTokenSilently({
          authorizationParams: {
            audience:
              import.meta.env.VITE_AUTH0_KTRLPLANE_AUDIENCE ||
              "https://ktrlplane.konnektr.io",
          },
        });
      } catch (silentError) {
        console.warn("Silent auth failed, trying popup:", silentError);
        // If silent auth fails (e.g., missing refresh token), try popup
        try {
          token = await getAccessTokenWithPopup({
            authorizationParams: {
              audience:
                import.meta.env.VITE_AUTH0_KTRLPLANE_AUDIENCE ||
                "https://ktrlplane.konnektr.io",
            },
          });
        } catch (popupError: any) {
          // Handle popup blocker or user cancellation
          if (popupError?.message?.includes("window.open returned `null`")) {
            toast.error("Popup blocked: Please allow popups and try again");
          } else if (
            popupError?.message?.includes("cancelled") ||
            popupError?.error === "access_denied"
          ) {
            // User cancelled, silently ignore
            console.log("User cancelled authentication");
          } else {
            toast.error(
              "Failed to authenticate: " +
                (popupError?.message || "Unknown error")
            );
          }
          setIsRefreshing(false);
          return;
        }
      }
      if (typeof token === "string" && token.length > 0) {
        const resources = await fetchGraphResources(token);
        setKtrlPlaneConnections(resources);

        // Auto-select first connection if no valid connection is currently set
        if (resources.length > 0) {
          const {
            currentConnectionId,
            getAllConnections,
            setCurrentConnection,
          } = useConnectionStore.getState();
          const allConnections = getAllConnections();
          const currentConnectionExists = allConnections.some(
            (c) => c.id === currentConnectionId
          );

          if (!currentConnectionId || !currentConnectionExists) {
            console.log(
              "Auto-selecting first KtrlPlane connection:",
              resources[0].name
            );
            await setCurrentConnection(`ktrlplane-${resources[0].resource_id}`);
          }
        }
      } else {
        console.warn(
          "No valid KtrlPlane token received. Skipping resource fetch."
        );
        setKtrlPlaneConnections([]);
      }
    } catch (error: any) {
      console.error("Failed to refresh KtrlPlane resources:", error);
      // Only show toast for unexpected errors (not auth cancellations)
      if (
        !error?.message?.includes("cancelled") &&
        error?.error !== "access_denied"
      ) {
        toast.error("Failed to load KtrlPlane resources");
      }
      setKtrlPlaneConnections([]);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleEdit = () => {
    if (!currentConnection || currentConnection.isKtrlPlaneManaged) return;

    setEditMode(true);
    setShowCustomForm(true);
    setEditingConnectionId(currentConnection.id);
    setForm({
      name: currentConnection.name,
      adtHost: currentConnection.adtHost,
      description: currentConnection.description || "",
      authProvider: currentConnection.authProvider,
      clientId: currentConnection.authConfig?.clientId || "",
      tenantId: currentConnection.authConfig?.tenantId || "",
      scopes: currentConnection.authConfig?.scopes?.join(", ") || "",
      domain: currentConnection.authConfig?.domain || "",
      audience: currentConnection.authConfig?.audience || "",
    });
    setOpen(true);
  };

  const handleDeployOnKtrlPlane = () => {
    window.open(
      "https://ktrlplane.konnektr.io/resources/create?resource_type=Konnektr.Graph&sku=standard",
      "_blank"
    );
    setOpen(false);
  };

  const handleShowCustomForm = () => {
    setShowCustomForm(true);
  };

  const handleDialogOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      // Reset state when closing
      setShowCustomForm(false);
      setEditMode(false);
      setEditingConnectionId(null);
      setForm({
        name: "",
        adtHost: "",
        description: "",
        authProvider: "none",
        clientId: "",
        tenantId: "",
        scopes: "",
        domain: "",
        audience: "",
      });
      setError(null);
    }
  };

  const handleAdd = async () => {
    if (!form.name.trim() || !form.adtHost.trim()) {
      setError("Name and Host are required.");
      return;
    }

    // Build auth config based on provider
    let authConfig = undefined;
    if (form.authProvider === "msal") {
      authConfig = {
        clientId: form.clientId,
        tenantId: form.tenantId,
        scopes: form.scopes
          ? form.scopes.split(",").map((s) => s.trim())
          : undefined,
      };
    } else if (form.authProvider === "auth0") {
      authConfig = {
        clientId: form.clientId,
        domain: form.domain,
        audience: form.audience,
      };
    }

    const newConnection = {
      id: form.name.toLowerCase().replace(/\s+/g, "-"),
      name: form.name,
      adtHost: form.adtHost,
      description: form.description,
      authProvider: form.authProvider,
      authConfig,
    };

    // Validate auth configuration
    const validationError = validateConnectionAuth(newConnection);
    if (validationError) {
      setError(validationError);
      return;
    }

    if (editMode && editingConnectionId) {
      // Update existing connection
      updateConnection(editingConnectionId, newConnection);
    } else {
      // Add new connection
      addConnection(newConnection);
      await setCurrentConnection(newConnection.id);
    }

    setForm({
      name: "",
      adtHost: "",
      description: "",
      authProvider: "none",
      clientId: "",
      tenantId: "",
      scopes: "",
      domain: "",
      audience: "",
    });
    setError(null);
    setEditMode(false);
    setEditingConnectionId(null);
    setShowCustomForm(false);
    setOpen(false);
  };

  const currentConnection =
    localConnections.find((c) => c.id === currentConnectionId) ||
    ktrlPlaneConnections.find((c) => c.id === currentConnectionId);

  const canDeleteCurrent =
    currentConnection &&
    !currentConnection.isKtrlPlaneManaged &&
    currentConnection.id !== "localhost";

  const canEditCurrent =
    currentConnection &&
    !currentConnection.isKtrlPlaneManaged &&
    currentConnection.id !== "localhost";

  const handleDeleteClick = () => {
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (currentConnection && canDeleteCurrent) {
      removeConnection(currentConnection.id);
      setDeleteDialogOpen(false);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <Select
        value={currentConnectionId || ""}
        onValueChange={setCurrentConnection}
      >
        <SelectTrigger className="min-w-[180px]">
          <SelectValue placeholder="Select connection..." />
        </SelectTrigger>
        <SelectContent>
          {ktrlPlaneConnections.length > 0 && (
            <SelectGroup>
              <SelectLabel>Konnektr Managed</SelectLabel>
              {ktrlPlaneConnections.map((conn) => {
                const isHealthy = conn.status === "Healthy";
                return (
                  <SelectItem
                    key={conn.id}
                    value={conn.id}
                    disabled={!isHealthy}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{conn.name}</span>
                      {conn.ktrlPlaneProjectId && (
                        <span className="text-xs text-muted-foreground">
                          {conn.ktrlPlaneProjectId}
                        </span>
                      )}
                      <span
                        className={`text-xs px-2 py-0.5 rounded font-semibold ${
                          isHealthy
                            ? "bg-green-100 text-green-800"
                            : conn.status === "Progressing"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-red-100 text-red-800"
                        }`}
                        title={conn.status}
                      >
                        {conn.status}
                      </span>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectGroup>
          )}
          <SelectGroup>
            <SelectLabel>
              {ktrlPlaneConnections.length > 0
                ? "Custom Connections"
                : "Connections"}
            </SelectLabel>
            {localConnections.map((conn) => {
              const isDemo =
                conn.authProvider === "none" &&
                (conn.name?.toLowerCase().includes("demo") ||
                  conn.adtHost === "demo.api.graph.konnektr.io");
              return (
                <SelectItem key={conn.id} value={conn.id}>
                  <div className="flex items-center gap-2">
                    <span>{conn.name}</span>
                    {isDemo && (
                      <Badge variant="secondary">Demo</Badge>
                    )}
                    {conn.authProvider !== "none" && (
                      <span className="text-xs text-muted-foreground px-1.5 py-0.5 rounded bg-secondary">
                        {conn.authProvider}
                      </span>
                    )}
                  </div>
                </SelectItem>
              );
            })}
          </SelectGroup>
        </SelectContent>
      </Select>

      {(isAuthenticated || canEditCurrent || canDeleteCurrent) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-9 w-9 p-0">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {isAuthenticated && (
              <DropdownMenuItem onClick={handleRefresh} disabled={isRefreshing}>
                <RefreshCw
                  className={`mr-2 h-4 w-4 ${
                    isRefreshing ? "animate-spin" : ""
                  }`}
                />
                Refresh KtrlPlane Resources
              </DropdownMenuItem>
            )}
            {canEditCurrent && (
              <DropdownMenuItem onClick={handleEdit}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit Connection
              </DropdownMenuItem>
            )}
            {canDeleteCurrent && (
              <DropdownMenuItem
                onClick={handleDeleteClick}
                className="text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Remove Connection
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <Dialog open={open} onOpenChange={handleDialogOpenChange}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            Add
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>
              {editMode
                ? "Edit Connection"
                : showCustomForm
                ? "Add Custom Connection"
                : "Add Connection"}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-4">
            {!showCustomForm && !editMode ? (
              <div className="space-y-4 py-4">
                <div className="space-y-3">
                  <h3 className="text-sm font-medium">
                    Deploy Konnektr Graph on KtrlPlane
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Get started quickly with a fully managed Konnektr Graph
                    instance. Deploy in seconds and manage everything from your
                    KtrlPlane dashboard.
                  </p>
                  <Button
                    onClick={handleDeployOnKtrlPlane}
                    className="w-full"
                    size="lg"
                  >
                    Deploy on KtrlPlane
                  </Button>
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">
                      Or
                    </span>
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-medium">
                    Connect to Existing Instance
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Connect to your own Azure Digital Twins or self-hosted
                    Konnektr Graph instance.
                  </p>
                  <Button
                    onClick={handleShowCustomForm}
                    variant="outline"
                    className="w-full"
                  >
                    Add Custom Connection
                  </Button>
                </div>
              </div>
            ) : (
              <form
                id="connection-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleAdd();
                }}
                className="space-y-4"
              >
                <div>
                  <Label htmlFor="conn-name">Name</Label>
                  <Input
                    id="conn-name"
                    value={form.name}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, name: e.target.value }))
                    }
                    placeholder="e.g. Local Dev"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="conn-host">Host</Label>
                  <Input
                    id="conn-host"
                    value={form.adtHost}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, adtHost: e.target.value }))
                    }
                    placeholder="e.g. localhost:5000"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="conn-desc">Description</Label>
                  <Input
                    id="conn-desc"
                    value={form.description}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, description: e.target.value }))
                    }
                    placeholder="Optional"
                  />
                </div>

                {/* Auth Provider Selector */}
                <div>
                  <Label htmlFor="auth-provider">Authentication</Label>
                  <Select
                    value={form.authProvider}
                    onValueChange={(value) =>
                      setForm((f) => ({
                        ...f,
                        authProvider: value as AuthProvider,
                      }))
                    }
                  >
                    <SelectTrigger id="auth-provider">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">
                        None (Demo/Local/Proxy)
                      </SelectItem>
                      <SelectItem value="msal">
                        MS Entra (Azure Digital Twins)
                      </SelectItem>
                      <SelectItem value="auth0">
                        Auth0 (Konnektr Graph Self-Hosted)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    {form.authProvider === "none" &&
                      "No authentication required"}
                    {form.authProvider === "msal" &&
                      "Azure Entra authentication with PKCE"}
                    {form.authProvider === "auth0" && "Auth0 authentication"}
                  </p>
                </div>

                {/* MSAL Configuration Fields */}
                {form.authProvider === "msal" && (
                  <div className="space-y-3 p-3 border rounded-md bg-muted/30">
                    <p className="text-sm font-medium">MSAL Configuration</p>
                    <div>
                      <Label htmlFor="msal-clientId">
                        Client ID <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="msal-clientId"
                        value={form.clientId}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, clientId: e.target.value }))
                        }
                        placeholder="00000000-0000-0000-0000-000000000000"
                        required={form.authProvider === "msal"}
                      />
                    </div>
                    <div>
                      <Label htmlFor="msal-tenantId">
                        Tenant ID <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="msal-tenantId"
                        value={form.tenantId}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, tenantId: e.target.value }))
                        }
                        placeholder="00000000-0000-0000-0000-000000000000"
                        required={form.authProvider === "msal"}
                      />
                    </div>
                    <div>
                      <Label htmlFor="msal-scopes">Scopes (optional)</Label>
                      <Input
                        id="msal-scopes"
                        value={form.scopes}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, scopes: e.target.value }))
                        }
                        placeholder="https://digitaltwins.azure.net/.default"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Comma-separated. Defaults to Azure Digital Twins scope.
                      </p>
                    </div>
                  </div>
                )}

                {/* Auth0 Configuration Fields */}
                {form.authProvider === "auth0" && (
                  <div className="space-y-3 p-3 border rounded-md bg-muted/30">
                    <p className="text-sm font-medium">Auth0 Configuration</p>
                    <div>
                      <Label htmlFor="auth0-domain">
                        Domain <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="auth0-domain"
                        value={form.domain}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, domain: e.target.value }))
                        }
                        placeholder="your-tenant.auth0.com"
                        required={form.authProvider === "auth0"}
                      />
                    </div>
                    <div>
                      <Label htmlFor="auth0-clientId">
                        Client ID <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="auth0-clientId"
                        value={form.clientId}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, clientId: e.target.value }))
                        }
                        placeholder="your-client-id"
                        required={form.authProvider === "auth0"}
                      />
                    </div>
                    <div>
                      <Label htmlFor="auth0-audience">
                        Audience <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="auth0-audience"
                        value={form.audience}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, audience: e.target.value }))
                        }
                        placeholder="https://your-api-identifier"
                        required={form.authProvider === "auth0"}
                      />
                    </div>
                  </div>
                )}

                {error && <div className="text-red-500 text-sm">{error}</div>}
              </form>
            )}
          </ScrollArea>
          <DialogFooter>
            {(showCustomForm || editMode) && (
              <>
                <Button type="submit" form="connection-form">
                  {editMode ? "Save Changes" : "Add Connection"}
                </Button>
                <DialogClose asChild>
                  <Button type="button" variant="ghost">
                    Cancel
                  </Button>
                </DialogClose>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Connection</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove the connection "
              {currentConnection?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
