import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getEntityColumns,
  getEntityProperties,
} from "@/utils/dataStructureDetector";

// Collect all unique property keys for each entity column across all rows
function getAllEntityPropertiesByColumn(results: unknown[], entityColumns: string[]) {
  const map: Record<string, Set<string>> = {};
  for (const col of entityColumns) {
    map[col] = new Set();
  }
  for (const row of results) {
    if (typeof row !== "object" || row === null) continue;
    for (const col of entityColumns) {
      const entity = (row as Record<string, unknown>)[col];
      const props = getEntityProperties(entity);
      for (const [key] of props) {
        map[col].add(key);
      }
    }
  }
  // Convert sets to sorted arrays for stable rendering
  const result: Record<string, string[]> = {};
  for (const col of entityColumns) {
    result[col] = Array.from(map[col]).sort();
  }
  return result;
}

interface FlatColumnsViewProps {
  results: unknown[];
  onEntityClick: (entity: unknown, entityKey: string) => void;
}

export function FlatColumnsView({
  results,
  onEntityClick,
}: FlatColumnsViewProps) {
  const entityColumns = getEntityColumns(results);
  const allEntityProps = getAllEntityPropertiesByColumn(results, entityColumns);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {entityColumns.flatMap((entityKey) => {
            const properties = allEntityProps[entityKey];
            return properties.map((propKey, propIdx) => (
              <TableHead
                key={`${entityKey}.${propKey}`}
                className={`text-xs font-medium ${
                  propIdx === 0 ? "border-l border-border" : ""
                }`}
              >
                {entityKey}.{propKey}
              </TableHead>
            ));
          })}
        </TableRow>
      </TableHeader>

      <TableBody>
        {results.map((row, rowIdx) => {
          if (typeof row !== "object" || row === null) return null;
          return (
            <TableRow key={rowIdx} className="hover:bg-muted/50">
              {entityColumns.flatMap((entityKey) => {
                const allProps = allEntityProps[entityKey];
                const entity = (row as Record<string, unknown>)[entityKey];
                const entityProps = getEntityProperties(entity).reduce<Record<string, unknown>>((acc, [k, v]) => {
                  acc[k] = v;
                  return acc;
                }, {});
                return allProps.map((propKey, propIdx) => {
                  const propValue = entityProps[propKey];
                  return (
                    <TableCell
                      key={`${entityKey}.${propKey}`}
                      className={`text-xs cursor-pointer ${
                        propIdx === 0 ? "border-l border-border" : ""
                      }`}
                      onClick={() => onEntityClick(entity, entityKey)}
                    >
                      {propKey === "$dtId" ? (
                        <code className="font-mono text-xs">
                          {propValue !== undefined ? String(propValue) : ""}
                        </code>
                      ) : typeof propValue === "boolean" ? (
                        <Badge
                          variant={propValue ? "default" : "secondary"}
                          className="text-xs"
                        >
                          {propValue ? "true" : "false"}
                        </Badge>
                      ) : typeof propValue === "number" ? (
                        <span className="font-medium">{propValue}</span>
                      ) : propValue !== undefined ? (
                        <span>{String(propValue)}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  );
                });
              })}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
