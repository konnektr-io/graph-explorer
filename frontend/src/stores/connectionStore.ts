import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { KtrlPlaneResource } from "@/services/ktrlplaneClient";
import type { EnvironmentType } from "@/services/environmentsClient";
import { isLocalhost } from "@/utils/isLocalHost";

/**
 * Authentication provider types supported by Graph Explorer
 */
export type AuthProvider = "msal" | "auth0" | "none" | "ktrlplane";

/**
 * Source that manages a connection (for auto-discovered environments)
 */
export type ManagedSource = "ktrlplane" | "environments" | "custom";

/**
 * Authentication configuration for a connection
 */
export interface AuthConfig {
  // For MSAL (Azure Digital Twins)
  clientId?: string;
  tenantId?: string;
  scopes?: string[]; // Default: ["https://digitaltwins.azure.net/.default"]

  // For Auth0 (Konnektr hosted/self-hosted)
  // Note: clientId is reused for both MSAL and Auth0
  domain?: string;
  audience?: string;

  // Common
  redirectUri?: string; // Defaults to window.location.origin

  // B2C-authored configs (custom "Arcadis IAM" connections) — the credential is
  // resolved from the deployment-wide B2C configuration instead of this object.
  isB2C?: boolean;
}

/**
 * Digital Twins connection with authentication configuration
 *
 * Supports two routing modes:
 * - **Host routing**: Set `adtHost` to send `x-adt-host` header (Konnektr Graph / ADT direct)
 * - **Environment routing**: Set `environmentId` to send `x-adt-id` header (proxy-resolved)
 */
export interface Connection {
  id: string;
  name: string;

  /**
   * Backend hostname for direct routing.
   * When set, the custom pipeline policy sends `x-adt-host: <adtHost>`.
   * Alternative to `environmentId` — exactly one of the two must be set.
   * Omitted for environment-routed connections, where the backend host is
   * resolved by the proxy and the request URL is rewritten to the current origin.
   */
  adtHost?: string;

  /**
   * Environment identifier for proxy-resolved routing.
   * When set, the custom pipeline policy sends `x-adt-id: <environmentId>`.
   * The proxy resolves this to the actual backend host internally.
   * Alternative to `adtHost` — only one should be set.
   */
  environmentId?: string;

  description?: string;

  // Authentication
  authProvider: AuthProvider;
  authConfig?: AuthConfig;

  // Managed source metadata (for auto-discovered connections)
  managedSource?: ManagedSource;
  /** @deprecated Use `managedSource` instead. Kept for backward compatibility. */
  isKtrlPlaneManaged?: boolean;
  ktrlPlaneResourceId?: string;
  ktrlPlaneProjectId?: string;

  // Resource status (optional, only for managed connections)
  status?: string;

  /**
   * Backend kind of an environment-managed connection, derived from the
   * environment's `adtHost` (ADT vs self-hosted Konnektr Graph).
   * Display-only — NEVER used for routing (routing stays on `environmentId`).
   */
  environmentType?: EnvironmentType;

  // Internal fields for matching (prefixed with _ to indicate they're not user-facing)
  _internalEndpoint?: string; // Kubernetes internal service address
  _externalEndpoint?: string; // Public DNS endpoint
}

interface ConnectionState {
  connections: Connection[];
  ktrlPlaneConnections: Connection[]; // Connections from KtrlPlane (not persisted)
  environmentConnections: Connection[]; // Connections from the environments API (not persisted)
  currentConnectionId: string | null;
  dismissedBanners: Set<string>; // Track dismissed connection banners by connection ID

  // Actions
  addConnection: (conn: Connection) => void;
  removeConnection: (id: string) => void;
  updateConnection: (id: string, updates: Partial<Connection>) => void;
  setCurrentConnection: (id: string) => Promise<void>;
  getCurrentConnection: () => Connection | null;
  testConnection: (id: string) => Promise<boolean>;
  dismissBanner: (connectionId: string) => void;
  isBannerDismissed: (connectionId: string) => boolean;
  setKtrlPlaneConnections: (resources: KtrlPlaneResource[]) => void;
  setEnvironmentConnections: (environments: Connection[]) => void;
  getAllConnections: () => Connection[]; // Returns merged connections
}

const defaultConnections: Connection[] = [];

