import { describe, expect, it } from 'vitest';
import type { Customer, Review, TaskListItem, TaskStatus, User } from '@sdp/contracts';
import {
  applyReportFilters,
  customerOverview,
  cycleDistribution,
  developerPerformance,
  rankDistribution,
  reviewedTaskCount,
  reviewerActivity,
  summarise,
  taskStatusDistribution,
  ALL_REPORT_VALUES,
} from '@/portals/code-review/features/reports/domain/reportMetrics.ts';

/**
 * The oracle for these tests is the wireframe's own arithmetic.
 *
 * Screen 01 shows 33 tasks — 3 Draft, 5 Submitted, 1 In Review, 6 Changes
 * Requested, 2 Approved, 16 Cancelled — and screen 04 reports "14.3% approval
 * rate" for exactly that set. 2 / (33 − 3 − 16) = 14.3%. Reproducing that number
 * from an independently-built fixture is what proves the denominator is right;
 * asserting whatever the implementation happens to return would prove nothing.
 */

const STATUS_LABELS: Record<TaskStatus, string> = {
  Draft: 'Draft',
  Submitted: 'Submitted',
  InReview: 'In Review',
  ChangesRequested: 'Changes Requested',
  ReSubmitted: 'Re-Submitted',
  Approved: 'Approved',
  Cancelled: 'Cancelled',
};

const RANK_LABELS = { 1: 'Rank 1', 2: 'Rank 2', 3: 'Rank 3' } as const;
const CYCLE_LABELS = { one: 'Cycle 1', two: 'Cycle 2', threePlus: 'Cycle 3+' };

let nextId = 0;

function task(overrides: Partial<TaskListItem> = {}): TaskListItem {
  nextId += 1;
  const id = `t-${String(nextId)}`;

  return {
    id,
    taskCode: `AASL-${String(nextId)}`,
    title: 'AASL - CRIM-1',
    crimId: 'CRIM-1',
    version: null,
    customerId: 'c-aasl',
    priority: 'Medium',
    status: 'Submitted',
    reviewRound: 1,
    countedCycle: 1,
    adjustedCycles: [],
    developerId: 'u-dev',
    reviewerId: 'u-rev',
    taskTypeIds: ['tt-customization'],
    isChecklistComplete: true,
    isHandedOver: false,
    noteToReviewer: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    submittedAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    customerName: 'AASL',
    customerCode: 'AASL',
    customerColor: '#84cc16',
    developerName: 'Dev One',
    reviewerName: 'Rev One',
    ...overrides,
  };
}

function review(overrides: Partial<Review> = {}): Review {
  nextId += 1;

  return {
    id: `rev-${String(nextId)}`,
    taskId: 't-1',
    reviewRound: 1,
    reviewerId: 'u-rev',
    reviewerName: 'Rev One',
    comments: [],
    generalCheck: [],
    findings: {
      incorrectCode: '',
      incompleteImplementation: '',
      sourceFormatting: '',
    },
    otherRemarks: '',
    feedbackSummary: '',
    rank: 1,
    screenshots: [],
    decision: 'Approved',
    decidedAt: '2026-05-02T00:00:00.000Z',
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-02T00:00:00.000Z',
    ...overrides,
  };
}

