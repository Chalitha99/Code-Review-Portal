import {
  DEFECT_RANKS,
  type GeneralCheckQuestion,
  type ReviewDecision,
  type ReviewDraft,
  type ReviewRank,
} from '@sdp/contracts';

/**
 * The rules that decide whether a review may be submitted, and how.
 *
 * These are the most consequential rules in the product: they are what stops a
 * reviewer approving code they have just recorded serious defects against. Every
 * one is a pure function of the draft, so each can be asserted directly rather
 * than inferred from a disabled button — and each is re-enforced server-side,
 * because a disabled button is a courtesy, not a control.
 */

/* -------------------------------------------------------------------------- */
/* Blocking reasons                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Machine-readable reasons a review cannot be submitted.
 *
 * Codes rather than sentences: the domain layer must not depend on `content/`,
 * and the same code renders as a field error, a list row, and a toast.
 */
export const REVIEW_BLOCKERS = [
  'rankRequired',
  'rank1HasComments',
  'previousFeedbackReviewNoteRequired',
  'previousFeedbackAcknowledgementRequired',
  'commentsRequired',
  'emptyComment',
  'approveBlockedByRank',
  'requestChangesBlockedByRank1',
  'pendingRejectionAdjudication',
  'pendingAdjudication',
  'unresolvedResponsesBlockApproval',
  // Legacy aliases for backward compatibility
  'generalCheckIncomplete',
  'findingsRequired',
  'screenshotRequired',
] as const;
export type ReviewBlocker = (typeof REVIEW_BLOCKERS)[number];

export interface ReviewReadinessInput {
  draft: ReviewDraft;
  currentUserId?: string | undefined;
  currentReviewSessionId?: string | undefined;
  /** Questions actually rendered (legacy / optional). */
  questions?: readonly GeneralCheckQuestion[];
  /** Screenshot count (optional / informational). */
  screenshotCount?: number;
  /** Whether developer rejections/responses are still pending reviewer verdict. */
  hasPendingRejections?: boolean;
  /** Whether any developer response is still pending reviewer verdict. */
  hasPendingAdjudication?: boolean;
  /** Whether any developer response was marked Not Resolved or Rejection Not Accepted (Overruled). */
  hasUnresolvedIssues?: boolean;
}

/**
 * Canonical check for comment ownership:
 * A comment is owned by the current reviewer if and only if its reviewSessionId
 * matches the active review session ID.
 *
 * If currentReviewSessionId is not specified (e.g. in legacy tests without session context),
 * it falls back to matching reviewerId === userId.
 * Missing reviewerId does NOT default to current user ownership.
 */
export function isCommentOwnedBy(
  comment:
    | { reviewerId?: string | null | undefined; reviewSessionId?: string | null | undefined }
    | null
    | undefined,
  userId: string | null | undefined,
  currentReviewSessionId?: string | null,
): boolean {
  if (!comment) return false;
  if (currentReviewSessionId) {
    if (!comment.reviewSessionId) return false;
    return comment.reviewSessionId === currentReviewSessionId;
  }
  if (!comment.reviewerId || !userId) return false;
  return comment.reviewerId === userId;
}

/**
 * Returns true if the comment was authored in a previous review session
 * (or by a different reviewer), meaning it must be treated as read-only historical context.
 */
export function isCommentFromOtherReviewer(
  comment:
    | { reviewerId?: string | null | undefined; reviewSessionId?: string | null | undefined }
    | null
    | undefined,
  currentUserId: string | null | undefined,
  currentReviewSessionId?: string | null,
): boolean {
  if (!comment) return false;
  if (currentReviewSessionId) {
    if (!comment.reviewSessionId) return true;
    return comment.reviewSessionId !== currentReviewSessionId;
  }
  return Boolean(comment.reviewerId && currentUserId && comment.reviewerId !== currentUserId);
}

/**
 * Returns true if the draft contains at least one comment authored by a prior reviewer or in a prior session.
 */
export function hasPreviousReviewerComments(
  comments:
    | readonly {
        reviewerId?: string | null | undefined;
        reviewSessionId?: string | null | undefined;
      }[]
    | undefined,
  currentUserId: string | null | undefined,
  currentReviewSessionId?: string | null,
): boolean {
  if (!comments) return false;
  return comments.some((c) => isCommentFromOtherReviewer(c, currentUserId, currentReviewSessionId));
}

/** Ranks that block approval and demand comments (Rank 2 & Rank 3). */
export function isDefectRank(rank: ReviewRank | null): boolean {
  return rank !== null && (DEFECT_RANKS as readonly ReviewRank[]).includes(rank);
}

/**
 * Validates a review draft against the requested decision (Approve or Request Changes).
 */
