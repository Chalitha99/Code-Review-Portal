import { format, formatDistanceToNow, parseISO } from 'date-fns';
import type { IsoDateTime } from '@sdp/contracts';

/**
 * Presentation helpers. Timestamps cross the wire as ISO strings (see
 * `@sdp/types/common`), so conversion happens here at the render edge rather
 * than being smuggled into the domain types.
 */

/** "Jul 23, 2026" — the grid `Created` column. */
export function formatDate(value: IsoDateTime): string {
  return format(parseISO(value), 'MMM d, yyyy');
}

/** "July 24, 2026 1:33 PM" — task detail timestamps. */
export function formatDateTime(value: IsoDateTime): string {
  return format(parseISO(value), 'MMMM d, yyyy h:mm a');
}

/** "Jul 24, 2026 · 1:33 PM" — compact timeline timestamps. */
export function formatCompactDateTime(value: IsoDateTime): string {
  return format(parseISO(value), "MMM d, yyyy '·' h:mm a");
}

/** "3 hours ago" — notification list. */
export function formatRelative(value: IsoDateTime): string {
  return formatDistanceToNow(parseISO(value), { addSuffix: true });
}

/**
 * A duration in hours, at the precision a reader actually wants.
 *
 * "3h 20m" under a day, "2.4 days" above it. Switching units rather than always
 * using one is the whole point: "57.3 hours" makes a reader do arithmetic to
 * find out whether that is good, and "0.1 days" hides a fast turnaround
 * entirely.
 *
 * The COMPUTATION lives in `lib/reviewStats.ts#turnaroundHours` and returns a
 * number; this is only the render edge. A domain module that returned a
 * formatted string could not be averaged.
 */
export function formatDurationHours(hours: number): string {
  if (hours < 1) return `${String(Math.max(1, Math.round(hours * 60)))}m`;

  if (hours < 24) {
    const whole = Math.floor(hours);
    const minutes = Math.round((hours - whole) * 60);
    // 60 minutes would render as "3h 60m"; carry it into the hour instead.
    if (minutes === 60) return `${String(whole + 1)}h`;
    return minutes === 0 ? `${String(whole)}h` : `${String(whole)}h ${String(minutes)}m`;
  }

  const days = hours / 24;
  return `${days.toFixed(1)} days`;
}

/** Avatar initials: "Charith Widanapathirana" gives "CW", "Udari" gives "U". */
export function toInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

/**
 * Interpolate `{name}` placeholders in a content string.
 *
 * Copy lives in `content/*.json` (plan section 4.4), which means some strings
 * carry runtime values — "{count} total tasks". This keeps that substitution in
 * one tested place instead of scattered template literals that quietly bypass
 * the content layer.
 */
export function interpolate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

/** `value`, or `fallback` when it is missing or empty — the `||` idiom for display strings. */
export function textOr(value: string | null | undefined, fallback: string): string {
  return value === undefined || value === null || value === '' ? fallback : value;
}

/** Notification badge caps at "9+" to match the wireframe header. */
export function formatBadgeCount(count: number, max = 9): string {
  return count > max ? `${max}+` : String(count);
}

/** Canonical Review Round presentation: "Round 2". */
export function formatReviewRound(round: number): string {
  return `Round ${round}`;
}

/** Canonical Counted Cycle presentation: "Cycle 1". */
export function formatCountedCycle(cycle: number): string {
  return `Cycle ${cycle}`;
}

