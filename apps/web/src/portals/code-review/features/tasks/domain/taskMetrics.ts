import { TASK_STATUSES, type Review, type TaskListItem, type TaskStatus } from '@sdp/contracts';
import { mean } from '@/lib/reviewStats.ts';

/**
 * Metrics behind the Analytics screen (17) and the Reports donuts (04–06).
 *
 * Pure, so the numbers can be asserted directly rather than read back out of a
 * chart. That matters here more than usual: FL 2.4.3 specifies exactly what an
 * empty analytics panel must show, and the difference between "0%" and "no data
 * yet" is a rule, not a rendering detail.
 */

export interface StatusCount {
  status: TaskStatus;
  count: number;
}

export interface TaskMetrics {
  total: number;
  /** Statuses with at least one task, in lifecycle order. Empty when there are none. */
  byStatus: StatusCount[];
  /**
   * How many cycles APPROVED tasks took to get there. Bucketed as 1, 2, 3+.
   *
   * Approved-only, matching the chart's own caption ("Iterations needed for
   * approval") and its empty state ("No approved tasks yet"). It used to bucket
   * every analysed task by its CURRENT cycle, which answers a different
   * question: a task on cycle 2 and still going has not "needed 2 cycles for
   * approval", and a cancelled one never will. It also disagreed with
   * `reportMetrics.cycleDistribution`, which has always counted approvals only —
   * so the same named metric came out two different ways depending on which
   * dashboard you were standing on.
   */
  byCycle: { label: string; count: number }[];
  submitted: number;
  approved: number;
  /** `null` when nothing has been submitted — an approval rate of 0% would lie. */
  approvalRate: number | null;
  /** `null` when nothing has been approved. */
  averageCycles: number | null;
  /** Tasks the reviewer has sent back and the developer has not yet resubmitted. */
  changesRequested: number;
}

/**
 * The Analytics dataset: everything the developer has actually handed over.
 *
 * A draft is unsubmitted and unreviewed. Counting it reports intent as delivery
 * — "Total Submitted" claimed work that had never left the developer's hands,
 * and the status donut carried a Draft slice beside six real outcomes.
 *
 * Applied by the caller rather than inside `taskMetrics`, because the admin
 * Reports donuts read the same function over a different question ("what is in
 * the system", where a draft IS a real row) and must not inherit this filter.
 * The workspace counters above the Analytics tab keep the honest Draft-versus-
 * Submitted split for the same reason.
 */
export function submittedForAnalytics(items: readonly TaskListItem[]): TaskListItem[] {
  return items.filter((task) => task.status !== 'Draft');
}

/** Statuses that mean the developer has handed the task over. */
const SUBMITTED_STATUSES: readonly TaskStatus[] = [
  'Submitted',
  'InReview',
  'ChangesRequested',
  'ReSubmitted',
  'Approved',
];

export function taskMetrics(items: readonly TaskListItem[]): TaskMetrics {
  const byStatus = TASK_STATUSES.map((status) => ({
    status,
    count: items.filter((task) => task.status === status).length,
  })).filter((entry) => entry.count > 0);

  const approvedTasks = items.filter((task) => task.status === 'Approved');
  const submitted = items.filter((task) => SUBMITTED_STATUSES.includes(task.status)).length;

  // Approved tasks only — see `byCycle` on the interface above.
  const cycles = { zero: 0, one: 0, two: 0, threePlus: 0 };
  for (const task of approvedTasks) {
    const cycleCount = task.reviewCycle ?? task.countedCycle;
    if (cycleCount === 0) cycles.zero += 1;
    else if (cycleCount === 1) cycles.one += 1;
    else if (cycleCount === 2) cycles.two += 1;
    else cycles.threePlus += 1;
  }

  const averageCycles =
    approvedTasks.length === 0
      ? null
      : approvedTasks.reduce((sum, task) => sum + (task.reviewCycle ?? task.countedCycle), 0) /
        approvedTasks.length;

  return {
    total: items.length,
    byStatus,
    byCycle: [
      { label: '0', count: cycles.zero },
      { label: '1', count: cycles.one },
      { label: '2', count: cycles.two },
      { label: '3+', count: cycles.threePlus },
    ].filter((entry) => entry.count > 0),
    submitted,
    approved: approvedTasks.length,
    // Division by zero would give NaN, and a hardcoded 0 would claim nothing has
    // ever been approved when in fact nothing has been submitted. `null` is the
    // honest answer, and FL 2.4.3 asks for an empty state rather than a number.
    approvalRate: submitted === 0 ? null : (approvedTasks.length / submitted) * 100,
    averageCycles,
    changesRequested: items.filter((task) => task.status === 'ChangesRequested').length,
  };
}