export const useConnectionStore = create<ConnectionState>()(
  persist(
    (set, get) => ({
      connections: defaultConnections,
      ktrlPlaneConnections: [],
      environmentConnections: [],
      currentConnectionId: defaultConnections[0]?.id || null,
      dismissedBanners: new Set<string>(),

      addConnection: (conn) => {
        set((state) => ({
          connections: [...state.connections, conn],
        }));
      },

      removeConnection: (id) => {
        set((state) => ({
          connections: state.connections.filter((c) => c.id !== id),
          currentConnectionId:
            state.currentConnectionId === id
              ? state.connections[0]?.id || null
              : state.currentConnectionId,
        }));
      },

      updateConnection: (id, updates) => {
        set((state) => ({
          connections: state.connections.map((c) =>
            c.id === id ? { ...c, ...updates } : c
          ),
        }));
      },

      setCurrentConnection: async (id) => {
        const state = get();
        const allConnections = [
          ...state.ktrlPlaneConnections,
          ...state.environmentConnections,
          ...state.connections,
        ];
        const conn = allConnections.find((c) => c.id === id);
        if (conn) {
          // Clear previous connection data before switching
          // Import stores dynamically to avoid circular dependencies
          const { useQueryStore } = await import("./queryStore");
          const { useModelsStore } = await import("./modelsStore");
          const { useInspectorStore } = await import("./inspectorStore");

          useQueryStore.getState().clearQueryResults();
          useModelsStore.getState().clearModels();
          useInspectorStore.getState().clearSelection();

          set({ currentConnectionId: id });

          // For MSAL connections, just initialize the credential (don't call
          // getToken yet). This ensures MSAL is ready and handles any redirect
          // responses; the actual token is acquired on the first API call.
          if (conn.authProvider === "msal") {
            try {
              // Import here to avoid circular dependencies
              const { getTokenCredential } = await import("@/services/auth");
              await getTokenCredential(conn);
            } catch (error) {
              console.warn("Auth initialization:", error);
              // Don't fail the connection selection, just log the warning
              // The actual API calls will trigger login if needed
            }
          }
        }
      },

      getCurrentConnection: () => {
        const state = get();
        const allConnections = [
          ...state.ktrlPlaneConnections,
          ...state.environmentConnections,
          ...state.connections,
        ];
        return (
          allConnections.find((c) => c.id === state.currentConnectionId) || null
        );
      },

      testConnection: async (id) => {
        const state = get();
        const allConnections = [
          ...state.ktrlPlaneConnections,
          ...state.environmentConnections,
          ...state.connections,
        ];
        const conn = allConnections.find((c) => c.id === id);
        if (!conn) {
          console.error(`Connection ${id} not found`);
          return false;
        }

        try {
          // Import here to avoid circular dependencies
          const { digitalTwinsClientFactory } = await import(
            "@/services/digitalTwinsClientFactory"
          );

          // Try to create a client - this will trigger auth if needed
          const client = await digitalTwinsClientFactory(conn);

          // Try a simple API call to verify connection works
          // Just list models with limit 1 to test connectivity
          const models = client.listModels({ includeModelDefinition: false });
          await models.next(); // Get first result

          return true;
        } catch (error) {
          console.error("Connection test failed:", error);
          return false;
        }
      },

      dismissBanner: (connectionId) => {
        set((state) => ({
          dismissedBanners: new Set(state.dismissedBanners).add(connectionId),
        }));
      },

      isBannerDismissed: (connectionId) => {
        return get().dismissedBanners.has(connectionId);
      },

      setKtrlPlaneConnections: (resources) => {
        // Map all resources - prefer public DNS when running locally
        const connections = resources.map((resource) => {
          const internalEndpoint =
            resource.resource_id && resource.project_id
              ? `${resource.resource_id}-api.${resource.project_id}.svc.cluster.local`
              : undefined;
          // If running locally, always use public DNS endpoint
          const endpoint = isLocalhost()
            ? `${resource.resource_id}.api.graph.konnektr.io`
            : internalEndpoint ||
              `${resource.resource_id}.api.graph.konnektr.io`;

          return {
            id: resource.resource_id,
            name: resource.name,
            adtHost: endpoint,
            description: `Managed by KtrlPlane (${resource.sku})`,
            authProvider: "ktrlplane" as AuthProvider,
            isKtrlPlaneManaged: true,
            managedSource: "ktrlplane" as ManagedSource,
            ktrlPlaneResourceId: resource.resource_id,
            ktrlPlaneProjectId: resource.project_id,
            status: resource.status, // Add status property
            // Store both endpoints for matching
            _internalEndpoint: internalEndpoint,
            _externalEndpoint: `${resource.resource_id}.api.graph.konnektr.io`,
          };
        });

        // Deduplicate: Remove local connections that match KtrlPlane resources
        // Match by external endpoint, internal endpoint, or resource_id
        set((state) => {
          let replacementConnectionId: string | null = null;

          const deduplicatedLocal = state.connections.filter((localConn) => {
            // Environment-routed connections have no adtHost to match on.
            const localHost = localConn.adtHost;
            if (!localHost) return true;

            // Check if this local connection matches any KtrlPlane connection
            const matchingKtrlConn = connections.find((ktrlConn) => {
              // Match by exact host
              if (localHost === ktrlConn.adtHost) return true;
              // Match by external endpoint (query param will use this)
              if (localHost === ktrlConn._externalEndpoint) return true;
              // Match by internal endpoint
              if (
                ktrlConn._internalEndpoint &&
                localHost === ktrlConn._internalEndpoint
              )
                return true;
              // Match by resource ID pattern (e.g., "free-resource-1y1z" in either)
              if (
                ktrlConn.ktrlPlaneResourceId &&
                localHost.includes(ktrlConn.ktrlPlaneResourceId)
              )
                return true;
              return false;
            });

            // If this is the currently selected connection and it matches a KtrlPlane connection,
            // remember to switch to the KtrlPlane connection
            if (
              matchingKtrlConn &&
              localConn.id === state.currentConnectionId
            ) {
              replacementConnectionId = matchingKtrlConn.id;
            }

            return !matchingKtrlConn;
          });

          const removedCount =
            state.connections.length - deduplicatedLocal.length;
          if (removedCount > 0) {
            console.log(
              `Removed ${removedCount} duplicate local connection(s) that match KtrlPlane resources`
            );
          }

          // If current connection was removed, switch to the replacement
          const newCurrentConnectionId = replacementConnectionId
            ? replacementConnectionId
            : state.currentConnectionId;

          if (
            replacementConnectionId &&
            replacementConnectionId !== state.currentConnectionId
          ) {
            console.log(
              `Switching from removed connection to KtrlPlane connection: ${replacementConnectionId}`
            );
          }

          return {
            ktrlPlaneConnections: connections,
            connections: deduplicatedLocal,
            currentConnectionId: newCurrentConnectionId,
          };
        });

        console.log(`Configured ${connections.length} KtrlPlane connections`);
      },

      setEnvironmentConnections: (environments) => {
        set((state) => {
          // Keep the current selection when it still resolves after the refresh.
          // If the selected environment disappeared, fall back to no selection so
          // the UI can auto-select instead of pointing at a stale connection.
          const selectionStillValid =
            state.currentConnectionId === null ||
            environments.some((c) => c.id === state.currentConnectionId) ||
            state.ktrlPlaneConnections.some(
              (c) => c.id === state.currentConnectionId
            ) ||
            state.connections.some((c) => c.id === state.currentConnectionId);

          return {
            environmentConnections: environments,
            currentConnectionId: selectionStillValid
              ? state.currentConnectionId
              : environments[0]?.id ?? null,
          };
        });
      },

      getAllConnections: () => {
        const state = get();
        // Managed connections first, then local connections
        return [
          ...state.ktrlPlaneConnections,
          ...state.environmentConnections,
          ...state.connections,
        ];
      },
    }),
    {
      name: "konnektr-connections",
      // Don't persist ktrlPlaneConnections - only persist local connections
      partialize: (state) => ({
        connections: state.connections,
        currentConnectionId: state.currentConnectionId,
        dismissedBanners: Array.from(state.dismissedBanners), // Convert Set to Array
      }),
      // Merge function to restore Set from Array
      merge: (persistedState: any, currentState: ConnectionState) => ({
        ...currentState,
        ...persistedState,
        dismissedBanners: new Set(persistedState.dismissedBanners || []),
      }),
    }
  )
);

