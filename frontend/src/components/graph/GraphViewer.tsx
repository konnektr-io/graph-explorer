import { useEffect, useRef, useState, useCallback } from "react";
import Graph from "graphology";
import Sigma from "sigma";
import type { BasicDigitalTwin, BasicRelationship } from "@/types";
import { useDigitalTwinsStore } from "@/stores/digitalTwinsStore";
import { Button } from "@/components/ui/button";
import { RotateCcw, Network } from "lucide-react";
import { useAuth0 } from "@auth0/auth0-react";
import forceAtlas2 from "graphology-layout-forceatlas2";
import circular from "graphology-layout/circular";
import random from "graphology-layout/random";
import noverlap from "graphology-layout-noverlap";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface GraphViewerProps {
  twins: BasicDigitalTwin[];
  relationships: BasicRelationship[];
  onNodeClick?: (twinId: string) => void;
  autoFetchRelationships?: boolean; // Option to auto-fetch relationships between twins
}

type LayoutType = "circular" | "force" | "random";

const LAYOUT_OPTIONS = [
  { value: "circular" as const, label: "Circular" },
  { value: "force" as const, label: "Force-Directed" },
  { value: "random" as const, label: "Random" },
] as const;

// Generate color from string hash using brand palette
const generateColorFromString = (str: string): string => {
  // Brand colors from theme (teal and blue variants)
  const brandColors = [
    "oklch(0.55 0.12 180)", // teal
    "oklch(0.65 0.12 180)", // lighter teal
    "oklch(0.45 0.12 180)", // darker teal
    "oklch(0.35 0.08 240)", // blue
    "oklch(0.55 0.08 240)", // lighter blue
    "oklch(0.45 0.08 240)", // medium blue
    "oklch(0.6 0.118 184.704)", // chart-2
    "oklch(0.398 0.07 227.392)", // chart-3
    "oklch(0.828 0.189 84.429)", // chart-4
    "oklch(0.646 0.222 41.116)", // chart-1
  ];

  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }

  const index = Math.abs(hash) % brandColors.length;
  return brandColors[index];
};

// Get a meaningful label from twin properties
const getTwinLabel = (twin: BasicDigitalTwin): string => {
  // Priority: name > displayName > tag > label > $dtId
  const labelProps = [
    "name",
    "displayName",
    "tag",
    "label",
    "Name",
    "DisplayName",
    "Tag",
    "Label",
  ];

  for (const prop of labelProps) {
    if (twin[prop] && typeof twin[prop] === "string") {
      return twin[prop] as string;
    }
  }

  // Fallback to ID
  return twin.$dtId;
};

