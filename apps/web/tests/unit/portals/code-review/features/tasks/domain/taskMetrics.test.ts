import { describe, expect, it } from 'vitest';
import type { Review, TaskListItem, TaskStatus } from '@sdp/contracts';
import {
  developerQualityMetrics,
  submittedForAnalytics,
  taskMetrics,
} from '@/portals/code-review/features/tasks/domain/taskMetrics.ts';

/** A decided review, unless the caller says otherwise. */
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
    decidedAt: '2026-01-02T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}

function task(status: TaskStatus, cycle = 1): TaskListItem {
  return {
    id: `t-${status}-${String(cycle)}-${String(Math.random())}`,
    taskCode: 'AASL-001',
    title: 'AASL - CRIM-1',
    crimId: 'CRIM-1',
    version: null,
    customerId: 'c-aasl',
    priority: 'Medium',
    status,
    reviewRound: cycle,
    countedCycle: cycle,
    adjustedCycles: [],
    developerId: 'u-dev',
    reviewerId: null,
    taskTypeIds: ['tt-customization'],
    isChecklistComplete: true,
    isHandedOver: false,
    noteToReviewer: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    submittedAt: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
    customerName: 'AASL',
    customerCode: 'AASL',
    customerColor: '#16a34a',
    developerName: 'Dev',
    reviewerName: null,
  };
}

describe('submittedForAnalytics', () => {
  it('drops drafts', () => {
    const filtered = submittedForAnalytics([task('Draft'), task('Submitted'), task('Approved')]);

    expect(filtered.map((entry) => entry.status)).toEqual(['Submitted', 'Approved']);
  });

  it('keeps cancelled tasks', () => {
    // Only Draft is excluded. A cancelled task WAS submitted and reviewed, and
    // dropping it would quietly raise the approval rate by shrinking the
    // denominator — the exact flattery the `null` empty-state rule exists to
    // prevent elsewhere in this file.
    expect(submittedForAnalytics([task('Cancelled')])).toHaveLength(1);
  });

  it('leaves a draft-free list untouched', () => {
    const items = [task('Submitted'), task('InReview')];

    expect(submittedForAnalytics(items)).toEqual(items);
  });

  it('feeds the metrics a status distribution with no Draft slice', () => {
    // The whole point, asserted end to end: what the Analytics page actually
    // does is `taskMetrics(submittedForAnalytics(tasks))`, and a Draft slice in
    // that donut is the defect this was written to fix.
    const metrics = taskMetrics(
      submittedForAnalytics([task('Draft'), task('Draft'), task('Approved')]),
    );

    expect(metrics.total).toBe(1);
    expect(metrics.byStatus).toEqual([{ status: 'Approved', count: 1 }]);
  });
});

describe('taskMetrics', () => {
  it('reports nothing rather than zero for an empty workspace (FL 2.4.3)', () => {
    const metrics = taskMetrics([]);

    expect(metrics.total).toBe(0);
    expect(metrics.byStatus).toEqual([]);
    expect(metrics.byCycle).toEqual([]);
    // The distinction that matters: `null` means "no data", which the UI renders
    // as an empty state. `0` would claim every submission was rejected.
    expect(metrics.approvalRate).toBeNull();
    expect(metrics.averageCycles).toBeNull();
  });

  it('omits statuses with no tasks so the donut has no empty slices', () => {
    const metrics = taskMetrics([task('Draft'), task('Draft'), task('Approved')]);

    expect(metrics.byStatus).toEqual([
      { status: 'Draft', count: 2 },
      { status: 'Approved', count: 1 },
    ]);
  });

  it('counts a draft as unsubmitted, so it cannot drag the approval rate down', () => {
    const metrics = taskMetrics([task('Draft'), task('Approved')]);

    expect(metrics.submitted).toBe(1);
    expect(metrics.approved).toBe(1);
    expect(metrics.approvalRate).toBe(100);
  });

  it('averages cycles over approved tasks only', () => {
    // The In Review task sits at cycle 5 and must not skew the average, which
    // describes how many rounds approval took.
    const metrics = taskMetrics([task('Approved', 1), task('Approved', 3), task('InReview', 5)]);

    expect(metrics.averageCycles).toBe(2);
  });

  it('buckets cycles as 1, 2 and 3+', () => {
    const metrics = taskMetrics([
      task('Approved', 1),
      task('Approved', 2),
      task('Approved', 4),
      task('Approved', 7),
    ]);

    expect(metrics.byCycle).toEqual([
      { label: '1', count: 1 },
      { label: '2', count: 1 },
      { label: '3+', count: 2 },
    ]);
  });

  it('reports direct approval as zero counted cycles', () => {
    const metrics = taskMetrics([task('Approved', 0)]);

    expect(metrics.byCycle).toEqual([{ label: '0', count: 1 }]);
    expect(metrics.averageCycles).toBe(0);
  });

  it('buckets APPROVED tasks only, matching "iterations needed for approval"', () => {
    /*
     * The chart this feeds is captioned "Iterations needed for approval" and its
     * empty state reads "No approved tasks yet", but it used to bucket every
     * non-Draft task by its CURRENT cycle. A task sitting on cycle 3 and still
     * going has not needed 3 cycles for approval, and a cancelled one never
     * will — so a developer with no approvals at all saw a full distribution.
     *
     * It also disagreed with `reportMetrics.cycleDistribution`, which has always
     * counted approvals only: the same named metric came out differently
     * depending on which dashboard you were standing on.
     */
    const metrics = taskMetrics([
      task('Approved', 1),
      task('Approved', 2),
      task('InReview', 3),
      task('ChangesRequested', 4),
      task('Cancelled', 5),
    ]);

    expect(metrics.byCycle).toEqual([
      { label: '1', count: 1 },
      { label: '2', count: 1 },
    ]);
  });

  it('reports no cycle distribution at all when nothing has been approved', () => {
    // The empty array is what makes `DonutChart` render its "No approved tasks
    // yet" state rather than a ring built from unfinished work.
    const metrics = taskMetrics([task('InReview', 2), task('ChangesRequested', 3)]);

    expect(metrics.byCycle).toEqual([]);
  });

  it('counts only tasks currently sent back as Changes Requested', () => {
    // Not "has ever been sent back": a task the developer has already resubmitted
    // needs nothing from them, and counting it would keep a resolved item on the
    // card that says how much work is outstanding.
    const metrics = taskMetrics([
      task('ChangesRequested'),
      task('ChangesRequested'),
      task('ReSubmitted', 2),
      task('Approved'),
    ]);

    expect(metrics.changesRequested).toBe(2);
  });
});

