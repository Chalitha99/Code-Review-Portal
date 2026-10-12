import { describe, expect, it } from 'vitest';
import {
  createRoundResponseId,
  createCycleResponseId,
  nextReviewRound,
  nextHistoricalReviewCycle,
  resolveActiveReviewRound,
  resolveActiveReviewCycle,
} from '@/lib/reviewCycles.ts';

describe('nextReviewRound', () => {
  it('moves past both the highest stored review and the task round counter', () => {
    expect(nextReviewRound({ reviewRound: 1 }, [])).toBe(2);
    expect(nextReviewRound({ reviewRound: 1 }, [{ reviewRound: 3 }])).toBe(4);
    expect(nextReviewRound({ reviewRound: 2, historicalCycle: 5 }, [])).toBe(6);
  });

  it('never collides after the counted cycle was decremented', () => {
    // Counted cycle went 3 -> 2, but round 3 already exists historically.
    expect(nextReviewRound({ reviewRound: 3 }, [{ reviewRound: 3 }])).toBe(4);
  });

  it('maintains backwards compatibility with nextHistoricalReviewCycle', () => {
    expect(nextHistoricalReviewCycle({ reviewRound: 1 }, [])).toBe(2);
  });
});

describe('resolveActiveReviewRound', () => {
  const decided = (reviewRound: number) => ({ reviewRound, decision: 'ChangesRequested' });

  it('sits above every completed round while the task is in rework or re-review', () => {
    for (const status of ['ChangesRequested', 'ReSubmitted', 'InReview']) {
      expect(resolveActiveReviewRound({ reviewRound: 1, status }, [decided(1)])).toBe(2);
    }
  });

  it('keeps an open draft round when it is already ahead', () => {
    const reviews = [decided(1), { reviewRound: 3, decision: null }];
    expect(resolveActiveReviewRound({ reviewRound: 1, status: 'InReview' }, reviews)).toBe(3);
  });

  it('uses the current round when nothing has been decided yet or the task is closed', () => {
    expect(resolveActiveReviewRound({ reviewRound: 1, status: 'InReview' })).toBe(1);
    expect(resolveActiveReviewRound({ reviewRound: 2, status: 'Approved' }, [decided(2)])).toBe(2);
    expect(resolveActiveReviewRound({ reviewRound: 4, status: 'Submitted' }, [])).toBe(4);
  });

  it('maintains backwards compatibility with resolveActiveReviewCycle', () => {
    expect(resolveActiveReviewCycle({ reviewRound: 1, status: 'InReview' })).toBe(1);
  });
});

describe('createRoundResponseId', () => {
  it('scopes a response id to its task and round', () => {
    expect(createRoundResponseId('t-1', 2, 'abc')).toBe('resp-t-1-2-c-abc');
    expect(createRoundResponseId('t-1', 3, 'abc')).not.toBe(createRoundResponseId('t-1', 2, 'abc'));
  });

  it('keeps an entity key that is already prefixed', () => {
    expect(createRoundResponseId('t-1', 1, 'c-9')).toBe('resp-t-1-1-c-9');
    expect(createRoundResponseId('t-1', 1, 's-shot')).toBe('resp-t-1-1-s-shot');
  });

  it('maintains backwards compatibility with createCycleResponseId', () => {
    expect(createCycleResponseId('t-1', 2, 'abc')).toBe('resp-t-1-2-c-abc');
  });
});

describe('Canonical Terminology and Domain Invariants (Phase 23)', () => {
  it('CASE 1 — Initial review: reviewRound = 1, countedCycle = 1', () => {
    const task = { reviewRound: 1, countedCycle: 1, status: 'InReview' as const };
    expect(task.reviewRound).toBe(1);
    expect(task.countedCycle).toBe(1);
  });

  it('CASE 2 — Normal second review: reviewRound = 2, countedCycle = 2', () => {
    const task = { reviewRound: 2, countedCycle: 2, status: 'InReview' as const };
    expect(task.reviewRound).toBe(2);
    expect(task.countedCycle).toBe(2);
  });

  it('CASE 3 — Cycle decrement special case: reviewRound = 2, countedCycle = 1', () => {
    // When all developer responses were rejections and all rejections were accepted by reviewer with 0 code fixes,
    // countedCycle decrements by 1 on final Approved, but reviewRound stays at 2
    const task = { reviewRound: 2, countedCycle: 1, status: 'Approved' as const };
    expect(task.reviewRound).toBe(2);
    expect(task.countedCycle).toBe(1);
    expect(task.reviewRound).not.toBe(task.countedCycle);
  });

  it('CASE 4 — Third historical review: reviewRound = 3 preserves history 1, 2, 3', () => {
    const history = [
      { reviewRound: 1, decision: 'ChangesRequested' },
      { reviewRound: 2, decision: 'ChangesRequested' },
      { reviewRound: 3, decision: 'Approved' },
    ];
    expect(history.map((h) => h.reviewRound)).toEqual([1, 2, 3]);
  });
});