export function GraphViewer({
  twins,
  relationships,
  onNodeClick,
  autoFetchRelationships = true,
}: GraphViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const graphRef = useRef<Graph | null>(null);
  const [isLoadingRelationships, setIsLoadingRelationships] = useState(false);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [layoutType, setLayoutType] = useState<LayoutType>("force");

  const { queryRelationships } = useDigitalTwinsStore();
  const { getAccessTokenSilently, getAccessTokenWithPopup } = useAuth0();

  // Auto-fetch relationships between loaded twins
  useEffect(() => {
    if (!autoFetchRelationships || twins.length === 0 || isLoadingRelationships)
      return;

    const fetchRelationships = async () => {
      setIsLoadingRelationships(true);
      try {
        const twinIds = new Set(twins.map((t) => t.$dtId));
        const allRelationships = new Set<string>();

        // Fetch relationships for each twin
        for (const twin of twins) {
          try {
            const rels = await queryRelationships(twin.$dtId, "all", {
              getAccessTokenSilently,
              getAccessTokenWithPopup,
            });

            // Only keep relationships where both source and target are in our twin set
            rels.forEach((rel) => {
              if (twinIds.has(rel.$sourceId) && twinIds.has(rel.$targetId)) {
                allRelationships.add(JSON.stringify(rel));
              }
            });
          } catch (err) {
            console.warn(
              `Failed to fetch relationships for ${twin.$dtId}:`,
              err
            );
          }
        }

        // Convert back to objects and update graph
        const relationshipsArray = Array.from(allRelationships).map((s) =>
          JSON.parse(s)
        );

        if (relationshipsArray.length > 0 && graphRef.current) {
          // Add relationships to existing graph
          relationshipsArray.forEach((rel) => {
            if (
              graphRef.current?.hasNode(rel.$sourceId) &&
              graphRef.current?.hasNode(rel.$targetId) &&
              !graphRef.current?.hasEdge(rel.$relationshipId)
            ) {
              try {
                graphRef.current.addEdgeWithKey(
                  rel.$relationshipId,
                  rel.$sourceId,
                  rel.$targetId,
                  {
                    label: rel.$relationshipName || "relationship",
                    color: "#666",
                    size: 2,
                    relationship: rel,
                  }
                );
              } catch (err) {
                console.warn("Could not add edge:", err);
              }
            }
          });

          sigmaRef.current?.refresh();
        }
      } catch (error) {
        console.error("Error fetching relationships:", error);
      } finally {
        setIsLoadingRelationships(false);
      }
    };

    // Only fetch if we have twins but no relationships
    if (relationships.length === 0) {
      fetchRelationships();
    }
  }, [
    twins,
    relationships,
    autoFetchRelationships,
    queryRelationships,
    getAccessTokenSilently,
    getAccessTokenWithPopup,
  ]);

  // Handle double-click to expand node
  const handleNodeDoubleClick = useCallback(
    async (nodeId: string) => {
      if (expandedNodes.has(nodeId) || !graphRef.current) return;

      setExpandedNodes((prev) => new Set(prev).add(nodeId));

      try {
        // Fetch all relationships for this node
        const rels = await queryRelationships(nodeId, "all", {
          getAccessTokenSilently,
          getAccessTokenWithPopup,
        });

        // Fetch the actual twin data for connected nodes
        const { getTwinById } = useDigitalTwinsStore.getState();
        const connectedTwinIds = new Set<string>();

        rels.forEach((rel) => {
          if (rel.$sourceId !== nodeId) connectedTwinIds.add(rel.$sourceId);
          if (rel.$targetId !== nodeId) connectedTwinIds.add(rel.$targetId);
        });

        // Add new nodes and edges to graph
        for (const twinId of connectedTwinIds) {
          if (!graphRef.current.hasNode(twinId)) {
            try {
              const twin = await getTwinById(twinId, {
                getAccessTokenSilently,
                getAccessTokenWithPopup,
              });

              const modelType = twin.$metadata?.$model || "Unknown";
              graphRef.current.addNode(twinId, {
                x: Math.random() * 100,
                y: Math.random() * 100,
                size: 10,
                label: getTwinLabel(twin),
                color: generateColorFromString(modelType),
                modelType,
                twin,
              });
            } catch (err) {
              console.warn(`Failed to fetch twin ${twinId}:`, err);
            }
          }
        }

        // Add relationships
        rels.forEach((rel) => {
          if (
            graphRef.current?.hasNode(rel.$sourceId) &&
            graphRef.current?.hasNode(rel.$targetId) &&
            !graphRef.current?.hasEdge(rel.$relationshipId)
          ) {
            try {
              graphRef.current.addEdgeWithKey(
                rel.$relationshipId,
                rel.$sourceId,
                rel.$targetId,
                {
                  label: rel.$relationshipName || "relationship",
                  color: "#666",
                  size: 2,
                  relationship: rel,
                }
              );
            } catch (err) {
              console.warn("Could not add edge:", err);
            }
          }
        });

        sigmaRef.current?.refresh();
      } catch (error) {
        console.error("Error expanding node:", error);
      }
    },
    [
      expandedNodes,
      queryRelationships,
      getAccessTokenSilently,
      getAccessTokenWithPopup,
    ]
  );

  // Apply layout algorithm
  const applyLayout = useCallback((type: LayoutType) => {
    if (!graphRef.current || !containerRef.current) return;

    const graph = graphRef.current;
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    switch (type) {
      case "circular": {
        circular.assign(graph, { scale: Math.min(width, height) * 0.35 });
        // Center the graph
        graph.forEachNode((node) => {
          const x = graph.getNodeAttribute(node, "x");
          const y = graph.getNodeAttribute(node, "y");
          graph.setNodeAttribute(node, "x", x + width / 2);
          graph.setNodeAttribute(node, "y", y + height / 2);
        });
        break;
      }
      case "force": {
        // Apply ForceAtlas2 layout
        const settings = forceAtlas2.inferSettings(graph);
        forceAtlas2.assign(graph, {
          iterations: 50,
          settings: {
            ...settings,
            gravity: 1,
            scalingRatio: 10,
          },
        });

        // Apply noverlap to prevent node overlap
        noverlap.assign(graph, 50);

        // Scale and center
        const bounds = {
          minX: Infinity,
          maxX: -Infinity,
          minY: Infinity,
          maxY: -Infinity,
        };
        graph.forEachNode((node) => {
          const x = graph.getNodeAttribute(node, "x");
          const y = graph.getNodeAttribute(node, "y");
          bounds.minX = Math.min(bounds.minX, x);
          bounds.maxX = Math.max(bounds.maxX, x);
          bounds.minY = Math.min(bounds.minY, y);
          bounds.maxY = Math.max(bounds.maxY, y);
        });

        const graphWidth = bounds.maxX - bounds.minX || 1;
        const graphHeight = bounds.maxY - bounds.minY || 1;
        const scale = Math.min(width / graphWidth, height / graphHeight) * 0.8;

        graph.forEachNode((node) => {
          const x = graph.getNodeAttribute(node, "x");
          const y = graph.getNodeAttribute(node, "y");
          graph.setNodeAttribute(
            node,
            "x",
            (x - bounds.minX) * scale + width * 0.1
          );
          graph.setNodeAttribute(
            node,
            "y",
            (y - bounds.minY) * scale + height * 0.1
          );
        });
        break;
      }
      case "random": {
        random.assign(graph, { scale: Math.min(width, height) * 0.4 });
        // Center the graph
        graph.forEachNode((node) => {
          const x = graph.getNodeAttribute(node, "x");
          const y = graph.getNodeAttribute(node, "y");
          graph.setNodeAttribute(node, "x", x + width / 2);
          graph.setNodeAttribute(node, "y", y + height / 2);
        });
        break;
      }
    }

    sigmaRef.current?.refresh();
  }, []);

  // Reset layout using current layout type
  const resetLayout = useCallback(() => {
    applyLayout(layoutType);
  }, [layoutType, applyLayout]);

  useEffect(() => {
    if (!containerRef.current) return;

    // Reset expanded nodes when data changes
    setExpandedNodes(new Set());

    // Create a new graph
    const graph = new Graph();
    graphRef.current = graph;

    // Add nodes (digital twins)
    twins.forEach((twin) => {
      const modelType = twin.$metadata?.$model || "Unknown";
      graph.addNode(twin.$dtId, {
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: 10,
        label: getTwinLabel(twin),
        color: generateColorFromString(modelType),
        modelType,
        twin,
      });
    });

    // Add edges (relationships)
    relationships.forEach((rel) => {
      if (graph.hasNode(rel.$sourceId) && graph.hasNode(rel.$targetId)) {
        try {
          graph.addEdgeWithKey(
            rel.$relationshipId,
            rel.$sourceId,
            rel.$targetId,
            {
              label: rel.$relationshipName || "relationship",
              color: "#666",
              size: 2,
              relationship: rel,
            }
          );
        } catch (error) {
          // Edge might already exist, skip
          console.warn("Could not add edge:", error);
        }
      }
    });

    // Create Sigma instance with dragging enabled
    const sigma = new Sigma(graph, containerRef.current, {
      renderEdgeLabels: true,
      enableEdgeEvents: true,
      nodeReducer: (_node, data) => ({
        ...data,
        size: data.size || 10,
        color: data.color || "#999",
      }),
      edgeReducer: (_edge, data) => ({
        ...data,
        color: data.color || "#ccc",
        size: data.size || 1,
      }),
    });

    sigmaRef.current = sigma;

    // Add single click handler
    sigma.on("clickNode", ({ node }) => {
      const nodeData = graph.getNodeAttributes(node);
      if (onNodeClick && nodeData.twin) {
        onNodeClick(nodeData.twin.$dtId);
      }
    });

    // Add double-click handler for expansion
    sigma.on("doubleClickNode", ({ node }) => {
      handleNodeDoubleClick(node);
    });

    // Enable node dragging
    let draggedNode: string | null = null;
    let isDragging = false;

    sigma.on("downNode", (e) => {
      isDragging = true;
      draggedNode = e.node;
      graph.setNodeAttribute(draggedNode, "highlighted", true);
    });

    sigma.getMouseCaptor().on("mousemovebody", (e) => {
      if (!isDragging || !draggedNode) return;

      // Get new position of node
      const pos = sigma.viewportToGraph(e);
      graph.setNodeAttribute(draggedNode, "x", pos.x);
      graph.setNodeAttribute(draggedNode, "y", pos.y);

      // Prevent sigma from moving the graph
      e.preventSigmaDefault();
      e.original.preventDefault();
      e.original.stopPropagation();
    });

    sigma.getMouseCaptor().on("mouseup", () => {
      if (draggedNode) {
        graph.removeNodeAttribute(draggedNode, "highlighted");
        draggedNode = null;
      }
      isDragging = false;
    });

    // Apply initial layout
    if (twins.length > 0) {
      applyLayout(layoutType);
    }

    // Cleanup function
    return () => {
      if (sigmaRef.current) {
        sigmaRef.current.kill();
        sigmaRef.current = null;
      }
      graphRef.current = null;
    };
  }, [
    twins,
    relationships,
    onNodeClick,
    handleNodeDoubleClick,
    layoutType,
    applyLayout,
  ]);

  return (
    <div className="relative w-full h-full">
      <div
        ref={containerRef}
        className="w-full h-full min-h-[400px] bg-background border rounded"
        style={{ position: "relative" }}
      />

      {/* Control buttons */}
      <div className="absolute top-4 right-4 flex gap-2">
        <Select
          value={layoutType}
          onValueChange={(value) => {
            setLayoutType(value as LayoutType);
            applyLayout(value as LayoutType);
          }}
        >
          <SelectTrigger className="w-[180px] h-8 text-sm">
            <Network className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LAYOUT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="secondary"
          size="sm"
          onClick={resetLayout}
          title="Reset and reapply current layout"
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          Reset
        </Button>
      </div>

      {/* Loading indicator */}
      {isLoadingRelationships && (
        <div className="absolute bottom-4 left-4 bg-muted px-3 py-2 rounded-md text-sm text-muted-foreground">
          Loading relationships...
        </div>
      )}

      {/* Instructions */}
      <div className="absolute bottom-4 right-4 bg-muted/90 px-3 py-2 rounded-md text-xs text-muted-foreground max-w-xs">
        <p className="font-semibold mb-1">Graph Controls:</p>
        <ul className="space-y-0.5">
          <li>• Click: Select node</li>
          <li>• Double-click: Expand connections</li>
          <li>• Drag: Move nodes</li>
          <li>• Scroll: Zoom in/out</li>
        </ul>
      </div>
    </div>
  );
}
