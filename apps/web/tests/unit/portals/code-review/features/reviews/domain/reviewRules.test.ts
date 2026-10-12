import { describe, expect, it } from 'vitest';
import type { ReviewComment, ReviewDraft } from '@sdp/contracts';
import {
  canApprove,
  getRankLabel,
  hasPreviousReviewerComments,
  createCycleResponseId,
  isCommentFromOtherReviewer,
  isCommentOwnedBy,
  isDefectRank,
  nextHistoricalReviewCycle,
  nextReviewCycle,
  resolveActiveReviewCycle,
  reviewBlockers,
} from '@/portals/code-review/features/reviews/domain/reviewRules.ts';

/**
 * FL 2.9.2.5-01 is the most consequential rule in the product — it is what stops
 * a reviewer approving code they have just recorded serious defects against — so
 * it is tested from every direction rather than assumed from a disabled button.
 */

function comment(
  text = 'Fix input validation',
  id = 'rc-1',
  reviewerId?: string,
  reviewSessionId?: string,
): ReviewComment {
  return {
    id,
    reviewRound: 1,
    reviewerId,
    reviewerName: reviewerId ? `Reviewer ${reviewerId}` : undefined,
    reviewSessionId,
    text,
    screenshots: [],
    createdAt: new Date().toISOString(),
  };
}

function draft(overrides: Partial<ReviewDraft> = {}): ReviewDraft {
  return {
    rank: 1,
    comments: [],
    generalCheck: [],
    findings: { incorrectCode: '', incompleteImplementation: '', sourceFormatting: '' },
    otherRemarks: '',
    feedbackSummary: '',
    previousFeedbackReviewNote: null,
    ...overrides,
  };
}

function input(
  overrides: Partial<ReviewDraft> = {},
  hasPendingRejections = false,
  currentUserId?: string,
  currentReviewSessionId?: string,
) {
  return { draft: draft(overrides), hasPendingRejections, currentUserId, currentReviewSessionId };
}

describe('isDefectRank', () => {
  it('treats Rank 2 and Rank 3 as defect ranks, Rank 1 as clean', () => {
    expect(isDefectRank(1)).toBe(false);
    expect(isDefectRank(2)).toBe(true);
    expect(isDefectRank(3)).toBe(true);
    expect(isDefectRank(null)).toBe(false);
  });
});

describe('Rank 1 Decision Rules', () => {
  it('permits Approve at Rank 1 when 0 review comments exist', () => {
    const clean = input({ rank: 1, comments: [] });
    expect(reviewBlockers(clean, 'Approved')).toEqual([]);
    expect(canApprove(clean)).toBe(true);
  });

  it('permits Approve at Rank 1 even if review comments exist', () => {
    const withComment = input({ rank: 1, comments: [comment()] });
    expect(reviewBlockers(withComment, 'Approved')).toEqual([]);
    expect(canApprove(withComment)).toBe(true);
  });

  it('blocks Request Changes at Rank 1', () => {
    const rank1 = input({ rank: 1, comments: [] });
    expect(reviewBlockers(rank1, 'ChangesRequested')).toContain('requestChangesBlockedByRank1');
  });
});

describe('Rank 2 and Rank 3 Decision Rules', () => {
  it.each([2, 3] as const)('BLOCKS Approve at Rank %i, regardless of comments', (rank) => {
    const withComment = input({ rank, comments: [comment()] });
    expect(reviewBlockers(withComment, 'Approved')).toContain('approveBlockedByRank');
    expect(canApprove(withComment)).toBe(false);
  });

  it.each([2, 3] as const)('blocks Request Changes at Rank %i when no comments exist', (rank) => {
    const noComments = input({ rank, comments: [] });
    expect(reviewBlockers(noComments, 'ChangesRequested')).toEqual(['commentsRequired']);
  });

  it.each([2, 3] as const)(
    'blocks Request Changes at Rank %i if any comment has empty text',
    (rank) => {
      const emptyCommentDraft = input({ rank, comments: [comment('   ')] });
      expect(reviewBlockers(emptyCommentDraft, 'ChangesRequested')).toEqual(['emptyComment']);
    },
  );

  it.each([2, 3] as const)(
    'permits Request Changes at Rank %i with valid comment and NO screenshots',
    (rank) => {
      const validNoScreenshot = input({ rank, comments: [comment('Valid feedback')] });
      expect(reviewBlockers(validNoScreenshot, 'ChangesRequested')).toEqual([]);
    },
  );

  it.each([2, 3] as const)(
    'permits Request Changes at Rank %i with multiple valid comments',
    (rank) => {
      const multi = input({
        rank,
        comments: [comment('First issue', 'rc-1'), comment('Second issue', 'rc-2')],
      });
      expect(reviewBlockers(multi, 'ChangesRequested')).toEqual([]);
    },
  );
});

