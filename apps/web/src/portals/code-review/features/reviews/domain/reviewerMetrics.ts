import { REVIEW_RANKS, type Review, type ReviewRank, type TaskListItem } from '@sdp/contracts';
import {
  decidedReviews,
  isRank,
  mean,
  round1,
  round2,
  turnaroundHours,
} from '@/lib/reviewStats.ts';
import { LENIENT_APPROVAL_RATE, STRICT_APPROVAL_RATE } from '@/lib/analyticsTargets.ts';

/**
 * The numbers behind Reviewer Analytics.
 *
 * Every figure here answers a question the REVIEWER has, which is what makes
 * this module worth existing beside `taskMetrics`. The developer asks "was my
 * work accepted"; the reviewer asks "how much am I carrying, how quickly do I
 * turn it round, how strictly do I grade, and where is my effort going". Those
 * share almost no arithmetic — the one genuinely common piece is in
 * `lib/reviewStats.ts`.
 *
 * Deliberately NOT a copy of `reviewerActivity` in the admin Reports feature.
 * That ranks every reviewer against each other on four shallow figures for an
 * admin; this goes deep on one person and adds what an admin's league table has
 * no room for — turnaround, its distribution, week-by-week activity, and the
 * customer split. (A feature may not import another feature anyway; §2.)
 *
 * Pure and framework-free, so the same aggregations port to SQL in Phase 2.
 * `null` — never `0` — wherever there is no denominator: an approval rate of 0%
 * and "no reviews yet" are different claims, and FL 2.4.3 wants the empty state.
 */

/* -------------------------------------------------------------------------- */
/* Headline summary — the KPI row                                              */
/* -------------------------------------------------------------------------- */

/**
 * How this reviewer's severity reads, from the share they approve outright.
 *
 * A profile, not a score. There is no "good" tendency: a reviewer working on a
 * fragile subsystem SHOULD send more back, and one seeing polished work should
 * not manufacture objections. It is shown as a caption rather than a target for
 * exactly that reason. Thresholds are SHARED with `reportMetrics.tendencyFor`
 * through `lib/analyticsTargets.ts`, so a reviewer's own page and the admin's
 * league table cannot label them differently on the same day. They used to be
 * copied literals in both files, which made that guarantee a comment rather
 * than a fact.
 */
export type ReviewerTendency = 'strict' | 'balanced' | 'lenient' | 'none';

export function tendencyFor(decidedCount: number, approvalRate: number | null): ReviewerTendency {
  if (decidedCount === 0 || approvalRate === null) return 'none';
  if (approvalRate >= LENIENT_APPROVAL_RATE) return 'lenient';
  if (approvalRate >= STRICT_APPROVAL_RATE) return 'balanced';
  return 'strict';
}

export interface ReviewerSummary {
  /** Reviews this person has decided. The denominator for everything below. */
  completed: number;
  /** Tasks sitting with them right now, awaiting a verdict. */
  inQueue: number;
  /** Mean hours from opening a review to deciding it. `null` before any. */
  avgTurnaroundHours: number | null;
  /** Percent of decided reviews approved outright. `null` before any. */
  approvalRate: number | null;
  changesRequested: number;
  /** Mean rank awarded. `null` until a rank has been given. */
  avgRankGiven: number | null;
  tendency: ReviewerTendency;
}

export function reviewerSummary(
  reviews: readonly Review[],
  /** From the reviewer's own `assigned` queue — a task, not a review. */
  queueDepth: number,
): ReviewerSummary {
  const finished = decidedReviews(reviews);
  const approved = finished.filter((review) => review.decision === 'Approved');
  const ranks = finished.map((review) => review.rank).filter(isRank);

  const turnarounds = finished
    .map((review) => turnaroundHours(review))
    .filter((hours): hours is number => hours !== null);

  const approvalRate =
    finished.length === 0 ? null : round1((approved.length / finished.length) * 100);
  const avgTurnaround = mean(turnarounds);
  const avgRank = mean(ranks);

  return {
    completed: finished.length,
    inQueue: queueDepth,
    avgTurnaroundHours: avgTurnaround === null ? null : round1(avgTurnaround),
    approvalRate,
    changesRequested: finished.filter((review) => review.decision === 'ChangesRequested').length,
    avgRankGiven: avgRank === null ? null : round2(avgRank),
    tendency: tendencyFor(finished.length, approvalRate),
  };
}

