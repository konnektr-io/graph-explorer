/**
 * Human-friendly duration formatting shared by the query toolbar, results
 * header and query history (issue #22).
 *
 * `830ms` → `12.4s` → `1m03s`
 */
export const formatDuration = (ms: number) => {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m${s.toString().padStart(2, "0")}s`;
};
