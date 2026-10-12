import { describe, expect, it } from 'vitest';
import type { Review, TaskListItem } from '@sdp/contracts';
import {
  decisionMix,
  rankGivenDistribution,
  reviewActivityByWeek,
  reviewerSummary,
  reviewsByCustomer,
  tendencyFor,
  turnaroundBuckets,
} from '@/portals/code-review/features/reviews/domain/reviewerMetrics.ts';

/**
 * Reviewer Analytics, asserted as arithmetic rather than through a chart.
 *
 * The failure modes here are silent: an off-by-one in the week bucketing draws a
 * plausible-looking trend on the wrong dates, and a turnaround that counted
 * undecided reviews would show a flatteringly fast average with nothing on
 * screen to contradict it.
 */

/** Decided and approved, one day of turnaround, unless the caller says otherwise. */
function review(overrides: Partial<Review> = {}): Review {
  return {
    id: `r-${String(Math.random())}`,
    taskId: 't1',
    reviewRound: 1,
    reviewerId: 'u-reviewer',
    reviewerName: 'Reviewer',
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
    createdAt: '2026-03-02T00:00:00.000Z',
    decidedAt: '2026-03-03T00:00:00.000Z',
    updatedAt: '2026-03-03T00:00:00.000Z',
    ...overrides,
  };
}

/** A review decided `hours` after it was opened, on a given day. */
function timed(day: string, hours: number, overrides: Partial<Review> = {}): Review {
  const decided = new Date(`${day}T12:00:00.000Z`);
  const created = new Date(decided.getTime() - hours * 60 * 60 * 1000);
  return review({
    createdAt: created.toISOString(),
    decidedAt: decided.toISOString(),
    ...overrides,
  });
}

function task(overrides: Partial<TaskListItem> = {}): TaskListItem {
  return {
    id: 't1',
    taskCode: 'AASL-001',
    title: 'AASL - CRIM-1',
    crimId: 'CRIM-1',
    version: null,
    customerId: 'c-aasl',
    priority: 'Medium',
    status: 'Approved',
    reviewRound: 1,
    countedCycle: 1,
    adjustedCycles: [],
    developerId: 'u-dev',
    reviewerId: 'u-reviewer',
    taskTypeIds: ['tt-customization'],
    isChecklistComplete: true,
    isHandedOver: false,
    noteToReviewer: null,
    createdAt: '2026-03-01T00:00:00.000Z',
    submittedAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
    customerName: 'AASL',
    customerCode: 'AASL',
    customerColor: '#84cc16',
    developerName: 'Dev',
    reviewerName: 'Reviewer',
    ...overrides,
  };
}

describe('reviewerSummary', () => {
  it('reports nothing rather than zero before any review is decided', () => {
    const summary = reviewerSummary([], 0);

    expect(summary.completed).toBe(0);
    // The distinction that matters: `null` renders as an empty state, `0` would
    // claim every review this person gave was rejected.
    expect(summary.approvalRate).toBeNull();
    expect(summary.avgTurnaroundHours).toBeNull();
    expect(summary.avgRankGiven).toBeNull();
    expect(summary.tendency).toBe('none');
  });

  it('counts only decided reviews, and carries the open queue separately', () => {
    const summary = reviewerSummary(
      [
        review(),
        review({ decision: 'ChangesRequested', rank: 2 }),
        review({ decision: null, decidedAt: null }),
      ],
      4,
    );

    expect(summary.completed).toBe(2);
    expect(summary.changesRequested).toBe(1);
    expect(summary.approvalRate).toBe(50);
    // Queue depth comes from the task list, not the reviews — an assigned task
    // has no review row until the reviewer opens one.
    expect(summary.inQueue).toBe(4);
  });

  it('excludes undecided reviews from the turnaround average', () => {
    // An open review has no elapsed time yet; counting it as zero would report
    // an instant turnaround the reviewer never achieved.
    const summary = reviewerSummary(
      [timed('2026-03-03', 10), review({ decision: null, decidedAt: null })],
      0,
    );

    expect(summary.avgTurnaroundHours).toBe(10);
  });

  it('averages the ranks it awarded', () => {
    const summary = reviewerSummary(
      [review({ rank: 1 }), review({ rank: 2, decision: 'ChangesRequested' })],
      0,
    );

    expect(summary.avgRankGiven).toBe(1.5);
  });
});

