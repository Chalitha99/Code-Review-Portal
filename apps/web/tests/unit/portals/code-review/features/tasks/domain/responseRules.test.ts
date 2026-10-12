import { describe, expect, it } from 'vitest';
import type {
  IssueResponseDraft,
  IssueResponseRecord,
  Review,
  ReviewComment,
} from '@sdp/contracts';
import {
  isResponseComplete,
  issuesFromReview,
  resubmitReadiness,
} from '@/portals/code-review/features/tasks/domain/responseRules.ts';

/**
 * FL 2.11.2.3-01 — a developer may disagree with a reviewer, but not silently.
 */

function review(overrides: Partial<Review> = {}): Review {
  return {
    id: 'rev-1',
    taskId: 't-1',
    reviewRound: 1,
    reviewerId: 'u-rev',
    reviewerName: 'Reviewer',
    comments: [],
    generalCheck: [],
    findings: { incorrectCode: '', incompleteImplementation: '', sourceFormatting: '' },
    otherRemarks: '',
    feedbackSummary: '',
    rank: 2,
    screenshots: [],
    decision: 'ChangesRequested',
    decidedAt: '2026-01-02T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}

function shot(id: string, comment: string) {
  return {
    id,
    fileName: `${id}.png`,
    sizeBytes: 1024,
    mimeType: 'image/png',
    storageRef: 'data:,',
    comment,
    uploadedAt: '2026-01-02T00:00:00.000Z',
  };
}

describe('issuesFromReview', () => {
  it('yields nothing for an approved review — there is nothing to answer', () => {
    expect(issuesFromReview(review({ decision: 'Approved' }))).toEqual([]);
    expect(issuesFromReview(review({ decision: null }))).toEqual([]);
    expect(issuesFromReview(null)).toEqual([]);
  });

  it('makes each screenshot its own issue', () => {
    const issues = issuesFromReview(
      review({ screenshots: [shot('s1', 'Wrong view'), shot('s2', 'Bad indent')] }),
    );

    expect(issues.map((issue) => issue.screenshotId)).toEqual(['s1', 's2']);
    expect(issues[0]?.detail).toBe('Wrong view');
  });

  it('folds the three written findings into one issue', () => {
    // They are one argument about the same submission; splitting them would ask
    // the developer to accept the formatting complaint while rejecting the
    // performance one, a distinction the spec does not draw.
    const issues = issuesFromReview(
      review({
        findings: {
          incorrectCode: 'Cursor is wrong.',
          incompleteImplementation: '',
          sourceFormatting: 'Indentation.',
        },
      }),
    );

    expect(issues).toHaveLength(1);
    expect(issues[0]?.screenshotId).toBeNull();
    expect(issues[0]?.detail).toBe('Cursor is wrong.\n\nIndentation.');
  });

  it('ignores findings boxes that hold only whitespace', () => {
    const issues = issuesFromReview(
      review({
        findings: { incorrectCode: '   ', incompleteImplementation: '', sourceFormatting: '' },
      }),
    );
    expect(issues).toEqual([]);
  });

  it('filters actionable issues to comments authored by the deciding reviewer, excluding handover comments', () => {
    const r = review({
      reviewerId: 'u-final',
      comments: [
        {
          id: 'c-prev',
          reviewRound: 1,
          reviewerId: 'u-initial',
          text: 'Handover comment from first reviewer',
          screenshots: [],
          createdAt: '2026-09-10T10:00:00Z',
        },
        {
          id: 'c-final',
          reviewRound: 1,
          reviewerId: 'u-final',
          text: 'Actionable defect from final reviewer',
          screenshots: [],
          createdAt: '2026-09-10T11:00:00Z',
        },
      ],
    });

    const issues = issuesFromReview(r);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.commentId).toBe('c-final');
    expect(issues[0]?.detail).toBe('Actionable defect from final reviewer');
  });

  it('carries forward unresolved findings when reviewer overrules developer fix in a re-review with 0 new comments', () => {
    const round1Review = review({
      reviewRound: 1,
      decision: 'ChangesRequested',
      comments: [
        {
          id: 'c-1',
          reviewRound: 1,
          reviewerId: 'u-rev',
          text: 'Fix JWT expiration',
          screenshots: [],
          createdAt: '2026-09-10T10:00:00Z',
        },
      ],
    });

    const round2Review = review({
      reviewRound: 2,
      decision: 'ChangesRequested',
      comments: [], // Reviewer added NO new comments, only marked c-1 Not Resolved
    });

    const responses = [
      {
        id: 'resp-1',
        taskId: 't-1',
        reviewRound: 1,
        commentId: 'c-1',
        kind: 'Resolved' as const,
        rejectionReason: null,
        verdict: 'Overruled' as const,
        reviewerComment: 'Token still valid for 24 hours instead of 1 hour',
        respondedAt: '2026-09-10T10:30:00Z',
      },
    ];

    const issues = issuesFromReview(round2Review, [round1Review], responses);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.commentId).toBe('c-1');
    expect(issues[0]?.detail).toBe('Fix JWT expiration');
    expect(issues[0]?.isFollowUp).toBe(true);
    expect(issues[0]?.reviewerExplanation).toBe('Token still valid for 24 hours instead of 1 hour');
    expect(issues[0]?.previousResponseKind).toBe('Resolved');
  });

  it('does NOT carry forward findings that were accepted or verified by reviewer', () => {
    const round1Review = review({
      reviewRound: 1,
      decision: 'ChangesRequested',
      comments: [
        {
          id: 'c-1',
          reviewRound: 1,
          reviewerId: 'u-rev',
          text: 'Fix CSS styling',
          screenshots: [],
          createdAt: '2026-09-10T10:00:00Z',
        },
      ],
    });

    const round2Review = review({
      reviewRound: 2,
      decision: 'ChangesRequested',
      comments: [
        {
          id: 'c-2',
          reviewRound: 2,
          reviewerId: 'u-rev',
          text: 'New finding in round 2',
          screenshots: [],
          createdAt: '2026-09-10T12:00:00Z',
        },
      ],
    });

    const responses = [
      {
        id: 'resp-1',
        taskId: 't-1',
        reviewRound: 1,
        commentId: 'c-1',
        kind: 'Resolved' as const,
        rejectionReason: null,
        verdict: 'Accepted' as const, // Verified resolved!
        reviewerComment: null,
        respondedAt: '2026-09-10T10:30:00Z',
      },
    ];

    const issues = issuesFromReview(round2Review, [round1Review], responses);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.commentId).toBe('c-2');
    expect(issues[0]?.isFollowUp).toBeUndefined();
  });
  it('follows the LATEST verdict when a finding was adjudicated in more than one round', () => {
    const c1 = {
      id: 'c-1',
      reviewRound: 1,
      reviewerId: 'u-rev',
      text: 'Fix the retry loop',
      screenshots: [],
      createdAt: '2026-09-10T10:00:00Z',
    };
    // History arrives newest-first; the rule must order it itself.
    const history = [
      review({ reviewRound: 2, decision: 'ChangesRequested', comments: [] }),
      review({ reviewRound: 1, decision: 'ChangesRequested', comments: [c1] }),
    ];
    const current = review({ reviewRound: 3, decision: 'ChangesRequested', comments: [] });
    const verdict = (reviewRound: number, v: 'Accepted' | 'Overruled') => ({
      id: `resp-${String(reviewRound)}`,
      taskId: 't-1',
      reviewRound,
      commentId: 'c-1',
      kind: 'Resolved' as const,
      rejectionReason: null,
      verdict: v,
      reviewerComment: v === 'Overruled' ? 'Still loops' : null,
      respondedAt: `2026-09-1${String(reviewRound)}T10:00:00Z`,
    });

    // Overruled, then verified in a later round: settled, nothing carries forward.
    expect(
      issuesFromReview(current, history, [verdict(1, 'Overruled'), verdict(2, 'Accepted')]),
    ).toEqual([]);

    // Verified, then overruled later: it carries forward as a follow-up.
    const reopened = issuesFromReview(current, history, [
      verdict(1, 'Accepted'),
      verdict(2, 'Overruled'),
    ]);
    expect(reopened.map((issue) => issue.commentId)).toEqual(['c-1']);
    expect(reopened[0]?.isFollowUp).toBe(true);
    expect(reopened[0]?.originRound).toBe(1);
  });
});

