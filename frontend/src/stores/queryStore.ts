// @ts-nocheck - Zustand type inference issues with strict mode
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { digitalTwinsClientFactory } from "@/services/digitalTwinsClientFactory";
import { useConnectionStore } from "./connectionStore";
import type { Connection } from "./connectionStore";
import { formatTwinForDisplay } from "@/utils/dtdlHelpers";
import { pruneDeletedFromResults } from "@/utils/resultPruning";
import {
  DEFAULT_ADT_SAMPLE_QUERY,
  DEFAULT_CYPHER_SAMPLE_QUERY,
  isAdtBackend,
} from "@/utils/graphBackend";

export interface QueryTab {
  id: string;
  name: string;
  query: string;
  saved: boolean;
  language: "sql" | "cypher";
}

export interface QueryHistoryItem {
  query: string;
  timestamp: number;
  executionTime?: number;
  resultCount?: number;
  /** True when the run was cancelled by the user (issue #22). */
  cancelled?: boolean;
}

export interface QueryState {
  // Tab management
  tabs: QueryTab[];
  activeTabId: string | null;

  // Current query state
  currentQuery: string;
  isExecuting: boolean;
  queryResults: any[] | null;
  queryError: string | null;

  /**
   * AbortController for the in-flight query. Undefined when idle; stored via
   * `set({ abortController })` so the UI can cancel from any component.
   * Excluded from the persist partialize below (non-serializable runtime handle).
   */
  abortController?: AbortController;

  // Query history
  queryHistory: QueryHistoryItem[];
  showHistory: boolean;

  // Results view state
  resultView: "table" | "graph";

  /** Wall-clock duration (ms) of the last finished run — success, error or cancel. */
  lastExecutionTime?: number;

  /** True when the last finished run was cancelled by the user (issue #22). */
  lastRunCancelled: boolean;

  // Actions
  addTab: (tab?: Partial<QueryTab>) => string;
  removeTab: (tabId: string) => void;
  updateTab: (tabId: string, updates: Partial<QueryTab>) => void;
  setActiveTab: (tabId: string) => void;
  addToHistory: (item: QueryHistoryItem) => void;
  setResultView: (view: "table" | "graph") => void;
  clearHistory: () => void;

  // New actions for query execution
  setCurrentQuery: (query: string) => void;
  setDefaultQueryForConnection: (connection?: Connection | null) => void;
  clearQueryResults: () => void;
  /**
   * Drop deleted twins from the current results so the table and graph stop
   * showing them. No-op when no results are loaded.
   */
  pruneDeletedTwins: (twinIds: Iterable<string>) => void;
  /** Drop deleted relationships from the current results. */
  pruneDeletedRelationships: (relationshipIds: Iterable<string>) => void;
  /** Abort the in-flight query (issue #22). No-op when idle. */
  cancelQuery: () => void;
  executeQuery: (
    query: string,
    getAccessTokenSilently?: (options?: {
      authorizationParams?: { audience?: string; scope?: string };
    }) => Promise<string>,
    getAccessTokenWithPopup?: (options?: {
      authorizationParams?: { audience?: string; scope?: string };
    }) => Promise<string>
  ) => Promise<void>;
  setShowHistory: (show: boolean) => void;
}

const generateTabId = () => Date.now().toString();

const createDefaultTab = (overrides?: Partial<QueryTab>): QueryTab => ({
  id: generateTabId(),
  name: "Untitled",
  query: DEFAULT_CYPHER_SAMPLE_QUERY,
  saved: true,
  language: "cypher",
  ...overrides,
});