export function reviewBlockers(
  input: ReviewReadinessInput,
  decision: ReviewDecision,
): ReviewBlocker[] {
  const { draft, hasPendingRejections = false, currentUserId, currentReviewSessionId } = input;
  const blockers: ReviewBlocker[] = [];
  const comments = draft.comments ?? [];
  const activeSessionId = currentReviewSessionId ?? draft.currentReviewSessionId ?? undefined;

  // Comments authored by the current reviewer in the current review session.
  // If neither session nor userId is provided (e.g. in legacy tests without user context),
  // all comments are treated as current for backward compatibility.
  const currentReviewerComments =
    activeSessionId || currentUserId
      ? comments.filter((c) => isCommentOwnedBy(c, currentUserId, activeSessionId))
      : comments;

  const hasEmptyOwnComment = currentReviewerComments.some((c) => c.text.trim() === '');

  // Re-review gate: cannot submit a decision while developer responses are pending adjudication
  const isPending = input.hasPendingAdjudication === true || hasPendingRejections;
  if (isPending) {
    blockers.push('pendingAdjudication');
    blockers.push('pendingRejectionAdjudication');
  }

  // Rank is mandatory
  if (draft.rank === null) {
    blockers.push('rankRequired');
    return blockers;
  }

  /*
   * Rank 1 — Good / Approved Quality
   * Meaning: No unresolved issues remain.
   * Approve depends only on final reviewer assessment.
   * Existing comments (own or previous) do NOT block Rank 1 approval.
   */
  if (draft.rank === 1) {
    if (decision === 'ChangesRequested') {
      blockers.push('requestChangesBlockedByRank1');
    }
    if (decision === 'Approved' && input.hasUnresolvedIssues) {
      blockers.push('unresolvedResponsesBlockApproval');
    }
    if (
      decision === 'Approved' &&
      hasPreviousReviewerComments(comments, currentUserId, activeSessionId) &&
      !draft.previousFeedbackAcknowledged
    ) {
      blockers.push('previousFeedbackAcknowledgementRequired');
    }
  }

  /*
   * Rank 2 / Rank 3 — Minor / Major Issues
   * Meaning: Actionable changes are required.
   * Approve is blocked.
   * Request Changes requires at least 1 valid comment authored by the current reviewer.
   */
  if (isDefectRank(draft.rank)) {
    if (decision === 'Approved') {
      blockers.push('approveBlockedByRank');
    }
    if (currentReviewerComments.length === 0 && !input.hasUnresolvedIssues) {
      blockers.push('commentsRequired');
    } else if (hasEmptyOwnComment) {
      blockers.push('emptyComment');
    }
  }

  return blockers;
}

export function canSubmitReview(input: ReviewReadinessInput, decision: ReviewDecision): boolean {
  return reviewBlockers(input, decision).length === 0;
}

/**
 * Whether the Approve action is currently valid.
 */
export function canApprove(input: ReviewReadinessInput): boolean {
  return canSubmitReview(input, 'Approved');
}

/* -------------------------------------------------------------------------- */
/* Cycle counting & Immutable Sequence calculation                             */
/* -------------------------------------------------------------------------- */

/**
 * The next counted review cycle after a decision (business / effective cycle).
 */
export function nextCountedCycle(
  currentCycle: number,
  decision: ReviewDecision,
  options: { acceptedRejections?: number; countAcceptedRejections?: boolean } = {},
): number {
  if (decision === 'Approved') return currentCycle;

  const { acceptedRejections = 0, countAcceptedRejections = true } = options;
  if (countAcceptedRejections) return currentCycle + 1;

  return acceptedRejections > 0 ? currentCycle : currentCycle + 1;
}

/** Legacy alias for nextCountedCycle */
export const nextReviewCycle = nextCountedCycle;

export {
  createRoundResponseId,
  createCycleResponseId,
  nextReviewRound,
  nextHistoricalReviewCycle,
  resolveActiveReviewRound,
  resolveActiveReviewCycle,
} from '@/lib/reviewCycles.ts';

/* -------------------------------------------------------------------------- */
/* Canonical Rank Terminology                                                 */
/* -------------------------------------------------------------------------- */

export const RANK_DETAILS: Record<ReviewRank, { title: string; subtitle: string }> = {
  1: { title: 'Rank 1', subtitle: 'Good / Approved Quality' },
  2: { title: 'Rank 2', subtitle: 'Minor Issues / Needs Improvement' },
  3: { title: 'Rank 3', subtitle: 'Major Issues / Significant Changes Required' },
};

export function getRankLabel(rank: ReviewRank | null | undefined): string {
  if (!rank) return 'Unranked';
  const detail = RANK_DETAILS[rank];
  return detail ? `${detail.title} — ${detail.subtitle}` : `Rank ${rank}`;
}
