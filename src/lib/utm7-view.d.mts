import type { MetricRow, Metrics } from "./utm7-types";
export type ColumnPreferences = { order: string[]; visible: string[] };
export function columnPreferences(
  saved: unknown,
  keys: string[],
  defaults: string[],
): ColumnPreferences;
export function moveColumn(order: string[], from: string, to: string): string[];
export function funnelGeometry(values: (number | null)[]): {
  width: number;
  path: string;
  heights: number[];
  percentages: (number | null)[];
};
export function filterMetricRows(
  rows: MetricRow[],
  search: string,
  activeOnly: boolean,
): MetricRow[];
export function summarizeMetricRows(
  rows: MetricRow[],
): Metrics & { budgetMinor: number; frequency: null; status: string };
