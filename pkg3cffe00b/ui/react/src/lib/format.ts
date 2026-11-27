/* Display formatting helpers for test results. */

export function formatPercent(ratio: number | undefined): string {
  if (ratio == null || Number.isNaN(ratio)) return '-';
  return `${(ratio * 100).toFixed(1)}%`;
}

export function formatDuration(seconds: number | undefined): string {
  if (seconds == null || Number.isNaN(seconds)) return '-';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

export function formatDateTime(value: string | undefined): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function durationBetween(start?: string, end?: string): number | undefined {
  if (!start || !end) return undefined;
  return (new Date(end).getTime() - new Date(start).getTime()) / 1000;
}