describe('Rank Required Validation', () => {
  it('requires a rank before either decision', () => {
    const noRank = input({ rank: null });
    expect(reviewBlockers(noRank, 'Approved')).toEqual(['rankRequired']);
    expect(reviewBlockers(noRank, 'ChangesRequested')).toEqual(['rankRequired']);
  });
});

describe('Pending Adjudication & Unresolved Findings Decision Gate', () => {
  it('blocks decision when developer responses are still pending reviewer verdict', () => {
    const pending = {
      draft: draft({ rank: 1, comments: [] }),
      hasPendingAdjudication: true,
    };
    expect(reviewBlockers(pending, 'Approved')).toContain('pendingAdjudication');
    expect(reviewBlockers(pending, 'Approved')).toContain('pendingRejectionAdjudication');
    expect(reviewBlockers(pending, 'ChangesRequested')).toContain('pendingAdjudication');
    expect(canApprove(pending)).toBe(false);
  });

  it('blocks Approve at Rank 1 when findings remain Not Resolved or Not Accepted (Overruled)', () => {
    const unresolved = {
      draft: draft({ rank: 1, comments: [] }),
      hasUnresolvedIssues: true,
    };
    expect(reviewBlockers(unresolved, 'Approved')).toContain('unresolvedResponsesBlockApproval');
    expect(canApprove(unresolved)).toBe(false);

    // But permits Request Changes at Rank 2/3
    const changes = {
      draft: draft({ rank: 2, comments: [comment('Address remaining defect')] }),
      hasUnresolvedIssues: true,
    };
    expect(reviewBlockers(changes, 'ChangesRequested')).toEqual([]);
  });
});

describe('Cycle Counting and Historical Monotonicity', () => {
  it('does not advance the effective cycle on approval', () => {
    expect(nextReviewCycle(2, 'Approved')).toBe(2);
  });

  it('advances on Request Changes', () => {
    expect(nextReviewCycle(1, 'ChangesRequested')).toBe(2);
  });

  it('nextHistoricalReviewCycle derives strictly monotonic sequence from highest existing cycle', () => {
    // History has Cycle 1 and Cycle 2, task.reviewCycle was decremented to 1
    const task = { reviewCycle: 1, historicalCycle: 2 };
    const history = [{ reviewCycle: 1 }, { reviewCycle: 2 }];

    const nextCycle = nextHistoricalReviewCycle(task, history);
    expect(nextCycle).toBe(3); // Never duplicate Cycle 2!
  });

  it('nextHistoricalReviewCycle works for initial cycle', () => {
    const task = { reviewCycle: 1, historicalCycle: 1 };
    expect(nextHistoricalReviewCycle(task, [])).toBe(2);
  });

  it('resolveActiveReviewCycle resolves active rework cycle when changes requested', () => {
    // Initial task
    expect(resolveActiveReviewCycle({ reviewCycle: 1, status: 'Draft' }, [])).toBe(1);

    // ChangesRequested in Cycle 1 -> Active rework is Cycle 2
    const taskCycle2 = { reviewCycle: 2, historicalCycle: 2, status: 'ChangesRequested' };
    const history1 = [{ reviewCycle: 1, decision: 'ChangesRequested' }];
    expect(resolveActiveReviewCycle(taskCycle2, history1)).toBe(2);

    // Legacy fixture where task.reviewCycle was still 1 on ChangesRequested
    const taskLegacy = { reviewCycle: 1, status: 'ChangesRequested' };
    expect(resolveActiveReviewCycle(taskLegacy, history1)).toBe(2);

    // ReSubmitted task remains in Cycle 2
    const taskResubmitted = { reviewCycle: 2, historicalCycle: 2, status: 'ReSubmitted' };
    expect(resolveActiveReviewCycle(taskResubmitted, history1)).toBe(2);

    // Subsequent rework cycle (Cycle 2 was also ChangesRequested)
    const taskCycle3 = { reviewCycle: 3, historicalCycle: 3, status: 'ChangesRequested' };
    const history2 = [
      { reviewCycle: 1, decision: 'ChangesRequested' },
      { reviewCycle: 2, decision: 'ChangesRequested' },
    ];
    expect(resolveActiveReviewCycle(taskCycle3, history2)).toBe(3);
  });

  it('createCycleResponseId generates cycle-scoped and entity-prefixed IDs', () => {
    expect(createCycleResponseId('task-1', 2, 'c-jwt')).toBe('resp-task-1-2-c-jwt');
    expect(createCycleResponseId('task-1', 2, 'jwt')).toBe('resp-task-1-2-c-jwt');
    expect(createCycleResponseId('task-1', 2, 's-shot-1')).toBe('resp-task-1-2-s-shot-1');
  });
});

