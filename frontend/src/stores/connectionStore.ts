// @ts-nocheck - Zustand type inference issues with strict mode
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { KtrlPlaneResource } from "@/services/ktrlplaneClient";

/**
 * Authentication provider types supported by Graph Explorer
 */
export type AuthProvider = "msal" | "auth0" | "none" | "ktrlplane";

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
}

/**
 * Digital Twins connection with authentication configuration
 */
export interface Connection {
  id: string;
  name: string;
  adtHost: string;
  description?: string;

  // Authentication
  authProvider: AuthProvider;
  authConfig?: AuthConfig;

  // KtrlPlane metadata (for connections from KtrlPlane)
  isKtrlPlaneManaged?: boolean;
  ktrlPlaneResourceId?: string;
  ktrlPlaneProjectId?: string;
}

interface ConnectionState {
  connections: Connection[];
  ktrlPlaneConnections: Connection[]; // Connections from KtrlPlane (not persisted)
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
  getAllConnections: () => Connection[]; // Returns merged connections
}

const defaultConnections: Connection[] = [];

export const useConnectionStore = create<ConnectionState>()(
  persist(
    (set, get) => ({
      connections: defaultConnections,
      ktrlPlaneConnections: [],
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
        console.log("setCurrentConnection called with id:", id);
        const state = get();
        console.log("Current state:", {
          ktrlPlaneConnections: state.ktrlPlaneConnections.length,
          localConnections: state.connections.length,
          currentConnectionId: state.currentConnectionId,
        });
        const allConnections = [
          ...state.ktrlPlaneConnections,
          ...state.connections,
        ];
        const conn = allConnections.find((c) => c.id === id);
        console.log("Found connection:", conn?.name, conn?.authProvider);
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
          console.log("Connection set to:", id); // For MSAL connections, just initialize the credential (don't call getToken yet)
          // This ensures MSAL is ready and handles any redirect responses
          if (conn.authProvider === "msal") {
            try {
              // Import here to avoid circular dependencies
              const { getTokenCredential } = await import("@/services/auth");
              // Just initialize - this handles redirects and sets up MSAL
              // Actual token will be acquired when first API call is made
              await getTokenCredential(conn);
              console.log("MSAL credential initialized and ready");
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
        // Map all resources - prefer internal service address for instant connectivity
        const connections = resources.map((resource) => {
          // Use internal Kubernetes service address if possible
          const internalEndpoint =
            resource.resource_id && resource.project_id
              ? `${resource.resource_id}-api.${resource.project_id}.svc.cluster.local`
              : undefined;
          // Prefer internal, else fallback to public DNS
          const endpoint =
            internalEndpoint || `${resource.resource_id}.api.graph.konnektr.io`;

          return {
            id: `ktrlplane-${resource.resource_id}`,
            name: resource.name,
            adtHost: endpoint,
            description: `Managed by KtrlPlane (${resource.sku})`,
            authProvider: "ktrlplane" as AuthProvider,
            isKtrlPlaneManaged: true,
            ktrlPlaneResourceId: resource.resource_id,
            ktrlPlaneProjectId: resource.project_id,
          };
        });
        set({ ktrlPlaneConnections: connections });
        console.log(`Configured ${connections.length} KtrlPlane connections`);
      },

      getAllConnections: () => {
        const state = get();
        // KtrlPlane connections first, then local connections
        return [...state.ktrlPlaneConnections, ...state.connections];
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
