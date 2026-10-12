import { describe, expect, it } from 'vitest';
import type { Review } from '@sdp/contracts';
import {
  decidedReviews,
  isRank,
  mean,
  round1,
  round2,
  turnaroundHours,
} from '@/lib/reviewStats.ts';

/**
 * The primitives three metrics modules share.
 *
 * Covered here rather than through each caller because that is the point of
 * promoting them: one definition, one set of assertions, and a change to the
 * meaning of "decided" cannot quietly diverge between the admin's league table
 * and a reviewer's own dashboard.
 */

function review(overrides: Partial<Review> = {}): Review {
  return {
    id: 'r1',
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

describe('decidedReviews', () => {
  it('keeps only reviews that reached a verdict', () => {
    const finished = decidedReviews([
      review({ id: 'a' }),
      review({ id: 'b', decision: null, decidedAt: null }),
    ]);

    expect(finished.map((entry) => entry.id)).toEqual(['a']);
  });

  it('drops an in-progress review rather than counting it as an approval', () => {
    // The reason this filter exists. A review still open has no verdict, and
    // folding it in would inflate approval rate and flatter every rank average.
    expect(decidedReviews([review({ decision: null, decidedAt: null })])).toEqual([]);
  });
});

describe('isRank', () => {
  it('narrows away the null', () => {
    const ranks = [1, null, 3].map((rank) => rank as 1 | 3 | null).filter(isRank);

    expect(ranks).toEqual([1, 3]);
  });
});

describe('mean', () => {
  it('averages', () => {
    expect(mean([1, 2, 3])).toBe(2);
  });

  it('returns null for an empty set, not zero', () => {
    // A mean of nothing is not zero — 0 would render as a real average of the
    // best possible rank. FL 2.4.3 wants an empty state instead.
    expect(mean([])).toBeNull();
  });
});

describe('rounding', () => {
  it('rounds to one and two places', () => {
    expect(round1(66.666)).toBe(66.7);
    expect(round2(1.666)).toBe(1.67);
  });
});

describe('turnaroundHours', () => {
  it('measures from opening the review to deciding it', () => {
    expect(
      turnaroundHours(
        review({
          createdAt: '2026-01-01T00:00:00.000Z',
          decidedAt: '2026-01-01T06:30:00.000Z',
        }),
      ),
    ).toBe(6.5);
  });

  it('is null for an undecided review, not zero', () => {
    // Zero would put every open review in the fastest turnaround bucket and drag
    // the average toward instant.
    expect(turnaroundHours(review({ decision: null, decidedAt: null }))).toBeNull();
  });

  it('clamps a backwards interval to zero', () => {
    // Clock skew between servers, not a metric bug. A negative duration would
    // drag an average below zero and read as broken arithmetic.
    expect(
      turnaroundHours(
        review({
          createdAt: '2026-01-02T00:00:00.000Z',
          decidedAt: '2026-01-01T00:00:00.000Z',
        }),
      ),
    ).toBe(0);
  });
});
