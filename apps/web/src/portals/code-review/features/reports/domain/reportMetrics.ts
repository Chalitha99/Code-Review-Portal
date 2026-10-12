import type { Customer, Review, TaskListItem, TaskStatus, User } from '@sdp/contracts';
import { decidedReviews, isRank } from '@/lib/reviewStats.ts';
import {
  APPROVAL_RATE_TARGET,
  GOOD_RANK_THRESHOLD,
  HIGH_CYCLE_THRESHOLD,
  LENIENT_APPROVAL_RATE,
  STRICT_APPROVAL_RATE,
} from '@/lib/analyticsTargets.ts';

/**
 * Every number on the Reports tab, as pure functions.
 *
 * These live in `domain/` and import nothing but types, for the usual reason:
 * the same aggregations move to SQL in Phase 2, and a rule that lives inside a
 * chart component cannot be ported line for line or unit-tested against the
 * business's own figures.
 *
 * Phase 1 computes them in the browser over the full task list, which is
 * defensible only because an admin is authorised to see every row anyway and
 * there are tens of them. Phase 2 pre-aggregates nightly (plan §2.6).
 */

/* -------------------------------------------------------------------------- */
/* Filters                                                                     */
/* -------------------------------------------------------------------------- */

export interface ReportFilters {
  /** ISO date, inclusive. Empty means no lower bound. */
  from: string;
  customerId: string;
  status?: string;
}

export const ALL_REPORT_VALUES = 'all';

export const EMPTY_REPORT_FILTERS: ReportFilters = {
  from: '',
  customerId: ALL_REPORT_VALUES,
  status: ALL_REPORT_VALUES,
};

export function applyReportFilters(
  tasks: readonly TaskListItem[],
  filters: ReportFilters,
): TaskListItem[] {
  return tasks.filter((task) => {
    if (filters.customerId !== ALL_REPORT_VALUES && task.customerId !== filters.customerId) {
      return false;
    }
    if (filters.status && filters.status !== ALL_REPORT_VALUES && task.status !== filters.status) {
      return false;
    }
    if (filters.from !== '' && task.createdAt < filters.from) return false;
    return true;
  });
}

/* -------------------------------------------------------------------------- */
/* Distributions — the three donuts                                            */
/* -------------------------------------------------------------------------- */

export interface Slice {
  key: string;
  label: string;
  value: number;
  /** Share of the whole, 0–100, rounded to one decimal. */
  percent: number;
}

function toSlices(counts: ReadonlyMap<string, { label: string; value: number }>): Slice[] {
  const total = [...counts.values()].reduce((sum, entry) => sum + entry.value, 0);

  return [...counts.entries()]
    .filter(([, entry]) => entry.value > 0)
    .map(([key, entry]) => ({
      key,
      label: entry.label,
      value: entry.value,
      percent: total === 0 ? 0 : Math.round((entry.value / total) * 1000) / 10,
    }));
}

export function taskStatusDistribution(
  tasks: readonly TaskListItem[],
  labels: Readonly<Record<TaskStatus, string>>,
): Slice[] {
  const counts = new Map<string, { label: string; value: number }>();

  for (const task of tasks) {
    const existing = counts.get(task.status);
    counts.set(task.status, {
      label: labels[task.status],
      value: (existing?.value ?? 0) + 1,
    });
  }

  return toSlices(counts);
}

/**
 * Rank distribution over DECIDED reviews.
 *
 * Undecided reviews are excluded rather than counted as rank 1: a review in
 * progress has no verdict, and folding it in would flatter the numbers.
 */
export function rankDistribution(
  reviews: readonly Review[],
  labels: Readonly<Record<1 | 2 | 3, string>>,
): Slice[] {
  const counts = new Map<string, { label: string; value: number }>();

  for (const review of decidedReviews(reviews)) {
    if (review.rank === null) continue;
    const key = String(review.rank);
    counts.set(key, {
      label: labels[review.rank],
      value: (counts.get(key)?.value ?? 0) + 1,
    });
  }

  return toSlices(counts);
}

/**
 * How many cycles tasks took to reach approval, bucketed as the wireframe does:
 * Cycle 1, Cycle 2, Cycle 3+.
 *
 * Only approved tasks are counted. A task still going round has not yet taken
 * "N cycles to approval" — it has taken N so far, which is a different figure.
 */
export function cycleDistribution(
  tasks: readonly TaskListItem[],
  labels: { one: string; two: string; threePlus: string },
): Slice[] {
  const counts = new Map<string, { label: string; value: number }>([
    ['0', { label: '0 Cycles', value: 0 }],
    ['1', { label: labels.one, value: 0 }],
    ['2', { label: labels.two, value: 0 }],
    ['3+', { label: labels.threePlus, value: 0 }],
  ]);

  for (const task of approvedTasks(tasks)) {
    /*
     * `<= 1`, not `=== 1`, and it matches `taskMetrics.byCycle` deliberately.
     *
     * These two functions draw the SAME chart on two screens. While this one
     * tested `=== 1` a `countedCycle` of 0 fell through to `3+` here and to `1`
     * there, so an admin and the developer whose work it was would have read
     * opposite things off one number. Nothing in the seed carries a 0 today,
     * which is precisely why the divergence would have shipped.
     */
    const cycleCount = task.reviewCycle ?? task.countedCycle;
    const key = cycleCount === 0 ? '0' : cycleCount === 1 ? '1' : cycleCount === 2 ? '2' : '3+';
    const entry = counts.get(key);
    if (entry) entry.value += 1;
  }

  return toSlices(counts);
}

