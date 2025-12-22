import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";


// Utility to get all unique keys from all rows (sorted for stable rendering)
function getAllColumnKeys(results: unknown[]): string[] {
  const keySet = new Set<string>();
  for (const row of results) {
    if (typeof row === "object" && row !== null) {
      Object.keys(row).forEach((k) => keySet.add(k));
    }
  }
  return Array.from(keySet).sort();
}

interface SimpleTableViewProps {
  results: unknown[];
  onRowClick: (row: unknown) => void;
}

export function SimpleTableView({
  results,
  onRowClick,
}: SimpleTableViewProps) {
  const columnKeys = getAllColumnKeys(results);
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {columnKeys.map((key) => (
            <TableHead key={key} className="font-semibold">
              {key}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {results.map((row, index) => (
          <TableRow
            key={index}
            className="cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => onRowClick(row)}
          >
            {columnKeys.map((key) => {
              let value: unknown = undefined;
              if (typeof row === "object" && row !== null) {
                value = (row as Record<string, unknown>)[key];
              }
              return (
                <TableCell key={key} className="font-mono text-xs">
                  {typeof value === "object" && value !== null
                    ? JSON.stringify(value)
                    : value === undefined ? "" : String(value)}
                </TableCell>
              );
            })}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
