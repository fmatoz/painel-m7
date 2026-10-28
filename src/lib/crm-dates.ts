const pad = (value: number) => String(value).padStart(2, "0");

export function localDate(value = new Date()): string {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

export function localDateTime(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${localDate(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function nextActionInDays(days: number, now = new Date()): string {
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  date.setSeconds(0, 0);
  return date.toISOString();
}