function user(overrides: Partial<User> = {}): User {
  return {
    id: 'u-dev',
    name: 'Dev One',
    email: 'dev.one@sebsaworld.com',
    roles: ['Developer'],
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** Screen 01's exact status mix. */
function screenOneTasks(): TaskListItem[] {
  const counts: [TaskStatus, number][] = [
    ['Draft', 3],
    ['Submitted', 5],
    ['InReview', 1],
    ['ChangesRequested', 6],
    ['Approved', 2],
    ['Cancelled', 16],
  ];

  return counts.flatMap(([status, count]) => Array.from({ length: count }, () => task({ status })));
}

describe('approval rate', () => {
  it('excludes drafts and cancellations from the denominator', () => {
    const tasks = screenOneTasks();

    expect(tasks).toHaveLength(33);
    expect(reviewedTaskCount(tasks)).toBe(14);
    expect(summarise(tasks, [], []).approvalRate).toBe(14.3);
  });

  /**
   * The negative control for the rule above. If the denominator were the whole
   * list, this number would be 6.1% and would not match the wireframe.
   */
  it('is NOT approved over total tasks', () => {
    expect(summarise(screenOneTasks(), [], []).approvalRate).not.toBe(6.1);
  });

  it('reports zero rather than dividing by zero when nothing reached review', () => {
    const summary = summarise([task({ status: 'Draft' })], [], []);
    expect(summary.approvalRate).toBe(0);
    expect(summary.isApprovalOnTarget).toBe(false);
  });
});

describe('averages', () => {
  it('averages counted cycles over approved tasks only', () => {
    const tasks = [
      task({ status: 'Approved', countedCycle: 1 }),
      task({ status: 'Approved', countedCycle: 3 }),
      // Still going round, so it is not yet "N cycles to approval".
      task({ status: 'ChangesRequested', countedCycle: 9 }),
    ];

    expect(summarise(tasks, [], []).avgCountedCycles).toBe(2);
    expect(summarise(tasks, [], []).avgReviewCycles).toBe(2);
  });

  it('averages rank over decided reviews only', () => {
    const reviews = [
      review({ rank: 1 }),
      review({ rank: 3 }),
      // In progress: no verdict yet, so it must not count as a good one.
      review({ rank: null, decision: null, decidedAt: null }),
      review({ rank: 3, decision: null, decidedAt: null }),
    ];

    expect(summarise([], reviews, []).avgQualityRank).toBe(2);
  });

  it('does not read an empty dataset as a perfect score', () => {
    const summary = summarise([], [], []);
    expect(summary.avgQualityRank).toBe(0);
    expect(summary.isQualityGood).toBe(false);
    expect(summary.isCycleCountHigh).toBe(false);
  });
});

describe('distributions', () => {
  it('reports status shares that sum to 100', () => {
    const slices = taskStatusDistribution(screenOneTasks(), STATUS_LABELS);

    expect(slices).toHaveLength(6);
    expect(Math.round(slices.reduce((sum, slice) => sum + slice.percent, 0))).toBe(100);
    expect(slices.find((slice) => slice.key === 'Cancelled')?.value).toBe(16);
  });

  it('omits statuses with no tasks rather than drawing a zero-width slice', () => {
    const slices = taskStatusDistribution([task({ status: 'Approved' })], STATUS_LABELS);
    expect(slices.map((slice) => slice.key)).toEqual(['Approved']);
  });

  it('buckets cycles as 1 / 2 / 3+ over approved tasks', () => {
    const tasks = [
      task({ status: 'Approved', countedCycle: 1 }),
      task({ status: 'Approved', countedCycle: 2 }),
      task({ status: 'Approved', countedCycle: 5 }),
      task({ status: 'Approved', countedCycle: 7 }),
      task({ status: 'ChangesRequested', countedCycle: 4 }),
    ];

    const slices = cycleDistribution(tasks, CYCLE_LABELS);
    expect(slices.map((slice) => [slice.key, slice.value])).toEqual([
      ['1', 1],
      ['2', 1],
      ['3+', 2],
    ]);
  });

  it('keeps zero counted cycles separate from cycle one', () => {
    const slices = cycleDistribution(
      [task({ status: 'Approved', reviewCycle: 0 }), task({ status: 'Approved', reviewCycle: 1 })],
      CYCLE_LABELS,
    );

    expect(slices.map((slice) => [slice.key, slice.value])).toEqual([
      ['0', 1],
      ['1', 1],
    ]);
  });

  it('ignores undecided reviews in the rank donut', () => {
    const slices = rankDistribution(
      [review({ rank: 1 }), review({ rank: 2, decision: null, decidedAt: null })],
      RANK_LABELS,
    );

    expect(slices).toEqual([{ key: '1', label: 'Rank 1', value: 1, percent: 100 }]);
  });
});

describe('breakdowns', () => {
  it('scores a developer on their own tasks only', () => {
    const mine = task({ status: 'Approved', developerId: 'u-dev' });
    const theirs = task({ status: 'Approved', developerId: 'u-other' });
    const rows = developerPerformance(
      [mine, theirs, task({ status: 'ChangesRequested', developerId: 'u-dev' })],
      [review({ taskId: mine.id, rank: 1 })],
      [user(), user({ id: 'u-other', name: 'Dev Two' })],
    );

    const dev = rows.find((row) => row.userId === 'u-dev');
    expect(dev?.taskCount).toBe(2);
    expect(dev?.approvedCount).toBe(1);
    expect(dev?.approvalRate).toBe(50);
    expect(dev?.avgRank).toBe(1);
  });

  it('leaves out people with nothing to report', () => {
    const rows = developerPerformance([], [], [user()]);
    expect(rows).toEqual([]);
  });

  it('calls a reviewer who mostly requests changes strict', () => {
    const rows = reviewerActivity(
      [
        review({ decision: 'ChangesRequested', rank: 3 }),
        review({ decision: 'ChangesRequested', rank: 2 }),
        review({ decision: 'ChangesRequested', rank: 3 }),
        review({ decision: 'Approved', rank: 1 }),
      ],
      [user({ id: 'u-rev', name: 'Rev One', roles: ['Reviewer'] })],
    );

    expect(rows[0]?.reviewCount).toBe(4);
    expect(rows[0]?.approvalRate).toBe(25);
    expect(rows[0]?.changesRate).toBe(75);
    expect(rows[0]?.tendency).toBe('strict');
  });

  it('ranks reviewers by how much they have reviewed, busiest first', () => {
    const rows = reviewerActivity(
      [
        review({ reviewerId: 'u-quiet', decision: 'Approved' }),
        review({ reviewerId: 'u-busy', decision: 'Approved' }),
        review({ reviewerId: 'u-busy', decision: 'Approved' }),
        // Undecided work is in progress, not activity — it must not inflate
        // anyone's count or their approval rate.
        review({ reviewerId: 'u-quiet', decision: null, decidedAt: null }),
      ],
      [
        user({ id: 'u-quiet', name: 'Rev Quiet', roles: ['Reviewer'] }),
        user({ id: 'u-busy', name: 'Rev Busy', roles: ['Reviewer'] }),
      ],
    );

    expect(rows.map((row) => row.userId)).toEqual(['u-busy', 'u-quiet']);
    expect(rows[1]?.reviewCount).toBe(1);
  });

  it('marks a developer whose work is mostly rejected as poor standing', () => {
    // 1 approved out of 4 reviewed is 25% — below half the 70% target, which is
    // the bottom band.
    const rows = developerPerformance(
      [
        task({ status: 'Approved', developerId: 'u-dev' }),
        task({ status: 'ChangesRequested', developerId: 'u-dev' }),
        task({ status: 'ChangesRequested', developerId: 'u-dev' }),
        task({ status: 'ChangesRequested', developerId: 'u-dev' }),
      ],
      [],
      [user()],
    );

    expect(rows[0]?.approvalRate).toBe(25);
    expect(rows[0]?.standing).toBe('poor');
  });
});

describe('customer overview', () => {
  function customer(overrides: Partial<Customer> = {}): Customer {
    return {
      id: 'c-aasl',
      name: 'AASL',
      code: 'AASL',
      description: '',
      color: '#84cc16',
      isActive: true,
      ...overrides,
    };
  }

  it('scores each customer over their own tasks and sorts by volume', () => {
    const aaslApproved = task({
      customerId: 'c-aasl',
      status: 'Approved',
      countedCycle: 3,
    });
    const tasks = [
      aaslApproved,
      task({ customerId: 'c-aasl', status: 'ChangesRequested' }),
      // Drafts never reached review, so they count towards the customer's task
      // total but must stay out of the approval-rate denominator.
      task({ customerId: 'c-aasl', status: 'Draft' }),
      task({ customerId: 'c-blom', status: 'Approved', countedCycle: 1 }),
    ];

    const rows = customerOverview(
      tasks,
      [review({ taskId: aaslApproved.id, rank: 2 })],
      [customer(), customer({ id: 'c-blom', name: 'BLOM', code: 'BLOM' })],
      { rank: RANK_LABELS, cycle: CYCLE_LABELS },
    );

    expect(rows.map((row) => row.customerId)).toEqual(['c-aasl', 'c-blom']);

    const aasl = rows[0];
    expect(aasl?.taskCount).toBe(3);
    expect(aasl?.approvedCount).toBe(1);
    // 1 approved / 2 reviewed, NOT 1 / 3 — the draft is excluded.
    expect(aasl?.approvalRate).toBe(50);
    expect(aasl?.avgCycles).toBe(3);
    // The donuts are cut from this customer's rows alone: BLOM's approval and
    // AASL's own draft must not appear in them.
    expect(aasl?.rankSlices).toEqual([{ key: '2', label: 'Rank 2', value: 1, percent: 100 }]);
    expect(aasl?.cycleSlices).toEqual([{ key: '3+', label: 'Cycle 3+', value: 1, percent: 100 }]);
  });

  it('leaves out customers with no tasks rather than drawing an empty row', () => {
    const rows = customerOverview([], [], [customer()], {
      rank: RANK_LABELS,
      cycle: CYCLE_LABELS,
    });

    expect(rows).toEqual([]);
  });

  it('reports no average cycle count when nothing has been approved yet', () => {
    const rows = customerOverview(
      [task({ customerId: 'c-aasl', status: 'Submitted' })],
      [],
      [customer()],
      { rank: RANK_LABELS, cycle: CYCLE_LABELS },
    );

    // `null`, not 0: "no data" and "approved on the first cycle" are different
    // answers and the screen renders them differently.
    expect(rows[0]?.avgCycles).toBeNull();
    expect(rows[0]?.approvalRate).toBe(0);
  });
});

describe('filters', () => {
  it('narrows by customer, status and start date together', () => {
    const tasks = [
      task({
        customerId: 'c-aasl',
        status: 'Approved',
        createdAt: '2026-05-10T00:00:00.000Z',
      }),
      task({
        customerId: 'c-blom',
        status: 'Approved',
        createdAt: '2026-05-10T00:00:00.000Z',
      }),
      task({
        customerId: 'c-aasl',
        status: 'Draft',
        createdAt: '2026-05-10T00:00:00.000Z',
      }),
      task({
        customerId: 'c-aasl',
        status: 'Approved',
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    ];

    const visible = applyReportFilters(tasks, {
      from: '2026-05-01T00:00:00.000Z',
      customerId: 'c-aasl',
      status: 'Approved',
    });

    expect(visible).toHaveLength(1);
  });

  it('passes everything through when nothing is selected', () => {
    const tasks = screenOneTasks();
    expect(
      applyReportFilters(tasks, {
        from: '',
        customerId: ALL_REPORT_VALUES,
        status: ALL_REPORT_VALUES,
      }),
    ).toHaveLength(33);
  });
});
