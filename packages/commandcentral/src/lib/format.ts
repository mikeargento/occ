export function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString();
}

export function formatRelativeTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 1000) return "just now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function formatNumber(n: number): string {
  return n.toLocaleString();
}
