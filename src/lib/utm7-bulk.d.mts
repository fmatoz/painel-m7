import type { Level, MetricRow } from "./utm7-types";
export type BulkResult = { id: string; name: string; ok: boolean; error?: string };
export function bulkBudgetTargets(
  rows: MetricRow[],
  level: Level,
  adsets: MetricRow[],
): MetricRow[];
export function runBulkOperations(
  items: MetricRow[],
  apply: (item: MetricRow) => Promise<unknown>,
  onProgress?: (results: BulkResult[]) => void,
): Promise<BulkResult[]>;
