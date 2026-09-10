import { useMemo, useState, type ReactNode } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { Connection } from "@/stores/connectionStore";
import { ENVIRONMENT_TYPE_LABELS } from "@/services/environmentsClient";
import { orderConnections } from "@/utils/connectionList";

interface ConnectionSelectProps {
  /** Id of the currently selected connection (any source), or `null`. */
  value: string | null;
  onValueChange: (id: string) => void;
  ktrlPlaneConnections: Connection[];
  environmentConnections: Connection[];
  localConnections: Connection[];
  /** Deployment-specific group label for the environment connections. */
  environmentsLabel: string;
}

/** Status pill colours for the KtrlPlane group (unknown states fall back to red). */
const KTRLPLANE_STATUS_CLASSES: Record<string, string> = {
  Healthy: "bg-green-100 text-green-800",
  Progressing: "bg-blue-100 text-blue-800",
};

/** Backend-kind pill colours for the environment group. */
const ENVIRONMENT_TYPE_CLASSES: Record<string, string> = {
  azure: "bg-blue-100 text-blue-800",
  arcadis: "bg-orange-100 text-orange-800",
  cluster: "bg-emerald-100 text-emerald-800",
  konnektr: "bg-slate-100 text-slate-800",
};

const isDemoConnection = (conn: Connection): boolean =>
  conn.authProvider === "none" &&
  (conn.name?.toLowerCase().includes("demo") ||
    conn.adtHost === "demo.api.graph.konnektr.io");

/**
 * Searchable connection dropdown.
 *
 * Replaces the plain Radix `Select` used before: that primitive has no search
 * affordance, so on deployments with many environments finding the right one
 * meant scrolling. This mirrors the committed `ModelSelector` pattern
 * (Popover + filter `Input` + `ScrollArea`) and adds the ordering/filtering
 * from {@link orderConnections} — every group is sorted alphabetically and the
 * filter narrows all three groups at once.
 *
 * Rendering semantics of the previous `Select` are preserved: the same three
 * groups, the same health/type badges and the same disabled state for
 * unhealthy backends.
 */
export function ConnectionSelect({
  value,
  onValueChange,
  ktrlPlaneConnections,
  environmentConnections,
  localConnections,
  environmentsLabel,
}: ConnectionSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const allConnections = useMemo(
    () => [
      ...ktrlPlaneConnections,
      ...environmentConnections,
      ...localConnections,
    ],
    [ktrlPlaneConnections, environmentConnections, localConnections]
  );

  const selectedConnection = allConnections.find((conn) => conn.id === value);

  const ktrlPlaneItems = useMemo(
    () => orderConnections(ktrlPlaneConnections, query),
    [ktrlPlaneConnections, query]
  );
  const environmentItems = useMemo(
    () => orderConnections(environmentConnections, query),
    [environmentConnections, query]
  );
  const localItems = useMemo(
    () => orderConnections(localConnections, query),
    [localConnections, query]
  );

  const visibleCount =
    ktrlPlaneItems.length + environmentItems.length + localItems.length;

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    // A filter is only meaningful while the popover is open — reset it on close
    // so reopening always shows the full list again.
    if (!nextOpen) setQuery("");
  };

  const handleSelect = (id: string) => {
    onValueChange(id);
    handleOpenChange(false);
  };

  const renderItem = (
    conn: Connection,
    badge?: ReactNode,
    disabled = false
  ) => {
    const isSelected = conn.id === value;

    return (
      <button
        key={conn.id}
        type="button"
        role="option"
        aria-selected={isSelected}
        disabled={disabled}
        data-connection-id={conn.id}
        onClick={() => handleSelect(conn.id)}
        className={cn(
          "relative flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-hidden select-none",
          "hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground",
          disabled && "pointer-events-none opacity-50"
        )}
      >
        <Check
          className={cn(
            "size-4 shrink-0",
            isSelected ? "opacity-100" : "opacity-0"
          )}
        />
        <span className="truncate font-medium">{conn.name}</span>
        {badge}
      </button>
    );
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Select connection"
          data-testid="connection-select-trigger"
          className="min-w-[180px] justify-between"
        >
          <span className="truncate">
            {selectedConnection
              ? selectedConnection.name
              : "Select connection..."}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[320px] p-2">
        <div className="space-y-2">
          <Input
            placeholder="Filter connections..."
            aria-label="Filter connections"
            data-testid="connection-select-filter"
            className="h-8 text-sm"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <ScrollArea className="max-h-[300px]">
            {visibleCount === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                {query
                  ? "No connections match your filter."
                  : "No connections available."}
              </div>
            ) : (
              <div role="listbox" className="space-y-1">
                {ktrlPlaneItems.length > 0 && (
                  <div>
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                      Konnektr Managed
                    </div>
                    {ktrlPlaneItems.map((conn) => {
                      const isHealthy = conn.status === "Healthy";
                      return renderItem(
                        conn,
                        <>
                          {conn.id && (
                            <span className="truncate text-xs text-muted-foreground">
                              {conn.id}
                            </span>
                          )}
                          <span
                            className={cn(
                              "ml-auto rounded px-2 py-0.5 text-xs font-semibold",
                              KTRLPLANE_STATUS_CLASSES[conn.status ?? ""] ??
                                "bg-red-100 text-red-800"
                            )}
                            title={conn.status}
                          >
                            {conn.status}
                          </span>
                        </>,
                        !isHealthy
                      );
                    })}
                  </div>
                )}
                {environmentItems.length > 0 && (
                  <div>
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                      {environmentsLabel}
                    </div>
                    {environmentItems.map((conn) => {
                      const isHealthy = conn.status !== "Unhealthy";
                      const type = conn.environmentType ?? "custom";
                      return renderItem(
                        conn,
                        <span
                          className={cn(
                            "rounded px-2 py-0.5 text-xs font-semibold",
                            ENVIRONMENT_TYPE_CLASSES[type] ??
                              "bg-gray-100 text-gray-800"
                          )}
                        >
                          {ENVIRONMENT_TYPE_LABELS[type]}
                        </span>,
                        !isHealthy
                      );
                    })}
                  </div>
                )}
                {localItems.length > 0 && (
                  <div>
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                      {ktrlPlaneConnections.length > 0
                        ? "Custom Connections"
                        : "Connections"}
                    </div>
                    {localItems.map((conn) =>
                      renderItem(
                        conn,
                        <>
                          {isDemoConnection(conn) && (
                            <Badge variant="secondary">Demo</Badge>
                          )}
                          {conn.authProvider !== "none" && (
                            <span className="rounded bg-secondary px-1.5 py-0.5 text-xs text-muted-foreground">
                              {conn.authProvider}
                            </span>
                          )}
                        </>
                      )
                    )}
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </div>
      </PopoverContent>
    </Popover>
  );
}
