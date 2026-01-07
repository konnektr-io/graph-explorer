import { useState, useMemo } from "react";
import { Check, ChevronsUpDown, ChevronRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useModelsStore } from "@/stores/modelsStore";
import { getModelDisplayName } from "@/utils/dtdlHelpers";
import type { DigitalTwinsModelDataExtended } from "@/types";

interface ModelSelectorProps {
  value: string;
  onChange: (modelId: string) => void;
  disabled?: boolean;
}

interface ModelTreeNode {
  id: string;
  name: string;
  children?: ModelTreeNode[];
  depth: number;
  isExpanded?: boolean;
}

/**
 * Build a simplified tree structure from models based on 'extends' relationships
 */
function buildModelTree(
  models: DigitalTwinsModelDataExtended[]
): ModelTreeNode[] {
  if (models.length === 0) return [];

  const modelMap = new Map<string, DigitalTwinsModelDataExtended>();
  const childrenMap = new Map<string, Set<string>>();

  // Build maps
  models.forEach((model) => {
    modelMap.set(model.id, model);
  });

  // Build parent-child relationships
  models.forEach((model) => {
    const extendsValue = model.model?.extends;
    if (!extendsValue) return;

    const extendsList = Array.isArray(extendsValue)
      ? extendsValue
      : [extendsValue];

    extendsList.forEach((ext) => {
      const parentId = typeof ext === "string" ? ext : ext?.["@id"];
      if (parentId && modelMap.has(parentId)) {
        if (!childrenMap.has(parentId)) {
          childrenMap.set(parentId, new Set());
        }
        childrenMap.get(parentId)!.add(model.id);
      }
    });
  });

  // Find root models
  const rootModels = models.filter((model) => {
    const extendsValue = model.model?.extends;
    if (!extendsValue) return true;

    const extendsList = Array.isArray(extendsValue)
      ? extendsValue
      : [extendsValue];

    const hasParentInList = extendsList.some((ext) => {
      const parentId = typeof ext === "string" ? ext : ext?.["@id"];
      return parentId && modelMap.has(parentId);
    });

    return !hasParentInList;
  });

  // Recursive function to build tree nodes
  function buildNode(
    model: DigitalTwinsModelDataExtended,
    depth: number = 0
  ): ModelTreeNode {
    const modelId = model.id;
    const displayName = getModelDisplayName(modelId);

    const childIds = childrenMap.get(modelId);
    const children =
      childIds && childIds.size > 0
        ? Array.from(childIds)
            .map((childId) => modelMap.get(childId))
            .filter((m): m is DigitalTwinsModelDataExtended => m !== undefined)
            .map((childModel) => buildNode(childModel, depth + 1))
        : undefined;

    return {
      id: modelId,
      name: displayName,
      children,
      depth,
    };
  }

  return rootModels.map((model) => buildNode(model, 0));
}

export function ModelSelector({
  value,
  onChange,
  disabled,
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const models = useModelsStore((state) => state.models);

  // Build tree structure
  const modelTree = useMemo(() => buildModelTree(models), [models]);

  // Find current model display name
  const currentModelName = useMemo(() => {
    return getModelDisplayName(value);
  }, [value]);

  // Filter tree by search query
  const filterTree = (
    nodes: ModelTreeNode[],
    query: string
  ): ModelTreeNode[] => {
    if (!query) return nodes;

    const lowerQuery = query.toLowerCase();
    const filtered: ModelTreeNode[] = [];

    for (const node of nodes) {
      const matchesName = node.name.toLowerCase().includes(lowerQuery);
      const matchesId = node.id.toLowerCase().includes(lowerQuery);
      const filteredChildren = node.children
        ? filterTree(node.children, query)
        : undefined;

      if (
        matchesName ||
        matchesId ||
        (filteredChildren && filteredChildren.length > 0)
      ) {
        filtered.push({
          ...node,
          children: filteredChildren,
        });
      }
    }

    return filtered;
  };

  const filteredTree = useMemo(
    () => filterTree(modelTree, searchQuery),
    [modelTree, searchQuery]
  );

  const toggleExpanded = (nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const renderTreeNode = (node: ModelTreeNode) => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedNodes.has(node.id);
    const isSelected = value === node.id;

    return (
      <div key={node.id}>
        <div
          className={cn(
            "flex items-center gap-1 px-2 py-1.5 text-xs cursor-pointer rounded-sm",
            isSelected
              ? "bg-muted/70 text-foreground"
              : "bg-muted/40 text-foreground hover:bg-muted/60",
            "transition-colors"
          )}
          style={{ paddingLeft: `${node.depth * 12 + 8}px` }}
          onClick={() => {
            onChange(node.id);
            setOpen(false);
          }}
        >
          {hasChildren ? (
            <button
              className="p-0 h-4 w-4 flex items-center justify-center hover:bg-muted rounded"
              onClick={(e) => {
                e.stopPropagation();
                toggleExpanded(node.id);
              }}
            >
              {isExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </button>
          ) : (
            <span className="w-4" />
          )}
          <Check
            className={cn(
              "h-4 w-4 shrink-0",
              isSelected ? "opacity-100" : "opacity-0"
            )}
          />
          <span className="truncate flex-1 text-foreground">{node.name}</span>
        </div>
        {hasChildren && isExpanded && (
          <div>{node.children!.map((child) => renderTreeNode(child))}</div>
        )}
      </div>
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between text-xs h-8"
          disabled={disabled}
        >
          <span className="truncate">{currentModelName}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-2" align="start">
        <div className="space-y-2">
          <Input
            placeholder="Search models..."
            className="h-8 text-xs"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <ScrollArea className="h-[300px]">
            {filteredTree.length > 0 ? (
              <div className="space-y-0.5">
                {filteredTree.map((node) => renderTreeNode(node))}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground text-center py-4">
                No models found.
              </div>
            )}
          </ScrollArea>
        </div>
      </PopoverContent>
    </Popover>
  );
}