/* -------------------------------------------------------------------------- */
/* Summary — the eight KPI cards                                               */
/* -------------------------------------------------------------------------- */

export interface ReportSummary {
  total: number;
  approved: number;
  changesRequested: number;
  cancelled: number;
  /** Percent of tasks that reached review and were approved. */
  approvalRate: number;
  isApprovalOnTarget: boolean;
  avgCountedCycles: number;
  avgReviewCycles: number;
  isCycleCountHigh: boolean;
  avgQualityRank: number;
  isQualityGood: boolean;
  team: { developers: number; reviewers: number; admins: number };
}

/**
 * The denominator for approval rate is tasks that actually reached review —
 * total minus drafts minus cancellations.
 *
 * Counting drafts would punish a team for work in progress, and counting
 * cancellations would punish them for work the business withdrew. This matches
 * the wireframe's own arithmetic: 33 tasks, 3 drafts, 16 cancelled, 2 approved →
 * "14.3% approval rate".
 */
export function reviewedTaskCount(tasks: readonly TaskListItem[]): number {
  return tasks.filter((task) => task.status !== 'Draft' && task.status !== 'Cancelled').length;
}

export function summarise(
  tasks: readonly TaskListItem[],
  reviews: readonly Review[],
  users: readonly User[],
): ReportSummary {
  const approved = approvedTasks(tasks);
  const reviewed = reviewedTaskCount(tasks);
  const ranked = decidedReviews(reviews).filter((review) => review.rank !== null);

  const approvalRate = reviewed === 0 ? 0 : round1((approved.length / reviewed) * 100);
  const avgCountedCycles =
    approved.length === 0 ? 0 : round2(mean(approved.map((task) => task.countedCycle)));
  const avgQualityRank =
    ranked.length === 0 ? 0 : round2(mean(ranked.map((review) => review.rank ?? 0)));

  const active = users.filter((user) => user.isActive);

  return {
    total: tasks.length,
    approved: approved.length,
    changesRequested: tasks.filter((task) => task.status === 'ChangesRequested').length,
    cancelled: tasks.filter((task) => task.status === 'Cancelled').length,
    approvalRate,
    isApprovalOnTarget: approvalRate >= APPROVAL_RATE_TARGET,
    avgCountedCycles,
    avgReviewCycles: avgCountedCycles,
    // Zero means "nothing approved yet", not "excellent" — an empty dataset must
    // not read as a perfect score.
    isCycleCountHigh: avgCountedCycles > HIGH_CYCLE_THRESHOLD,
    avgQualityRank,
    isQualityGood: ranked.length > 0 && avgQualityRank <= GOOD_RANK_THRESHOLD,
    team: {
      developers: active.filter((user) => user.roles.includes('Developer')).length,
      reviewers: active.filter((user) => user.roles.includes('Reviewer')).length,
      admins: active.filter((user) => user.roles.includes('Admin')).length,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Per-person and per-customer breakdowns — the three sub-tabs                 */
/* -------------------------------------------------------------------------- */

export interface DeveloperPerformance {
  userId: string;
  name: string;
  taskCount: number;
  approvedCount: number;
  approvalRate: number;
  avgRank: number | null;
  avgCycles: number | null;
  changesRequestedCount: number;
  /** Coarse label the wireframe shows as a chip. */
  standing: 'good' | 'fair' | 'poor' | 'none';
  rankSlices: Slice[];
  cycleSlices: Slice[];
}

const DEFAULT_DEV_RANK_LABELS: Readonly<Record<1 | 2 | 3, string>> = {
  1: 'Rank 1',
  2: 'Rank 2',
  3: 'Rank 3',
};

const DEFAULT_DEV_CYCLE_LABELS = {
  one: 'Cycle 1',
  two: 'Cycle 2',
  threePlus: 'Cycle 3+',
};

export function developerPerformance(
  tasks: readonly TaskListItem[],
  reviews: readonly Review[],
  users: readonly User[],
  labels?: {
    rank: Readonly<Record<1 | 2 | 3, string>>;
    cycle: { one: string; two: string; threePlus: string };
  },
): DeveloperPerformance[] {
  const byTask = new Map(tasks.map((task) => [task.id, task]));
  const rankLabels = labels?.rank ?? DEFAULT_DEV_RANK_LABELS;
  const cycleLabels = labels?.cycle ?? DEFAULT_DEV_CYCLE_LABELS;

  return users
    .filter((user) => user.roles.includes('Developer'))
    .map((user) => {
      const own = tasks.filter((task) => task.developerId === user.id);
      const approved = approvedTasks(own);
      const reviewed = reviewedTaskCount(own);
      const approvalRate = reviewed === 0 ? 0 : round1((approved.length / reviewed) * 100);

      const ownReviews = decidedReviews(reviews).filter((review) => {
        const task = byTask.get(review.taskId);
        return task?.developerId === user.id;
      });
      const ranks = ownReviews.map((review) => review.rank).filter(isRank);

      return {
        userId: user.id,
        name: user.name,
        taskCount: own.length,
        approvedCount: approved.length,
        approvalRate,
        avgRank: ranks.length === 0 ? null : round2(mean(ranks)),
        avgCycles:
          approved.length === 0 ? null : round2(mean(approved.map((task) => task.countedCycle))),
        changesRequestedCount: ownReviews.filter((r) => r.decision === 'ChangesRequested').length,
        standing: standingFor(reviewed, approvalRate),
        rankSlices: rankDistribution(ownReviews, rankLabels),
        cycleSlices: cycleDistribution(own, cycleLabels),
      };
    })
    .filter((row) => row.taskCount > 0)
    .sort((a, b) => b.taskCount - a.taskCount);
}

export interface ReviewerActivity {
  userId: string;
  name: string;
  reviewCount: number;
  approvalRate: number;
  changesRate: number;
  avgRankGiven: number | null;
  /** "Strict" when they mostly request changes; "Lenient" when they mostly approve. */
  tendency: 'strict' | 'balanced' | 'lenient' | 'none';
}

export function reviewerActivity(
  reviews: readonly Review[],
  users: readonly User[],
): ReviewerActivity[] {
  const finished = decidedReviews(reviews);

  return users
    .filter((user) => user.roles.includes('Reviewer'))
    .map((user) => {
      const own = finished.filter((review) => review.reviewerId === user.id);
      const approvals = own.filter((review) => review.decision === 'Approved').length;
      const approvalRate = own.length === 0 ? 0 : round1((approvals / own.length) * 100);
      const ranks = own.map((review) => review.rank).filter(isRank);

      return {
        userId: user.id,
        name: user.name,
        reviewCount: own.length,
        approvalRate,
        changesRate: own.length === 0 ? 0 : round1(100 - approvalRate),
        avgRankGiven: ranks.length === 0 ? null : round2(mean(ranks)),
        tendency: tendencyFor(own.length, approvalRate),
      };
    })
    .filter((row) => row.reviewCount > 0)
    .sort((a, b) => b.reviewCount - a.reviewCount);
}

export interface CustomerOverview {
  customerId: string;
  name: string;
  code: string;
  color: string;
  taskCount: number;
  approvedCount: number;
  approvalRate: number;
  avgCycles: number | null;
  rankSlices: Slice[];
  cycleSlices: Slice[];
}

export function customerOverview(
  tasks: readonly TaskListItem[],
  reviews: readonly Review[],
  customers: readonly Customer[],
  labels: {
    rank: Readonly<Record<1 | 2 | 3, string>>;
    cycle: { one: string; two: string; threePlus: string };
  },
): CustomerOverview[] {
  const byTask = new Map(tasks.map((task) => [task.id, task]));

  return customers
    .map((customer) => {
      const own = tasks.filter((task) => task.customerId === customer.id);
      const approved = approvedTasks(own);
      const reviewed = reviewedTaskCount(own);
      const ownReviews = reviews.filter((review) => {
        const task = byTask.get(review.taskId);
        return task?.customerId === customer.id;
      });

      return {
        customerId: customer.id,
        name: customer.name,
        code: customer.code,
        color: customer.color,
        taskCount: own.length,
        approvedCount: approved.length,
        approvalRate: reviewed === 0 ? 0 : round1((approved.length / reviewed) * 100),
        avgCycles:
          approved.length === 0 ? null : round2(mean(approved.map((task) => task.countedCycle))),
        rankSlices: rankDistribution(ownReviews, labels.rank),
        cycleSlices: cycleDistribution(own, labels.cycle),
      };
    })
    .filter((row) => row.taskCount > 0)
    .sort((a, b) => b.taskCount - a.taskCount);
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function approvedTasks(tasks: readonly TaskListItem[]): TaskListItem[] {
  return tasks.filter((task) => task.status === 'Approved');
}

/*
 * Non-null on purpose, unlike the shared `mean` in `lib/reviewStats.ts`.
 *
 * Every call site here guards the empty case first and then chooses `0` or
 * `null` deliberately — an approval rate of 0% and an average rank of "no data"
 * are different claims (FL 2.4.3). Adopting the nullable version would collapse
 * that choice into one answer at the wrong layer.
 */
function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function standingFor(reviewed: number, approvalRate: number): DeveloperPerformance['standing'] {
  if (reviewed === 0) return 'none';
  if (approvalRate >= APPROVAL_RATE_TARGET) return 'good';
  if (approvalRate >= APPROVAL_RATE_TARGET / 2) return 'fair';
  return 'poor';
}

function tendencyFor(reviewCount: number, approvalRate: number): ReviewerActivity['tendency'] {
  if (reviewCount === 0) return 'none';
  if (approvalRate >= LENIENT_APPROVAL_RATE) return 'lenient';
  if (approvalRate >= STRICT_APPROVAL_RATE) return 'balanced';
  return 'strict';
}
