import { useState } from "react";
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
import { useAuth0 } from "@auth0/auth0-react";
import { fetchGraphResources } from "@/services/ktrlplaneClient";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

  const { isAuthenticated, getAccessTokenSilently } = useAuth0();

  const [open, setOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editingConnectionId, setEditingConnectionId] = useState<string | null>(null);
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

  const handleRefresh = async () => {
    if (!isAuthenticated) return;
    
    setIsRefreshing(true);
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
    } catch (error) {
      console.error("Failed to refresh KtrlPlane resources:", error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleEdit = () => {
    if (!currentConnection || currentConnection.isKtrlPlaneManaged) return;
    
    setEditMode(true);
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
              <SelectLabel>KtrlPlane Managed</SelectLabel>
              {ktrlPlaneConnections.map((conn) => (
                <SelectItem key={conn.id} value={conn.id}>
                  <div className="flex items-center gap-2">
                    <span>{conn.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectGroup>
          )}
          <SelectGroup>
            <SelectLabel>
              {ktrlPlaneConnections.length > 0
                ? "Local Connections"
                : "Connections"}
            </SelectLabel>
            {localConnections.map((conn) => (
              <SelectItem key={conn.id} value={conn.id}>
                <div className="flex items-center gap-2">
                  <span>{conn.name}</span>
                  {conn.authProvider !== "none" && (
                    <span className="text-xs text-muted-foreground px-1.5 py-0.5 rounded bg-secondary">
                      {conn.authProvider}
                    </span>
                  )}
                </div>
              </SelectItem>
            ))}
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
                <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            Add
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{editMode ? "Edit Connection" : "Add Connection"}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-4">
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
                    <SelectItem value="none">None (Local/Proxy)</SelectItem>
                    <SelectItem value="msal">
                      MSAL (Azure Digital Twins)
                    </SelectItem>
                    <SelectItem value="auth0">
                      Auth0 (Konnektr Hosted)
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  {form.authProvider === "none" && "No authentication required"}
                  {form.authProvider === "msal" &&
                    "Azure AD authentication with PKCE"}
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
          </ScrollArea>
          <DialogFooter>
            <Button type="submit" form="connection-form">
              {editMode ? "Save Changes" : "Add Connection"}
            </Button>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
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
