import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import Graph from "graphology";
import Sigma from "sigma";
import type { BasicDigitalTwin, BasicRelationship } from "@/types";
import { useDigitalTwinsStore } from "@/stores/digitalTwinsStore";
import { useConnectionStore } from "@/stores/connectionStore";
import { digitalTwinsClientFactory } from "@/services/digitalTwinsClientFactory";
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
  // Brand colors from theme (teal and blue variants) - hex for better compatibility
  const brandColors = [
    "#1E9E95", // teal
    "#4DB8AF", // lighter teal
    "#157A72", // darker teal
    "#2D4263", // blue
    "#4A6FA5", // lighter blue
    "#354B6E", // medium blue
    "#3498DB", // chart blue
    "#2E5C8A", // chart dark blue
    "#F39C12", // chart orange
    "#E67E22", // chart red-orange
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
  const [hasManuallyPositionedNodes, setHasManuallyPositionedNodes] =
    useState(false);
  const hasFetchedRelationshipsRef = useRef(false);

  const { queryRelationships } = useDigitalTwinsStore();
  const { getAccessTokenSilently, getAccessTokenWithPopup } = useAuth0();

  // Create stable dependency that only changes when twin IDs actually change
  const twinIds = useMemo(() => {
    return twins
      .map((t) => t.$dtId)
      .sort()
      .join(",");
  }, [twins]);

  // Auto-fetch relationships between loaded twins
  useEffect(() => {
    if (!autoFetchRelationships || twins.length === 0 || isLoadingRelationships)
      return;

    // Only fetch once per twins load
    if (hasFetchedRelationshipsRef.current) return;

    const fetchRelationships = async () => {
      setIsLoadingRelationships(true);
      try {
        const twinIds = new Set(twins.map((t) => t.$dtId));
        const twinIdArray = Array.from(twinIds);

        // Build IN clause for efficient single query
        const inClause = twinIdArray.map((id) => `'${id}'`).join(", ");
        const query = `SELECT * FROM RELATIONSHIPS WHERE $sourceId IN [${inClause}] OR $targetId IN [${inClause}]`;

        try {
          const { getCurrentConnection } = useConnectionStore.getState();
          const connection = getCurrentConnection();
          if (!connection) return;

          const client = await digitalTwinsClientFactory(
            connection,
            getAccessTokenSilently,
            getAccessTokenWithPopup
          );

          const result = client.queryTwins(query);
          const allRelationships: BasicRelationship[] = [];

          for await (const item of result) {
            // Check if it's a relationship and both endpoints are in our twin set
            if (
              item.$relationshipId &&
              typeof item.$sourceId === "string" &&
              twinIds.has(item.$sourceId) &&
              typeof item.$targetId === "string" &&
              twinIds.has(item.$targetId)
            ) {
              allRelationships.push(item as BasicRelationship);
            }
          }

          if (allRelationships.length > 0 && graphRef.current) {
            // Add relationships to existing graph
            allRelationships.forEach((rel) => {
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

          hasFetchedRelationshipsRef.current = true;
        } catch (err) {
          console.warn("Failed to fetch relationships:", err);
        }
      } catch (error) {
        console.error("Error fetching relationships:", error);
      } finally {
        setIsLoadingRelationships(false);
      }
    };

    // Only fetch if we don't have relationships already
    if (relationships.length === 0) {
      fetchRelationships();
    } else {
      hasFetchedRelationshipsRef.current = true;
    }
  }, [
    twins,
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

  // Reset layout using current layout type
  const resetLayout = useCallback(() => {
    if (!graphRef.current || !containerRef.current) return;

    setHasManuallyPositionedNodes(false);
    const graph = graphRef.current;
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    switch (layoutType) {
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
  }, [layoutType]);

  // Apply layout when layout type changes (without recreating the graph)
  useEffect(() => {
    if (!hasManuallyPositionedNodes && graphRef.current && sigmaRef.current) {
      resetLayout();
    }
  }, [layoutType, hasManuallyPositionedNodes, resetLayout]);

  useEffect(() => {
    if (!containerRef.current) return;

    // Reset expanded nodes when data changes
    setExpandedNodes(new Set());
    hasFetchedRelationshipsRef.current = false;

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
        setHasManuallyPositionedNodes(true);
        draggedNode = null;
      }
      isDragging = false;
    });

    // Apply initial layout when graph is created
    if (twins.length > 0 && containerRef.current) {
      setHasManuallyPositionedNodes(false);
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;

      switch (layoutType) {
        case "circular": {
          circular.assign(graph, { scale: Math.min(width, height) * 0.35 });
          graph.forEachNode((node) => {
            const x = graph.getNodeAttribute(node, "x");
            const y = graph.getNodeAttribute(node, "y");
            graph.setNodeAttribute(node, "x", x + width / 2);
            graph.setNodeAttribute(node, "y", y + height / 2);
          });
          break;
        }
        case "force": {
          const settings = forceAtlas2.inferSettings(graph);
          forceAtlas2.assign(graph, {
            iterations: 50,
            settings: { ...settings, gravity: 1, scalingRatio: 10 },
          });
          noverlap.assign(graph, 50);

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
          const scale =
            Math.min(width / graphWidth, height / graphHeight) * 0.8;

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
          graph.forEachNode((node) => {
            const x = graph.getNodeAttribute(node, "x");
            const y = graph.getNodeAttribute(node, "y");
            graph.setNodeAttribute(node, "x", x + width / 2);
            graph.setNodeAttribute(node, "y", y + height / 2);
          });
          break;
        }
      }

      sigma.refresh();
    }

    // Cleanup function
    return () => {
      if (sigmaRef.current) {
        sigmaRef.current.kill();
        sigmaRef.current = null;
      }
      graphRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [twinIds, layoutType]);

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
          onValueChange={(value) => setLayoutType(value as LayoutType)}
        >
          <SelectTrigger className="w-[180px] h-8 text-sm bg-background border-border">
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