describe('tendencyFor', () => {
  it('labels the grading profile from the approval share', () => {
    expect(tendencyFor(10, 80)).toBe('lenient');
    expect(tendencyFor(10, 50)).toBe('balanced');
    expect(tendencyFor(10, 10)).toBe('strict');
  });

  it('has no opinion without reviews', () => {
    expect(tendencyFor(0, null)).toBe('none');
    expect(tendencyFor(0, 100)).toBe('none');
  });

  it('matches the thresholds the admin league table uses', () => {
    // `reportMetrics.tendencyFor` uses the same 70 / 30 boundaries. A reviewer's
    // own page calling them "balanced" while the admin's page says "lenient" on
    // the same data is the defect this pins down.
    expect(tendencyFor(1, 70)).toBe('lenient');
    expect(tendencyFor(1, 69.9)).toBe('balanced');
    expect(tendencyFor(1, 30)).toBe('balanced');
    expect(tendencyFor(1, 29.9)).toBe('strict');
  });
});

describe('reviewActivityByWeek', () => {
  it('buckets decisions into the Monday that starts their week', () => {
    // 2026-03-03 is a Tuesday; 2026-03-07 the Saturday after. Both belong to the
    // week beginning Monday 2026-03-02.
    const weeks = reviewActivityByWeek([timed('2026-03-03', 2), timed('2026-03-07', 2)]);

    expect(weeks).toHaveLength(1);
    expect(weeks[0]?.weekStart).toBe('2026-03-02T00:00:00.000Z');
    expect(weeks[0]?.total).toBe(2);
  });

  it('puts Sunday in the week that began six days earlier', () => {
    // The off-by-one this guards: `getUTCDay()` is 0 on Sunday, so the naive
    // arithmetic starts a NEW week on Sunday and splits a weekend in two.
    const weeks = reviewActivityByWeek([timed('2026-03-08', 2)]);

    expect(weeks[0]?.weekStart).toBe('2026-03-02T00:00:00.000Z');
  });

  it('splits each week by verdict', () => {
    const weeks = reviewActivityByWeek([
      timed('2026-03-03', 2),
      timed('2026-03-04', 2, { decision: 'ChangesRequested', rank: 2 }),
    ]);

    expect(weeks[0]?.approved).toBe(1);
    expect(weeks[0]?.changesRequested).toBe(1);
  });

  it('fills quiet weeks with zeroes instead of skipping them', () => {
    /*
     * The whole reason this function gap-fills. Without it a fortnight of
     * silence collapses to one x-step and the chart draws continuous activity
     * across a gap that is the most interesting thing on it.
     */
    const weeks = reviewActivityByWeek([timed('2026-03-03', 2), timed('2026-03-24', 2)]);

    expect(weeks.map((week) => week.total)).toEqual([1, 0, 0, 1]);
  });

  it('caps the window at the most recent weeks', () => {
    const weeks = reviewActivityByWeek([timed('2026-01-06', 2), timed('2026-03-03', 2)], 4);

    expect(weeks).toHaveLength(4);
    expect(weeks[weeks.length - 1]?.weekStart).toBe('2026-03-02T00:00:00.000Z');
  });

  it('returns nothing at all when no review has been decided', () => {
    expect(reviewActivityByWeek([review({ decision: null, decidedAt: null })])).toEqual([]);
  });

  it('skips a decided review that somehow carries no decision timestamp', () => {
    // `decision` and `decidedAt` are independently nullable on the schema, so
    // this pairing is representable even though the handlers always write both.
    // Without the guard `weekStartOf(null)` would bucket it at the epoch and
    // stretch the axis back to 1970.
    expect(reviewActivityByWeek([review({ decision: 'Approved', decidedAt: null })])).toEqual([]);
  });
});