describe('developerQualityMetrics', () => {
  it('reports nothing rather than zero before any review is decided (FL 2.4.3)', () => {
    const metrics = developerQualityMetrics([task('Submitted')], []);

    expect(metrics.avgRank).toBeNull();
    expect(metrics.byRank).toEqual([]);
  });

  it('averages and buckets ranks across decided reviews', () => {
    const metrics = developerQualityMetrics(
      [task('Approved'), task('Approved')],
      [review({ rank: 1 }), review({ rank: 3 })],
    );

    expect(metrics.avgRank).toBe(2);
    expect(metrics.byRank).toEqual([
      { rank: 1, count: 1 },
      { rank: 3, count: 1 },
    ]);
  });

  it('ignores a review that has not been decided yet', () => {
    // An in-progress review has no verdict. Folding it in as a rank 1 would
    // flatter the numbers — the same rule the admin reports apply.
    const metrics = developerQualityMetrics(
      [task('InReview')],
      [review({ rank: 3 }), review({ rank: 1, decision: null })],
    );

    expect(metrics.avgRank).toBe(3);
    expect(metrics.byRank).toEqual([{ rank: 3, count: 1 }]);
  });

  it('breaks performance down per customer, busiest first', () => {
    const aasl = { customerId: 'c-aasl', customerName: 'AASL' };
    const blom = { customerId: 'c-blom', customerName: 'BLOM' };

    const one = { ...task('Approved'), ...aasl, id: 't1' };
    const two = { ...task('Submitted'), ...aasl, id: 't2' };
    const three = { ...task('Approved', 3), ...blom, id: 't3' };

    const metrics = developerQualityMetrics(
      [one, two, three],
      [review({ rank: 1, taskId: 't1' }), review({ rank: 3, taskId: 't3' })],
    );

    expect(metrics.byCustomer.map((row) => row.name)).toEqual(['AASL', 'BLOM']);

    const [first, second] = metrics.byCustomer;
    expect(first?.taskCount).toBe(2);
    expect(first?.approvedCount).toBe(1);
    // One approved out of two submitted — the same denominator the headline
    // Approval Rate card uses, so the two cannot disagree.
    expect(first?.approvalRate).toBe(50);
    expect(first?.avgRank).toBe(1);
    expect(first?.avgCycles).toBe(1);

    expect(second?.avgCycles).toBe(3);
  });

  it('reports N/A rather than 0% for a customer with nothing submitted', () => {
    const metrics = developerQualityMetrics([task('Draft')], []);

    const [only] = metrics.byCustomer;
    expect(only?.taskCount).toBe(1);
    // A rate with no denominator is not zero, it is unknown — and the reference
    // renders it as N/A.
    expect(only?.approvalRate).toBeNull();
    expect(only?.avgRank).toBeNull();
    expect(only?.avgCycles).toBeNull();
  });

  it('never counts a review against a customer that did not own the task', () => {
    const one = {
      ...task('Approved'),
      customerId: 'c-aasl',
      customerName: 'AASL',
      id: 't1',
    };
    const two = {
      ...task('Approved'),
      customerId: 'c-blom',
      customerName: 'BLOM',
      id: 't2',
    };

    const metrics = developerQualityMetrics([one, two], [review({ rank: 3, taskId: 't2' })]);

    const aasl = metrics.byCustomer.find((row) => row.name === 'AASL');
    const blom = metrics.byCustomer.find((row) => row.name === 'BLOM');

    expect(aasl?.avgRank).toBeNull();
    expect(blom?.avgRank).toBe(3);
  });
});