describe('Canonical Comment Ownership Helpers', () => {
  it('isCommentOwnedBy requires matching reviewerId and userId, rejecting missing authorship', () => {
    expect(isCommentOwnedBy({ reviewerId: 'u-1' }, 'u-1')).toBe(true);
    expect(isCommentOwnedBy({ reviewerId: 'u-1' }, 'u-2')).toBe(false);
    expect(isCommentOwnedBy({ reviewerId: null }, 'u-1')).toBe(false);
    expect(isCommentOwnedBy({ reviewerId: undefined }, 'u-1')).toBe(false);
    expect(isCommentOwnedBy({ reviewerId: 'u-1' }, null)).toBe(false);
    expect(isCommentOwnedBy({ reviewerId: 'u-1' }, undefined)).toBe(false);
    expect(isCommentOwnedBy(null, 'u-1')).toBe(false);
  });

  it('isCommentFromOtherReviewer detects comments authored by different reviewers', () => {
    expect(isCommentFromOtherReviewer({ reviewerId: 'u-prev' }, 'u-curr')).toBe(true);
    expect(isCommentFromOtherReviewer({ reviewerId: 'u-curr' }, 'u-curr')).toBe(false);
    expect(isCommentFromOtherReviewer({ reviewerId: null }, 'u-curr')).toBe(false);
    expect(isCommentFromOtherReviewer(null, 'u-curr')).toBe(false);
  });

  it('isCommentOwnedBy with currentReviewSessionId strictly enforces session match even if reviewerId matches', () => {
    // Same reviewer but from an older session (e.g. S1 vs S2)
    expect(isCommentOwnedBy({ reviewerId: 'u-1', reviewSessionId: 'rs-1' }, 'u-1', 'rs-2')).toBe(
      false,
    );

    // Matching session
    expect(isCommentOwnedBy({ reviewerId: 'u-1', reviewSessionId: 'rs-2' }, 'u-1', 'rs-2')).toBe(
      true,
    );

    // Comment has no session assigned
    expect(isCommentOwnedBy({ reviewerId: 'u-1', reviewSessionId: undefined }, 'u-1', 'rs-2')).toBe(
      false,
    );
  });

  it('isCommentFromOtherReviewer with currentReviewSessionId treats different session comments as previous', () => {
    // Same reviewer but older session is treated as previous context
    expect(
      isCommentFromOtherReviewer({ reviewerId: 'u-1', reviewSessionId: 'rs-1' }, 'u-1', 'rs-2'),
    ).toBe(true);

    // Matching session is NOT previous
    expect(
      isCommentFromOtherReviewer({ reviewerId: 'u-1', reviewSessionId: 'rs-2' }, 'u-1', 'rs-2'),
    ).toBe(false);
  });

  it('hasPreviousReviewerComments detects presence of prior reviewer comments', () => {
    const list = [comment('Issue 1', 'c1', 'u-prev'), comment('Issue 2', 'c2', 'u-curr')];
    expect(hasPreviousReviewerComments(list, 'u-curr')).toBe(true);

    const ownOnly = [comment('Issue 1', 'c1', 'u-curr')];
    expect(hasPreviousReviewerComments(ownOnly, 'u-curr')).toBe(false);
  });
});