describe('isResponseComplete', () => {
  const base = { screenshotId: 's1' } as const;

  it('accepts a resolution with no reason', () => {
    expect(isResponseComplete({ ...base, kind: 'Resolved' })).toBe(true);
  });

  it('REJECTS a rejection with no reason (FL 2.11.2.3-01)', () => {
    expect(isResponseComplete({ ...base, kind: 'Rejected' })).toBe(false);
    expect(isResponseComplete({ ...base, kind: 'Rejected', rejectionReason: '' })).toBe(false);
    expect(isResponseComplete({ ...base, kind: 'Rejected', rejectionReason: '   ' })).toBe(false);
  });

  it('accepts a rejection that explains itself', () => {
    expect(
      isResponseComplete({ ...base, kind: 'Rejected', rejectionReason: 'This is by design.' }),
    ).toBe(true);
  });
});

describe('resubmitReadiness', () => {
  const issues = issuesFromReview(
    review({
      screenshots: [shot('s1', 'a'), shot('s2', 'b')],
      findings: {
        incorrectCode: 'Something',
        incompleteImplementation: '',
        sourceFormatting: '',
      },
    }),
  );

  function responses(...items: IssueResponseDraft[]) {
    return items;
  }

  it('counts unanswered findings', () => {
    const readiness = resubmitReadiness(
      issues,
      responses({ screenshotId: 's1', kind: 'Resolved' }),
    );

    expect(issues).toHaveLength(3);
    expect(readiness.unanswered).toBe(2);
    expect(readiness.canResubmit).toBe(false);
  });

  it('counts an unjustified rejection separately from an unanswered one', () => {
    // Different mistakes deserve different prompts.
    const readiness = resubmitReadiness(
      issues,
      responses(
        { screenshotId: 's1', kind: 'Rejected' },
        { screenshotId: 's2', kind: 'Resolved' },
        { screenshotId: null, kind: 'Resolved' },
      ),
    );

    expect(readiness.unanswered).toBe(0);
    expect(readiness.unjustified).toBe(1);
    expect(readiness.canResubmit).toBe(false);
  });

  it('allows resubmission once every finding is answered and every rejection explained', () => {
    const readiness = resubmitReadiness(
      issues,
      responses(
        { screenshotId: 's1', kind: 'Rejected', rejectionReason: 'Already handled upstream.' },
        { screenshotId: 's2', kind: 'Resolved' },
        { screenshotId: null, kind: 'Resolved' },
      ),
    );

    expect(readiness.canResubmit).toBe(true);
  });

  it('refuses to call an empty issue list ready', () => {
    // A ChangesRequested task always has at least one finding — the rank gate
    // guarantees it. Treating "nothing to answer" as ready would let a developer
    // resubmit without engaging with the feedback at all.
    expect(resubmitReadiness([], []).canResubmit).toBe(false);
  });
});