export const useQueryStore = create<QueryState>()(
  persist(
    (set, get) => ({
      // Initial state
      tabs: [createDefaultTab({ name: "Query 1" })],
      activeTabId: null,

      // Current query state
      currentQuery: DEFAULT_CYPHER_SAMPLE_QUERY,
      isExecuting: false,
      queryResults: null,
      queryError: null,

      abortController: undefined,

      // Query history
      queryHistory: [],
      showHistory: false,

      // Results view state
      resultView: "table",

      lastExecutionTime: undefined,
      lastRunCancelled: false,

      // Actions
      addTab: (tabOverrides) => {
        const newTab = createDefaultTab({
          name: `Query ${get().tabs.length + 1}`,
          ...tabOverrides,
        });

        set((state) => ({
          tabs: [...state.tabs, newTab],
          activeTabId: newTab.id,
        }));

        return newTab.id;
      },

      removeTab: (tabId) => {
        set((state) => {
          const newTabs = state.tabs.filter((tab) => tab.id !== tabId);

          // If we're removing the active tab, select another one
          let newActiveTabId = state.activeTabId;
          if (state.activeTabId === tabId) {
            if (newTabs.length > 0) {
              // Try to select the next tab, or the previous one if it was the last
              const removedIndex = state.tabs.findIndex(
                (tab) => tab.id === tabId
              );
              const nextIndex = Math.min(removedIndex, newTabs.length - 1);
              newActiveTabId = newTabs[nextIndex]?.id || null;
            } else {
              newActiveTabId = null;
            }
          }

          return {
            tabs: newTabs,
            activeTabId: newActiveTabId,
          };
        });
      },

      updateTab: (tabId, updates) => {
        set((state) => ({
          tabs: state.tabs.map((tab) =>
            tab.id === tabId ? { ...tab, ...updates, saved: false } : tab
          ),
        }));
      },

      setActiveTab: (tabId) => {
        set({ activeTabId: tabId });
      },

      addToHistory: (item) => {
        set((state) => ({
          queryHistory: [
            item,
            ...state.queryHistory.slice(0, 49), // Keep last 50 queries
          ],
        }));
      },

      setResultView: (view) => set({ resultView: view }),

      clearHistory: () => set({ queryHistory: [] }),

      // New action methods
      setCurrentQuery: (query) => set({ currentQuery: query }),

      /**
       * Point the editor at the backend-appropriate sample query, but only while
       * the editor still holds one of the built-in defaults. A query the user
       * typed or pasted is left untouched.
       */
      setDefaultQueryForConnection: (connection) => {
        set((state) => {
          const isDefaultSample =
            state.currentQuery.trim() === DEFAULT_CYPHER_SAMPLE_QUERY ||
            state.currentQuery.trim() === DEFAULT_ADT_SAMPLE_QUERY ||
            state.currentQuery.trim() === "";
          if (!isDefaultSample) return {};
          return {
            currentQuery: isAdtBackend(connection)
              ? DEFAULT_ADT_SAMPLE_QUERY
              : DEFAULT_CYPHER_SAMPLE_QUERY,
          };
        });
      },

      clearQueryResults: () => set({ queryResults: null, queryError: null }),

      pruneDeletedTwins: (twinIds) => {
        const ids = new Set(twinIds);
        if (ids.size === 0) return;
        set((state) => ({
          queryResults: pruneDeletedFromResults(
            state.queryResults,
            ids,
            new Set<string>()
          ),
        }));
      },

      pruneDeletedRelationships: (relationshipIds) => {
        const ids = new Set(relationshipIds);
        if (ids.size === 0) return;
        set((state) => ({
          queryResults: pruneDeletedFromResults(
            state.queryResults,
            new Set<string>(),
            ids
          ),
        }));
      },

      executeQuery: async (
        query,
        getAccessTokenSilently,
        getAccessTokenWithPopup
      ) => {
        set({
          isExecuting: true,
          queryError: null,
          // New run: reset the outcome flags of the previous run
          lastRunCancelled: false,
        });
        const startTime = Date.now();

        // Collected rows live above the try so a thrown AbortError can still
        // hand back the partial page (issue #22).
        const results: any[] = [];

        // Abort handle for this run (issue #22). Stored on the store so any
        // component can cancel; cleared when the run settles.
        const abortController = new AbortController();
        set({ abortController });
        const isAborted = () => abortController.signal.aborted;
        // Drop the handle only if it is still ours — a newer run may have
        // replaced it by the time this one settles.
        const clearAbort = () => {
          if (get().abortController === abortController) {
            set({ abortController: undefined });
          }
        };

        try {
          // Get current connection
          const { getCurrentConnection } = useConnectionStore.getState();
          const connection = getCurrentConnection();

          if (!connection) {
            throw new Error(
              "No connection selected. Please select a connection."
            );
          }

          console.log(
            "Executing query for connection:",
            connection.id,
            connection.authProvider
          );

          // Get authenticated client with optional Auth0 context for KtrlPlane
          const client = await digitalTwinsClientFactory(
            connection,
            getAccessTokenSilently,
            getAccessTokenWithPopup
          );

          // Execute query using Azure SDK. The abort signal cancels any
          // in-flight request; the explicit check before each page keeps
          // cancellation responsive even between page fetches (issue #22).
          const queryResult = client.queryTwins(query, {
            abortSignal: abortController.signal,
          });

          // Iterate through paginated results
          for await (const item of queryResult) {
            if (isAborted()) break;
            // Format twin data for display if it has the structure of a digital twin
            const formattedItem =
              typeof item === "object" && item !== null && "$dtId" in item
                ? formatTwinForDisplay(item as any)
                : item;
            results.push(formattedItem);
          }

          const executionTime = Date.now() - startTime;

          if (isAborted()) {
            // User cancelled: distinct cancelled outcome, not the error UI.
            // Previous results stay on screen; the header shows "Cancelled".
            set({
              isExecuting: false,
              lastExecutionTime: executionTime,
              lastRunCancelled: true,
              // Whatever arrived before the cancel (may be [])
              queryResults: results,
            });
            clearAbort();

            // Add to history even when cancelled
            get().addToHistory({
              query,
              timestamp: Date.now(),
              executionTime,
              resultCount: results.length,
              cancelled: true,
            });
            return;
          }

          set({
            queryResults: results,
            isExecuting: false,
            lastExecutionTime: executionTime,
          });
          clearAbort();

          // Add to history
          get().addToHistory({
            query,
            timestamp: Date.now(),
            executionTime,
            resultCount: results.length,
          });
        } catch (error) {
          console.error("Error executing query:", error);
          const executionTime = Date.now() - startTime;

          // Cancelled runs surface as an AbortError (from the fetch pipeline)
          // or via the signal itself.
          const cancelled =
            isAborted() ||
            (error instanceof Error && error.name === "AbortError");

          if (cancelled) {
            set({
              isExecuting: false,
              lastExecutionTime: executionTime,
              lastRunCancelled: true,
              // Show whatever arrived before the cancel (may be []) instead
              // of dropping the user back to the "Query Failed" screen.
              queryResults: results,
            });
            clearAbort();

            get().addToHistory({
              query,
              timestamp: Date.now(),
              executionTime,
              resultCount: 0,
              cancelled: true,
            });
            return;
          }

          let errorMessage = "Unknown error occurred";
          if (error instanceof Error) {
            errorMessage = error.message;
          } else if (typeof error === "string") {
            errorMessage = error;
          } else if (typeof error === "object" && error !== null) {
            // Handle API error responses
            const apiError = error as any;
            if (apiError.statusCode) {
              errorMessage = `API Error ${apiError.statusCode}: ${
                apiError.message || "Unknown error"
              }`;
            } else if (apiError.message) {
              errorMessage = apiError.message;
            }
          }

          set({
            queryError: errorMessage,
            isExecuting: false,
            queryResults: null,
            lastExecutionTime: executionTime,
          });
          clearAbort();

          // Still add to history even on error
          get().addToHistory({
            query,
            timestamp: Date.now(),
            executionTime,
            resultCount: 0,
          });
        }
      },

      cancelQuery: () => {
        const { abortController } = get();
        if (abortController && !abortController.signal.aborted) {
          abortController.abort();
        }
      },

      setShowHistory: (show) => set({ showHistory: show }),
    }),
    {
      name: "konnektr-query",
      // Don't persist query history to avoid bloating localStorage
      partialize: (state) => ({
        tabs: state.tabs,
        activeTabId: state.activeTabId,
        resultView: state.resultView,
      }),
    }
  )
);

// Initialize active tab if none is set
useQueryStore.getState().activeTabId =
  useQueryStore.getState().activeTabId ||
  useQueryStore.getState().tabs[0]?.id ||
  null;