/* -------------------------------------------------------------------------- */
/* Activity over time — the trend chart                                        */
/* -------------------------------------------------------------------------- */

export interface ReviewWeek {
  /** ISO date of the Monday that starts the week. The chart's x value. */
  weekStart: string;
  approved: number;
  changesRequested: number;
  total: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The Monday of the week a timestamp falls in, at UTC midnight.
 *
 * UTC throughout, not local time. A reviewer in Colombo and the CI runner in UTC
 * must bucket the same review into the same week, or a chart screenshot taken in
 * one timezone disagrees with the test asserting it in another.
 */
function weekStartOf(iso: string): string {
  const date = new Date(iso);
  const utc = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  // `getUTCDay()` is 0 for Sunday, so Sunday belongs to the week that began six
  // days earlier rather than starting a new one.
  const dayOfWeek = (new Date(utc).getUTCDay() + 6) % 7;
  return new Date(utc - dayOfWeek * DAY_MS).toISOString();
}

/**
 * Decided reviews per week, split by verdict.
 *
 * GAP-FILLED: weeks in which nothing was decided are emitted with zeroes rather
 * than skipped. Without that a quiet fortnight collapses into a single x-step
 * and the line reads as continuous activity — the chart would hide precisely the
 * thing an activity chart exists to show.
 *
 * Capped at `maxWeeks` from the most recent week backwards, so a reviewer with
 * two years of history gets a readable axis rather than 104 ticks.
 */
export function reviewActivityByWeek(reviews: readonly Review[], maxWeeks = 12): ReviewWeek[] {
  const buckets = new Map<string, { approved: number; changesRequested: number }>();

  for (const review of decidedReviews(reviews)) {
    if (review.decidedAt === null) continue;
    const key = weekStartOf(review.decidedAt);
    const entry = buckets.get(key) ?? { approved: 0, changesRequested: 0 };
    if (review.decision === 'Approved') entry.approved += 1;
    else entry.changesRequested += 1;
    buckets.set(key, entry);
  }

  if (buckets.size === 0) return [];

  const stamps = [...buckets.keys()].map((key) => Date.parse(key)).sort((a, b) => a - b);
  const last = stamps[stamps.length - 1] ?? 0;
  const earliest = stamps[0] ?? 0;
  const windowStart = Math.max(earliest, last - (maxWeeks - 1) * 7 * DAY_MS);

  const weeks: ReviewWeek[] = [];
  for (let stamp = windowStart; stamp <= last; stamp += 7 * DAY_MS) {
    const key = new Date(stamp).toISOString();
    const entry = buckets.get(key) ?? { approved: 0, changesRequested: 0 };
    weeks.push({
      weekStart: key,
      approved: entry.approved,
      changesRequested: entry.changesRequested,
      total: entry.approved + entry.changesRequested,
    });
  }

  return weeks;
}

/* -------------------------------------------------------------------------- */
/* Turnaround distribution — the bar chart                                     */
/* -------------------------------------------------------------------------- */

export interface TurnaroundBucket {
  /** Stable key for colour and copy lookup; the label is the caller's. */
  id: 'under4h' | 'under24h' | 'under2d' | 'under5d' | 'over5d';
  count: number;
}

const BUCKET_CEILINGS: readonly {
  id: TurnaroundBucket['id'];
  maxHours: number;
}[] = [
  { id: 'under4h', maxHours: 4 },
  { id: 'under24h', maxHours: 24 },
  { id: 'under2d', maxHours: 48 },
  { id: 'under5d', maxHours: 120 },
  { id: 'over5d', maxHours: Number.POSITIVE_INFINITY },
];

/**
 * How consistent the reviewer is, which an average alone cannot say.
 *
 * Two reviewers averaging 24 hours are different people if one is always within
 * a day and the other alternates between an hour and a week. Every bucket is
 * emitted even when empty — the shape of the distribution is the message, and a
 * missing bar reads as a missing category rather than as a zero.
 */
export function turnaroundBuckets(reviews: readonly Review[]): TurnaroundBucket[] {
  const counts = new Map<TurnaroundBucket['id'], number>(
    BUCKET_CEILINGS.map((bucket) => [bucket.id, 0]),
  );

  for (const review of decidedReviews(reviews)) {
    const hours = turnaroundHours(review);
    if (hours === null) continue;
    const bucket = BUCKET_CEILINGS.find((entry) => hours < entry.maxHours);
    if (bucket) counts.set(bucket.id, (counts.get(bucket.id) ?? 0) + 1);
  }

  return BUCKET_CEILINGS.map((bucket) => ({
    id: bucket.id,
    count: counts.get(bucket.id) ?? 0,
  }));
}

/* -------------------------------------------------------------------------- */
/* Verdict and rank mix — the two donuts                                       */
/* -------------------------------------------------------------------------- */

export interface DecisionCount {
  decision: 'Approved' | 'ChangesRequested';
  count: number;
}

export function decisionMix(reviews: readonly Review[]): DecisionCount[] {
  const finished = decidedReviews(reviews);

  return (['Approved', 'ChangesRequested'] as const)
    .map((decision) => ({
      decision,
      count: finished.filter((review) => review.decision === decision).length,
    }))
    .filter((entry) => entry.count > 0);
}

export interface RankGivenCount {
  rank: ReviewRank;
  count: number;
}

/**
 * The ranks this reviewer awarded — their own grading profile.
 *
 * The mirror of the developer's "My Quality Ranking", and the distinction
 * matters: there the ranks were RECEIVED, here they were GIVEN. Same three
 * values, opposite meaning, so the two pages must never share a caption.
 */
export function rankGivenDistribution(reviews: readonly Review[]): RankGivenCount[] {
  const ranks = decidedReviews(reviews)
    .map((review) => review.rank)
    .filter(isRank);

  return REVIEW_RANKS.map((rank) => ({
    rank,
    count: ranks.filter((given) => given === rank).length,
  })).filter((entry) => entry.count > 0);
}

/* -------------------------------------------------------------------------- */
/* Customer split — where the review effort goes                               */
/* -------------------------------------------------------------------------- */

export interface ReviewerCustomerLoad {
  customerId: string;
  name: string;
  color: string;
  reviewCount: number;
  approvalRate: number | null;
  avgRankGiven: number | null;
  avgTurnaroundHours: number | null;
}

/**
 * The reviewer's work broken down by whose product it was.
 *
 * Joined through the task, because a review carries no customer of its own. Only
 * tasks the caller can see are joinable, and that is the correct bound: the
 * server scopes both lists to this user.
 *
 * Reviews whose task is not in the list are dropped rather than bucketed as
 * "Unknown" — a phantom customer row on a personal dashboard is worse than a
 * slightly short total, and it only happens when the two queries disagree
 * mid-refetch.
 */
export function reviewsByCustomer(
  reviews: readonly Review[],
  tasks: readonly TaskListItem[],
): ReviewerCustomerLoad[] {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const finished = decidedReviews(reviews);

  const grouped = new Map<string, { task: TaskListItem; reviews: Review[] }>();
  for (const review of finished) {
    const task = taskById.get(review.taskId);
    if (!task) continue;
    const entry = grouped.get(task.customerId) ?? { task, reviews: [] };
    entry.reviews.push(review);
    grouped.set(task.customerId, entry);
  }

  return (
    [...grouped.entries()]
      .map(([customerId, { task, reviews: own }]) => {
        const approved = own.filter((review) => review.decision === 'Approved').length;
        const ranks = own.map((review) => review.rank).filter(isRank);
        const turnarounds = own
          .map((review) => turnaroundHours(review))
          .filter((hours): hours is number => hours !== null);

        const avgRank = mean(ranks);
        const avgTurnaround = mean(turnarounds);

        return {
          customerId,
          name: task.customerName,
          color: task.customerColor,
          reviewCount: own.length,
          // No empty guard: a group only exists because a review was pushed into
          // it, so `own.length` is at least 1 by construction.
          approvalRate: round1((approved / own.length) * 100),
          avgRankGiven: avgRank === null ? null : round2(avgRank),
          avgTurnaroundHours: avgTurnaround === null ? null : round1(avgTurnaround),
        };
      })
      // Busiest first: the customer a reviewer spends most time on is the one they
      // opened this panel to read about.
      .sort((a, b) => b.reviewCount - a.reviewCount || a.name.localeCompare(b.name))
  );
}
