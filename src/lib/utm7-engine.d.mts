import type { DashboardData } from "./utm7-types";
export function number(value: unknown): number;
export function dateKey(value: unknown): string;
export function sheetRows(valueRange: unknown): Record<string, unknown>[];
export function buildDashboard(
  sheet: unknown,
  catalog: unknown,
  request: Record<string, unknown>,
): DashboardData;