/**
 * Validates a connection's authentication configuration
 * @param connection The connection to validate
 * @returns Validation error message, or null if valid
 */
export function validateConnectionAuth(connection: Connection): string | null {
  const { authProvider, authConfig } = connection;

  if (!connection.adtHost && !connection.environmentId) {
    return "A connection requires either a Host or an Environment ID";
  }

  // Environment-managed connections authenticate with the deployment-wide B2C
  // config — they carry no per-connection authConfig by design.
  if (
    connection.managedSource === "environments" ||
    connection.environmentId
  ) {
    return null;
  }

  if (authProvider === "none") {
    return null; // No auth required
  }

  if (!authConfig) {
    return `Authentication configuration required for ${authProvider}`;
  }

  if (authProvider === "msal") {
    if (!authConfig.clientId) {
      return "MSAL requires a Client ID (Azure App Registration)";
    }
    if (!authConfig.tenantId) {
      return "MSAL requires a Tenant ID";
    }
    // Scopes are optional, will default to ["https://digitaltwins.azure.net/.default"]
  }

  if (authProvider === "auth0") {
    if (!authConfig.clientId) {
      return "Auth0 requires a Client ID";
    }
    if (!authConfig.domain) {
      return "Auth0 requires a Domain";
    }
    if (!authConfig.audience) {
      return "Auth0 requires an Audience";
    }
  }

  return null;
}
