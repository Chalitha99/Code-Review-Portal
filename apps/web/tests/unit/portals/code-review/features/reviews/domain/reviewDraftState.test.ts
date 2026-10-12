import { describe, expect, it } from 'vitest';
import { reviewSchema, type Review, type ReviewComment, type ReviewDraft } from '@sdp/contracts';
import {
  createEditableSnapshot,
  EMPTY_DRAFT,
  reviewToDraft,
} from '@/portals/code-review/features/reviews/domain/reviewDraftState.ts';

function comment(overrides: Partial<ReviewComment> = {}): ReviewComment {
  return {
    id: 'c-1',
    reviewRound: 1,
    reviewerId: 'u-rev',
    reviewSessionId: 's-1',
    text: 'Fix the null check.',
    screenshots: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('reviewToDraft', () => {
  it('starts empty when there is no review yet', () => {
    expect(reviewToDraft(null)).toBe(EMPTY_DRAFT);
    expect(reviewToDraft(undefined)).toBe(EMPTY_DRAFT);
  });

  it('carries the editable fields of a stored review', () => {
    const review = reviewSchema.parse({
      id: 'r-1',
      taskId: 't-1',
      reviewRound: 1,
      reviewerId: 'u-rev',
      reviewerName: 'Rev',
      currentReviewSessionId: 's-1',
      comments: [comment()],
      rank: 2,
      previousFeedbackAcknowledged: true,
      decision: null,
      decidedAt: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const draft = reviewToDraft(review);
    expect(draft.rank).toBe(2);
    expect(draft.comments).toHaveLength(1);
    expect(draft.currentReviewSessionId).toBe('s-1');
    expect(draft.previousFeedbackAcknowledged).toBe(true);
    expect(draft.previousFeedbackReviewNote).toBeNull();
  });
});

describe('createEditableSnapshot', () => {
  it('is empty for a missing draft', () => {
    expect(createEditableSnapshot(null)).toBe('');
  });

  it('changes when an own comment changes, including whitespace', () => {
    const base = { ...EMPTY_DRAFT, comments: [comment()] };
    const edited = { ...EMPTY_DRAFT, comments: [comment({ text: 'Fix the null check. ' })] };
    expect(createEditableSnapshot(base, 'u-rev', 's-1')).not.toBe(
      createEditableSnapshot(edited, 'u-rev', 's-1'),
    );
  });

  it("ignores another reviewer's read-only comment text", () => {
    const theirs = comment({ reviewerId: 'u-other', reviewSessionId: 's-old' });
    const before = { ...EMPTY_DRAFT, comments: [theirs] };
    const after = { ...EMPTY_DRAFT, comments: [{ ...theirs, text: 'Rewritten elsewhere' }] };
    expect(createEditableSnapshot(before, 'u-rev', 's-1')).toBe(
      createEditableSnapshot(after, 'u-rev', 's-1'),
    );
  });

  it('ignores server metadata such as timestamps', () => {
    const before = { ...EMPTY_DRAFT, comments: [comment()] };
    const after = {
      ...EMPTY_DRAFT,
      comments: [comment({ updatedAt: '2026-02-01T00:00:00.000Z' })],
    };
    expect(createEditableSnapshot(before)).toBe(createEditableSnapshot(after));
  });

  it('tracks screenshots on own comments by id and file name', () => {
    const shot = {
      id: 's-a',
      fileName: 'a.png',
      sizeBytes: 1,
      mimeType: 'image/png',
      storageRef: 'blob:a',
      comment: '',
      uploadedAt: '2026-01-01T00:00:00.000Z',
    };
    const without = { ...EMPTY_DRAFT, comments: [comment()] };
    const withShot = { ...EMPTY_DRAFT, comments: [comment({ screenshots: [shot] })] };
    expect(createEditableSnapshot(without, 'u-rev')).not.toBe(
      createEditableSnapshot(withShot, 'u-rev'),
    );
  });
});

describe('stale data', () => {
  // Older persisted mock databases and cached rows can lack fields added later.
  it('fills every missing field when converting a sparse review', () => {
    const sparse = { rank: null } as unknown as Review;
    const draft = reviewToDraft(sparse);
    expect(draft.comments).toEqual([]);
    expect(draft.generalCheck).toEqual([]);
    expect(draft.findings.incorrectCode).toBe('');
    expect(draft.otherRemarks).toBe('');
    expect(draft.feedbackSummary).toBe('');
    expect(draft.currentReviewSessionId).toBeNull();
    expect(draft.previousFeedbackAcknowledged).toBe(false);
  });

  it('snapshots a sparse draft without throwing, treating unowned comments as editable', () => {
    const sparseComment = { id: 'c-x' } as unknown as ReviewComment;
    const sparse = { comments: [sparseComment] } as unknown as ReviewDraft;
    expect(JSON.parse(createEditableSnapshot(sparse))).toEqual({
      rank: null,
      previousFeedbackReviewNote: null,
      previousFeedbackAcknowledged: false,
      comments: [{ id: 'c-x', text: '', screenshots: [], reviewerId: null, reviewSessionId: null }],
    });
    expect(JSON.parse(createEditableSnapshot({} as ReviewDraft))).toMatchObject({ comments: [] });
  });
});
