import { format, formatDistanceToNow } from "date-fns";

export function timeAgo(ts: number): string {
  return formatDistanceToNow(new Date(ts), { addSuffix: true });
}

export function formatDateTime(ts: number): string {
  return format(new Date(ts), "d MMM yyyy, h:mm a");
}

export function formatDate(ts: number): string {
  return format(new Date(ts), "d MMM yyyy");
}

/** HTML datetime-local value for an <input type="datetime-local"> */
export function toLocalInputValue(ts: number): string {
  return format(new Date(ts), "yyyy-MM-dd'T'HH:mm");
}

/** Hours remaining, floored; negative means past. */
export function hoursUntil(ts: number): number {
  return Math.floor((ts - Date.now()) / 3_600_000);
}

/** Approximate confidence label for inventory staleness. */
export function inventoryConfidence(updatedAt: number): {
  label: string;
  tone: "fresh" | "aging" | "stale";
} {
  const hours = (Date.now() - updatedAt) / 3_600_000;
  if (hours <= 6) return { label: "Recent", tone: "fresh" };
  if (hours <= 24) return { label: "Aging", tone: "aging" };
  return { label: "Stale", tone: "stale" };
}