/* -------------------------------------------------------------------------- */
/* Quality — the figures that live on reviews rather than on tasks              */
/* -------------------------------------------------------------------------- */

/**
 * The developer's own quality picture: how their work was ranked, and how it
 * breaks down by customer.
 *
 * Split from `taskMetrics` because it needs a second input. A rank is recorded on
 * a REVIEW, not on a task, so none of this can be derived from the task list —
 * which is why the Analytics tab reads `/reviews?scope=mine` at all.
 *
 * `features/reports/domain/reportMetrics.ts` has near neighbours in
 * `rankDistribution` and `customerOverview`, and they are deliberately not reused
 * here. A feature may not import another feature (see `docs/frontend-standards.md`
 * §2), and the two answer different questions: reports aggregates everybody's work
 * by developer, reviewer and customer for an admin, while this aggregates one
 * developer's own and needs a per-customer average RANK that `customerOverview`
 * does not compute. Moving that module wholesale into `lib/` is the right call the
 * day a third caller appears, and premature today.
 */

export interface RankCount {
  rank: 1 | 2 | 3;
  count: number;
}

export interface CustomerPerformance {
  customerId: string;
  name: string;
  color: string;
  taskCount: number;
  approvedCount: number;
  /** Percentage of SUBMITTED tasks approved. `null` when none were submitted. */
  approvalRate: number | null;
  avgRank: number | null;
  avgCycles: number | null;
}

export interface DeveloperQualityMetrics {
  /** Mean rank across decided reviews. `null` until one has been decided. */
  avgRank: number | null;
  byRank: RankCount[];
  byCustomer: CustomerPerformance[];
}

/** A rank that has actually been awarded, and the task it was awarded to. */
interface AwardedRank {
  taskId: string;
  rank: 1 | 2 | 3;
}

/**
 * Only DECIDED reviews carry a verdict.
 *
 * A review still in progress has no rank worth counting, and folding it in as a
 * rank 1 would flatter the numbers — the same rule the admin reports apply.
 *
 * Projected to `{ taskId, rank }` rather than filtered in place, because a
 * `Review[]` still types `rank` as nullable however it was filtered — and every
 * caller downstream would need a non-null assertion to say what this function
 * has already guaranteed.
 */
function awardedRanks(reviews: readonly Review[]): AwardedRank[] {
  const awarded: AwardedRank[] = [];
  for (const review of reviews) {
    if (review.decision === null || review.rank === null) continue;
    awarded.push({ taskId: review.taskId, rank: review.rank });
  }
  return awarded;
}

export function developerQualityMetrics(
  items: readonly TaskListItem[],
  reviews: readonly Review[],
): DeveloperQualityMetrics {
  const awarded = awardedRanks(reviews);

  const byRank: RankCount[] = ([1, 2, 3] as const)
    .map((rank) => ({
      rank,
      count: awarded.filter((entry) => entry.rank === rank).length,
    }))
    .filter((entry) => entry.count > 0);

  // The rank of a task the caller does not own cannot appear here — the server
  // scopes the list — but the reviews are still keyed back to tasks so a customer
  // row only counts reviews of that customer's tasks.
  const taskCustomer = new Map(items.map((task) => [task.id, task.customerId]));

  const customerIds = [...new Set(items.map((task) => task.customerId))];

  const byCustomer = customerIds
    .map((customerId) => {
      const own = items.filter((task) => task.customerId === customerId);
      const first = own[0];
      const approved = own.filter((task) => task.status === 'Approved');
      const submitted = own.filter((task) => SUBMITTED_STATUSES.includes(task.status));
      const ownRanks = awarded
        .filter((entry) => taskCustomer.get(entry.taskId) === customerId)
        .map((entry) => entry.rank);

      return {
        customerId,
        name: first?.customerName ?? customerId,
        color: first?.customerColor ?? '',
        taskCount: own.length,
        approvedCount: approved.length,
        /*
         * Divided by SUBMITTED, matching the top-level Approval Rate card. One
         * denominator across the developer's own metrics is what stops a customer
         * row disagreeing with the headline figure above it.
         */
        approvalRate: submitted.length === 0 ? null : (approved.length / submitted.length) * 100,
        avgRank: mean(ownRanks),
        avgCycles: mean(approved.map((task) => task.countedCycle)),
      };
    })
    // Busiest first: the customer a developer works with most is the one they
    // came to this panel to read about.
    .sort((a, b) => b.taskCount - a.taskCount || a.name.localeCompare(b.name));

  return {
    avgRank: mean(awarded.map((entry) => entry.rank)),
    byRank,
    byCustomer,
  };
}