describe('issuesFromReview — comment selection and history', () => {
  const note = (id: string, extra: Partial<ReviewComment> = {}): ReviewComment => ({
    id,
    reviewRound: 1,
    text: `Finding ${id}`,
    screenshots: [],
    createdAt: '2026-09-10T10:00:00Z',
    ...extra,
  });

  it("takes only the deciding session's comments when the review names a session", () => {
    const decided = review({
      currentReviewSessionId: 's-2',
      comments: [note('old', { reviewSessionId: 's-1' }), note('new', { reviewSessionId: 's-2' })],
    });
    expect(issuesFromReview(decided).map((issue) => issue.commentId)).toEqual(['new']);
  });

  it("keeps unattributed comments and the deciding reviewer's own, never a handed-over reviewer's", () => {
    const decided = review({
      comments: [
        note('anon'),
        note('mine', { reviewerId: 'u-rev' }),
        note('theirs', { reviewerId: 'u-other' }),
      ],
    });
    expect(issuesFromReview(decided).map((issue) => issue.commentId)).toEqual(['anon', 'mine']);
    // With no deciding reviewer on record, every comment is actionable.
    const unowned = review({ reviewerId: null, comments: [note('a', { reviewerId: 'u-x' })] });
    expect(issuesFromReview(unowned).map((issue) => issue.commentId)).toEqual(['a']);
  });

  it('does not repeat a prior finding the reviewer re-authored in this review', () => {
    const prior = review({ reviewRound: 1, comments: [note('c-1')] });
    const current = review({ reviewRound: 2, comments: [note('c-1', { reviewRound: 2 })] });
    const overruled: IssueResponseRecord = {
      id: 'r-1',
      taskId: 't-1',
      reviewRound: 1,
      commentId: 'c-1',
      kind: 'Resolved',
      rejectionReason: null,
      verdict: 'Overruled',
      respondedAt: '2026-09-11T10:00:00Z',
    };
    const issues = issuesFromReview(current, [prior], [overruled]);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.isFollowUp).toBeUndefined();
  });

  it('reads verdicts embedded in history entries and breaks same-round ties by time', () => {
    const verdict = (id: string, v: 'Accepted' | 'Overruled', at: string): IssueResponseRecord => ({
      id,
      taskId: 't-1',
      reviewRound: 1,
      commentId: 'c-1',
      kind: 'Rejected',
      rejectionReason: 'Out of scope',
      verdict: v,
      respondedAt: at,
    });
    const prior = {
      ...review({ reviewRound: 1, comments: [note('c-1')] }),
      // A later Overruled at the same round wins over the earlier Accepted.
      responses: [
        verdict('a', 'Accepted', '2026-09-11T09:00:00Z'),
        verdict('b', 'Overruled', '2026-09-11T11:00:00Z'),
      ],
    };
    const issues = issuesFromReview(review({ reviewRound: 2 }), [prior]);
    expect(issues.map((issue) => issue.commentId)).toEqual(['c-1']);
    expect(issues[0]?.previousResponseKind).toBe('Rejected');
    expect(issues[0]?.previousRejectionReason).toBe('Out of scope');
  });
});