describe('turnaroundBuckets', () => {
  it('places each review in the band its elapsed time falls in', () => {
    const buckets = turnaroundBuckets([
      timed('2026-03-03', 1),
      timed('2026-03-03', 12),
      timed('2026-03-03', 30),
      timed('2026-03-03', 72),
      timed('2026-03-03', 200),
    ]);

    expect(buckets.map((bucket) => bucket.count)).toEqual([1, 1, 1, 1, 1]);
  });

  it('emits every band even when empty', () => {
    // The shape of the distribution IS the message. A missing bar reads as a
    // missing category rather than as "never that slow".
    const buckets = turnaroundBuckets([timed('2026-03-03', 12)]);

    expect(buckets).toHaveLength(5);
    expect(buckets.map((bucket) => bucket.id)).toEqual([
      'under4h',
      'under24h',
      'under2d',
      'under5d',
      'over5d',
    ]);
  });

  it('puts a boundary value in the upper band', () => {
    // Exactly 24h is "under 2 days", not "under 24 hours" — the comparison is
    // `<`, so the band names stay truthful.
    expect(turnaroundBuckets([timed('2026-03-03', 24)])[2]?.count).toBe(1);
  });

  it('ignores a decided review with no decision timestamp', () => {
    // Same representable-but-unwritten pairing as above. Counting it would put a
    // review of unknown duration in the fastest band.
    const buckets = turnaroundBuckets([review({ decision: 'Approved', decidedAt: null })]);

    expect(buckets.every((bucket) => bucket.count === 0)).toBe(true);
  });
});

describe('decisionMix and rankGivenDistribution', () => {
  it('counts verdicts, dropping the empty side', () => {
    expect(decisionMix([review(), review()])).toEqual([{ decision: 'Approved', count: 2 }]);
  });

  it('counts the ranks awarded, in rank order', () => {
    const ranks = rankGivenDistribution([
      review({ rank: 3, decision: 'ChangesRequested' }),
      review({ rank: 1 }),
      review({ rank: 1 }),
    ]);

    expect(ranks).toEqual([
      { rank: 1, count: 2 },
      { rank: 3, count: 1 },
    ]);
  });

  it('ignores an undecided review in both', () => {
    const open = review({ decision: null, decidedAt: null, rank: 2 });

    expect(decisionMix([open])).toEqual([]);
    expect(rankGivenDistribution([open])).toEqual([]);
  });
});

describe('reviewsByCustomer', () => {
  it('joins reviews to customers through the task, busiest first', () => {
    const tasks = [
      task({ id: 't-a', customerId: 'c-aasl', customerName: 'AASL' }),
      task({ id: 't-b', customerId: 'c-aim', customerName: 'AIM' }),
    ];
    const reviews = [
      review({ taskId: 't-a' }),
      review({ taskId: 't-a', decision: 'ChangesRequested', rank: 2 }),
      review({ taskId: 't-b' }),
    ];

    const rows = reviewsByCustomer(reviews, tasks);

    expect(rows.map((row) => row.name)).toEqual(['AASL', 'AIM']);
    expect(rows[0]?.reviewCount).toBe(2);
    expect(rows[0]?.approvalRate).toBe(50);
    expect(rows[0]?.avgRankGiven).toBe(1.5);
  });

  it('drops a review whose task is not in the list', () => {
    // Happens only when the two queries disagree mid-refetch. A phantom
    // "Unknown" customer row on a personal dashboard is worse than a total that
    // is briefly one short.
    expect(reviewsByCustomer([review({ taskId: 't-missing' })], [task({ id: 't-a' })])).toEqual([]);
  });

  it('averages turnaround per customer', () => {
    const rows = reviewsByCustomer(
      [timed('2026-03-03', 4, { taskId: 't-a' }), timed('2026-03-04', 8, { taskId: 't-a' })],
      [task({ id: 't-a' })],
    );

    expect(rows[0]?.avgTurnaroundHours).toBe(6);
  });

  it('reports no rank rather than zero when none was awarded', () => {
    // A decision without a rank is representable, and `0` would render as a
    // better-than-perfect grade on a 1-to-3 scale.
    const rows = reviewsByCustomer([review({ taskId: 't-a', rank: null })], [task({ id: 't-a' })]);

    expect(rows[0]?.avgRankGiven).toBeNull();
  });

  it('breaks a tie on review count alphabetically', () => {
    // Otherwise two equally busy customers swap places between renders, which
    // reads as the panel reshuffling itself for no reason.
    const rows = reviewsByCustomer(
      [review({ taskId: 't-b' }), review({ taskId: 't-a' })],
      [
        task({ id: 't-a', customerId: 'c-zeta', customerName: 'Zeta' }),
        task({ id: 't-b', customerId: 'c-alpha', customerName: 'Alpha' }),
      ],
    );

    expect(rows.map((row) => row.name)).toEqual(['Alpha', 'Zeta']);
  });
});
