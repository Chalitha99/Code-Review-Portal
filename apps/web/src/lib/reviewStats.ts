import type { Review, ReviewRank } from '@sdp/contracts';

/**
 * The arithmetic every metrics module needs, in one place.
 *
 * `features/tasks/domain/taskMetrics.ts` carries a note explaining why it does
 * NOT import its near-neighbours in `features/reports/domain/reportMetrics.ts`
 * — a feature may never import another feature (standards §2) — and it names the
 * exit: *"Moving that module wholesale into `lib/` is the right call the day a
 * third caller appears, and premature today."*
 *
 * `features/reviews/domain/reviewerMetrics.ts` is that third caller. What moved
 * is deliberately narrow — the REVIEW-DOMAIN primitives, where all three modules
 * had byte-identical copies:
 *
 * - The aggregations stayed put. `reviewerActivity` in reports answers "how does
 *   every reviewer compare"; the reviewer's own module answers "how am I doing,
 *   in depth". Merging them would produce one function with a mode flag, which
 *   is worse than two.
 * - `round1`/`round2` moved because they are one-liners with one meaning.
 *   `mean` moved in its NULLABLE form, which is what `taskMetrics` already had.
 *   `reportMetrics` keeps its own non-null `mean`: every call site there guards
 *   the empty case first and then chooses `0` or `null` deliberately, and that
 *   asymmetry is a specification detail (FL 2.4.3), not an accident to tidy up.
 *
 * Framework-free and pure, so it ports to a NestJS service in Phase 2 unchanged.
 */

/**
 * Reviews that reached a verdict.
 *
 * A review in progress has no decision and no rank worth counting, and folding
 * one in as an approval or a rank 1 would flatter every figure downstream. This
 * is the filter that makes "approval rate" mean something.
 */
export function decidedReviews(reviews: readonly Review[]): Review[] {
  return reviews.filter((review) => review.decision !== null);
}

/**
 * Narrows away the nullable rank.
 *
 * A type guard rather than a `!== null` filter because `Review['rank']` stays
 * `ReviewRank | null` however it was filtered, so every caller downstream would
 * otherwise need a non-null assertion to state what the filter already proved.
 */
export function isRank(rank: ReviewRank | null): rank is ReviewRank {
  return rank !== null;
}

/** Arithmetic mean. `null` for an empty set — a mean of nothing is not zero. */
export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** One decimal place — percentages, where a second digit is noise. */
export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Two decimal places — averaged ranks and cycles, which move in small steps. */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Hours between opening a review and deciding it.
 *
 * `null` when the review has not been decided, so an open review cannot be
 * counted as an instant turnaround. Returned as a NUMBER, not a formatted
 * string: this layer is framework-free and how a duration reads is a rendering
 * decision (`formatDurationHours` in `lib/formatters.ts`).
 *
 * `createdAt` is stamped when the reviewer first opens the review and
 * `decidedAt` when they submit the verdict, so this measures the reviewer's own
 * time — not how long the task sat in the queue before anyone picked it up.
 */
export function turnaroundHours(review: Review): number | null {
  if (review.decidedAt === null) return null;

  const elapsed = Date.parse(review.decidedAt) - Date.parse(review.createdAt);
  // Clamped at zero rather than trusted. Both timestamps come from the server,
  // and a clock skew that produced a negative duration would drag an average
  // below zero and read as a bug in the metric rather than in the data.
  return Math.max(0, elapsed) / (1000 * 60 * 60);
}