describe('Handover Review Ownership & Decision Rules', () => {
  const CURRENT_USER = 'u-reviewer-b';
  const PREV_USER = 'u-reviewer-a';

  it('Rank 1 Approval: permits approval when previous reviewer comments exist and are acknowledged', () => {
    const prevComments = [comment('Previous finding', 'c-prev', PREV_USER)];

    // Unacknowledged -> blocked
    const unacked = input(
      { rank: 1, comments: prevComments, previousFeedbackAcknowledged: false },
      false,
      CURRENT_USER,
    );
    expect(reviewBlockers(unacked, 'Approved')).toContain(
      'previousFeedbackAcknowledgementRequired',
    );

    // Acknowledged -> permitted
    const postHandover = input(
      { rank: 1, comments: prevComments, previousFeedbackAcknowledged: true },
      false,
      CURRENT_USER,
    );
    expect(reviewBlockers(postHandover, 'Approved')).toEqual([]);
    expect(canApprove(postHandover)).toBe(true);
  });

  it('Rank 1 Approval: does NOT require note when NO previous reviewer comments exist', () => {
    const clean = input({ rank: 1, comments: [] }, false, CURRENT_USER);
    expect(reviewBlockers(clean, 'Approved')).toEqual([]);
    expect(canApprove(clean)).toBe(true);
  });

  it('Rank 1 Approval: permitted when current reviewer has comments (comments serve as context)', () => {
    const withOwnComment = input(
      {
        rank: 1,
        comments: [comment('My own finding', 'c-own', CURRENT_USER)],
        previousFeedbackReviewNote: 'Some note',
      },
      false,
      CURRENT_USER,
    );
    expect(reviewBlockers(withOwnComment, 'Approved')).toEqual([]);
    expect(canApprove(withOwnComment)).toBe(true);
  });

  it('Rank 2 / 3 Request Changes: BLOCKED if only previous reviewer comments exist (0 own comments)', () => {
    const prevOnly = input(
      {
        rank: 2,
        comments: [comment('Previous finding', 'c-prev', PREV_USER)],
      },
      false,
      CURRENT_USER,
    );
    expect(reviewBlockers(prevOnly, 'ChangesRequested')).toContain('commentsRequired');
  });

  it('Rank 2 / 3 Request Changes: PERMITTED when current reviewer authors at least one comment', () => {
    const mixed = input(
      {
        rank: 2,
        comments: [
          comment('Previous finding', 'c-prev', PREV_USER),
          comment('My new finding', 'c-own', CURRENT_USER),
        ],
      },
      false,
      CURRENT_USER,
    );
    expect(reviewBlockers(mixed, 'ChangesRequested')).toEqual([]);
  });

  it('Same reviewer re-pickup: comments from prior session S1 do not block Rank 1 and require S2 comments for Rank 2', () => {
    const s1Comment = comment('S1 comment', 'c-1', 'u-pinsara', 'rs-1');

    // Re-picked by same reviewer 'u-pinsara' with new session 'rs-2'
    const s2Rank1 = input(
      { rank: 1, comments: [s1Comment], previousFeedbackAcknowledged: true },
      false,
      'u-pinsara',
      'rs-2',
    );
    expect(reviewBlockers(s2Rank1, 'Approved')).toEqual([]);
    expect(canApprove(s2Rank1)).toBe(true);

    // Rank 2 blocked because 'u-pinsara' has 0 comments in 'rs-2'
    const s2Rank2 = input({ rank: 2, comments: [s1Comment] }, false, 'u-pinsara', 'rs-2');
    expect(reviewBlockers(s2Rank2, 'ChangesRequested')).toContain('commentsRequired');

    // Adding an S2 comment unblocks Rank 2
    const s2Comment = comment('S2 comment', 'c-2', 'u-pinsara', 'rs-2');
    const s2Rank2WithComment = input(
      { rank: 2, comments: [s1Comment, s2Comment] },
      false,
      'u-pinsara',
      'rs-2',
    );
    expect(reviewBlockers(s2Rank2WithComment, 'ChangesRequested')).toEqual([]);
  });

  it('Rank 2 / 3 Request Changes: PERMITTED when reviewer has zero comments but has unresolved adjudicated findings', () => {
    // Re-review scenario: Developer fix was marked Not Resolved (Overruled) with mandatory explanation
    const reReviewUnresolved = {
      draft: draft({ rank: 2, comments: [] }),
      currentUserId: CURRENT_USER,
      hasUnresolvedIssues: true,
      hasPendingAdjudication: false,
    };
    expect(reviewBlockers(reReviewUnresolved, 'ChangesRequested')).toEqual([]);
    // But Approve is still blocked by rank and unresolved issues
    expect(reviewBlockers(reReviewUnresolved, 'Approved')).toContain('approveBlockedByRank');
  });
});

describe('Edge cases', () => {
  it('labels each rank from the shared rank table', () => {
    expect(getRankLabel(null)).toBe('Unranked');
    expect(getRankLabel(undefined)).toBe('Unranked');
    expect(getRankLabel(2)).toBe('Rank 2 — Minor Issues / Needs Improvement');
  });

  it('does not count a cycle whose rejections were all accepted, when configured', () => {
    const options = { countAcceptedRejections: false };
    expect(nextReviewCycle(2, 'ChangesRequested', { ...options, acceptedRejections: 1 })).toBe(2);
    expect(nextReviewCycle(2, 'ChangesRequested', { ...options, acceptedRejections: 0 })).toBe(3);
  });

  it('treats a missing comment or list as neither owned nor foreign', () => {
    expect(isCommentOwnedBy(null, 'u-1')).toBe(false);
    expect(isCommentFromOtherReviewer(undefined, 'u-1')).toBe(false);
    expect(hasPreviousReviewerComments(undefined, 'u-1')).toBe(false);
  });

  it('blocks Request Changes while an own comment is still empty', () => {
    const blank = input({ rank: 2, comments: [comment('   ', 'rc-1', 'u-1')] }, false, 'u-1');
    expect(reviewBlockers(blank, 'ChangesRequested')).toContain('emptyComment');
  });
});
