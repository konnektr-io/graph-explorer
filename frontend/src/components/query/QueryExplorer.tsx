import { useEffect, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { MonacoEditor } from "@/components/query/MonacoEditor";
import { QueryResults } from "@/components/query/QueryResults";
import { QueryHistory } from "@/components/query/QueryHistory";
import { Button } from "@/components/ui/button";
import { Play, History, Square, Loader2 } from "lucide-react";
import { useQueryStore } from "@/stores/queryStore";
import { useAuth } from "@/services/auth/authContext";
import { formatDuration } from "@/utils/formatDuration";

/**
 * Live elapsed-time counter for a running query (issue #22). Mounted exactly
 * when a run starts, so its local clock starts with the run.
 */
function ElapsedTicker() {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const timer = setInterval(
      () => setElapsed(Date.now() - startedAt),
      100
    );
    return () => clearInterval(timer);
  }, []);

  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
      <Loader2 className="w-3 h-3 animate-spin" />
      Running… {formatDuration(elapsed)}
    </span>
  );
}

export function QueryExplorer() {
  const {
    currentQuery,
    setCurrentQuery,
    isExecuting,
    executeQuery,
    cancelQuery,
    queryResults,
    queryError,
    lastExecutionTime,
    lastRunCancelled,
    showHistory,
    setShowHistory,
  } = useQueryStore();

  const { getAccessTokenSilently, getAccessTokenWithPopup } = useAuth();

  const [verticalSizes, setVerticalSizes] = useState([60, 40]);
  const editorRef = useRef<any>(null);

  // Wrapper to match expected signature
  const getTokenWithPopup = async (options?: {
    authorizationParams?: { audience?: string; scope?: string };
  }) => {
    const token = await getAccessTokenWithPopup(options);
    if (!token) throw new Error("Failed to get token with popup");
    return token;
  };

  const handleRunQuery = async () => {
    if (!currentQuery.trim()) return;
    await executeQuery(currentQuery, getAccessTokenSilently, getTokenWithPopup);
  };

  const handleCancelQuery = () => {
    cancelQuery();
  };

  /* const handleSaveQuery = () => {
    // TODO: Implement save query functionality
    console.log("Save query:", currentQuery);
  }; */

  /* const handleFormatQuery = () => {
    if (editorRef.current) {
      editorRef.current.getAction("editor.action.formatDocument").run();
    }
  }; */

  return (
    <div className="flex flex-col h-full w-full bg-background">
      {/* Query Toolbar */}
      <div className="flex items-center justify-between p-3 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          {isExecuting ? (
            <Button
              size="sm"
              variant="destructive"
              onClick={handleCancelQuery}
              className="gap-2"
              title="Cancel the running query"
            >
              <Square className="w-4 h-4 fill-current" />
              Cancel
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handleRunQuery}
              disabled={!currentQuery.trim()}
              className="gap-2"
            >
              <Play className="w-4 h-4" />
              Run Query
            </Button>
          )}

          {isExecuting && <ElapsedTicker />}

          {/* <Button
            variant="outline"
            size="sm"
            onClick={handleSaveQuery}
            disabled={!currentQuery.trim()}
            className="gap-2"
          >
            <Save className="w-4 h-4" />
            Save
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleFormatQuery}
            className="gap-2"
          >
            <Settings2 className="w-4 h-4" />
            Format
          </Button> */}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={showHistory ? "default" : "outline"}
            size="sm"
            onClick={() => setShowHistory(!showHistory)}
            className="gap-2"
          >
            <History className="w-4 h-4" />
            History
          </Button>
        </div>
      </div>

      {/* Query Interface */}
      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal" className="h-full">
          {/* Main Query Area */}
          <Panel defaultSize={showHistory ? 75 : 100} minSize={50}>
            <PanelGroup direction="vertical" onLayout={setVerticalSizes}>
              {/* Editor Panel */}
              <Panel
                defaultSize={verticalSizes[0]}
                minSize={30}
                className="flex flex-col"
              >
                <div className="flex-1 border-b border-border">
                  <MonacoEditor
                    ref={editorRef}
                    value={currentQuery}
                    onChange={(value) => setCurrentQuery(value || "")}
                    language="cypher"
                    theme="vs-dark"
                    options={{
                      minimap: { enabled: false },
                      fontSize: 14,
                      wordWrap: "on",
                      automaticLayout: true,
                      scrollBeyondLastLine: false,
                      renderLineHighlight: "line",
                      selectOnLineNumbers: true,
                      matchBrackets: "always",
                      folding: true,
                      foldingHighlight: true,
                      showFoldingControls: "always",
                    }}
                  />
                </div>
              </Panel>

              <PanelResizeHandle className="h-1 bg-border hover:bg-border/80 transition-colors data-[resize-handle-active]:bg-primary" />

              {/* Results Panel */}
              <Panel
                defaultSize={verticalSizes[1]}
                minSize={20}
                className="flex flex-col"
              >
                <QueryResults
                  results={queryResults}
                  error={queryError}
                  isLoading={isExecuting}
                  executionTimeMs={lastExecutionTime}
                  cancelled={lastRunCancelled}
                />
              </Panel>
            </PanelGroup>
          </Panel>

          {/* Query History Sidebar */}
          {showHistory && (
            <>
              <PanelResizeHandle className="w-1 bg-border hover:bg-border/80 transition-colors data-[resize-handle-active]:bg-primary" />
              <Panel defaultSize={25} minSize={20} maxSize={40}>
                <QueryHistory />
              </Panel>
            </>
          )}
        </PanelGroup>
      </div>
    </div>
  );
}
