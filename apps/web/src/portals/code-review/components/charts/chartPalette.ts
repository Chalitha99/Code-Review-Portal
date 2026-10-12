import type { TaskStatus } from '@sdp/contracts';

/**
 * Chart colours, resolved from the same semantic tokens the badges use.
 *
 * Hex values rather than Tailwind classes because Recharts fills an SVG `<Cell>`
 * with a colour, not a class — and because the legend dot beside it must be the
 * identical colour, which two independent lookups would eventually get wrong.
 *
 * These mirror `packages/config/tailwind.tokens.css`; when a status colour
 * changes there it must change here too. That duplication is the price of an SVG
 * chart, and keeping it in ONE small module is what makes it a five-second fix
 * rather than a hunt.
 *
 * It lives in `components/` rather than in either feature because both the admin
 * Reports donuts and the developer Analytics donuts draw the same three
 * distributions. They each had their own copy, and the copies had already
 * drifted — Analytics painted Submitted `#1e40af` and Approved `#166534` against
 * Reports' `#7c3aed` and `#15803d`, so the same status was two different colours
 * depending on which screen you were standing on. A feature may not import
 * another feature (standards §2), so shared means here.
 */

export const STATUS_COLORS: Record<TaskStatus, string> = {
  Draft: '#b45309',
  Submitted: '#7c3aed',
  InReview: '#0f2167',
  ChangesRequested: '#f59e0b',
  ReSubmitted: '#0891b2',
  Approved: '#15803d',
  Cancelled: '#dc2626',
};

/** Rank 1 is good, 3 is serious — green through red, as the wireframe draws it. */
export const RANK_COLORS: Record<string, string> = {
  '1': '#15803d',
  '2': '#b45309',
  '3': '#dc2626',
};

export const CYCLE_COLORS: Record<string, string> = {
  '1': '#15803d',
  '2': '#b45309',
  '3+': '#dc2626',
};

/** `--color-ink-500`. For a key no map covers, which is a data bug, not a style. */
export const CHART_FALLBACK_COLOR = '#4f5870';

/**
 * `--color-violet-600`, for a chart measuring a plain magnitude.
 *
 * Not every chart is about status. A turnaround distribution has no verdict to
 * colour by — its bands are fast to slow, and painting them with the status
 * palette would claim "under 4 hours" is Approved and "over 5 days" is Cancelled.
 *
 * The same violet `MetricBar` fills with, deliberately: both answer "how much",
 * so a reader who has learned the meter's colour has already learned this one.
 */
export const CHART_ACCENT_COLOR = '#4f2fe0';
