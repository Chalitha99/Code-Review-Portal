import type { Review, ReviewDraft } from '@sdp/contracts';
import { isCommentOwnedBy } from './reviewRules.ts';

export const AUTOSAVE_DELAY_MS = 800;

export const EMPTY_DRAFT: ReviewDraft = {
  rank: null,
  comments: [],
  generalCheck: [],
  findings: { incorrectCode: '', incompleteImplementation: '', sourceFormatting: '' },
  otherRemarks: '',
  feedbackSummary: '',
  previousFeedbackReviewNote: null,
  previousFeedbackAcknowledged: false,
};

export function reviewToDraft(review: Review | null | undefined): ReviewDraft {
  if (!review) return EMPTY_DRAFT;
  return {
    currentReviewSessionId: review.currentReviewSessionId ?? null,
    rank: review.rank,
    comments: review.comments ?? [],
    generalCheck: review.generalCheck ?? [],
    findings: review.findings ?? {
      incorrectCode: '',
      incompleteImplementation: '',
      sourceFormatting: '',
    },
    otherRemarks: review.otherRemarks ?? '',
    feedbackSummary: review.feedbackSummary ?? '',
    previousFeedbackReviewNote: review.previousFeedbackReviewNote ?? null,
    previousFeedbackAcknowledged: Boolean(review.previousFeedbackAcknowledged),
  };
}

/**
 * Creates a deterministic canonical snapshot of active editable fields.
 *
 * Rules:
 * 1. Only active editable fields (rank, previousFeedbackReviewNote, previousFeedbackAcknowledged, comments, reviewer screenshots) are tracked.
 * 2. Legacy/removed fields (generalCheck, findings, otherRemarks, feedbackSummary) are excluded.
 * 3. Exact whitespace is preserved without blind .trim() to avoid spurious dirty triggers.
 * 4. Previous-reviewer comments are read-only and must not falsely mark the draft dirty.
 * 5. Server-generated metadata (timestamps, reviewer names, etc.) are excluded to prevent hydration loops.
 */
export function createEditableSnapshot(
  draft: ReviewDraft | null | undefined,
  currentUserId?: string,
  currentReviewSessionId?: string,
): string {
  if (!draft) return '';
  const activeSessionId = currentReviewSessionId ?? draft.currentReviewSessionId ?? undefined;
  return JSON.stringify({
    rank: draft.rank ?? null,
    previousFeedbackReviewNote: draft.previousFeedbackReviewNote ?? null,
    previousFeedbackAcknowledged: draft.previousFeedbackAcknowledged ?? false,
    comments: (draft.comments ?? []).map((c) => {
      const isEditable =
        activeSessionId || currentUserId
          ? isCommentOwnedBy(c, currentUserId, activeSessionId)
          : true;
      return {
        id: c.id,
        text: isEditable ? (c.text ?? '') : '',
        screenshots: isEditable
          ? (c.screenshots ?? []).map((s) => ({ id: s.id, fileName: s.fileName }))
          : [],
        reviewerId: c.reviewerId ?? null,
        reviewSessionId: c.reviewSessionId ?? null,
      };
    }),
  });
}
