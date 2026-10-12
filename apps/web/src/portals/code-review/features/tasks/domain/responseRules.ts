import type {
  IssueResponseKind,
  IssueResponseRecord,
  Review,
  ReviewComment,
  ReviewHistoryEntry,
  ReviewScreenshot,
} from '@sdp/contracts';

/**
 * The developer's reply to a reviewer's findings (spec §1.5 p.11, FL 2.11.2.3-01).
 *
 * Every finding must be answered before the task can go back, and rejecting one
 * requires a written justification — a developer may disagree with a reviewer,
 * but not silently. Both rules are pure functions here and re-enforced in the
 * handler, because "the Resubmit button was disabled" is not a control.
 */

/** One thing the developer has to respond to (a ReviewComment). */
export interface Issue {
  /** Comment ID connecting to ReviewComment (authoritative source of truth). */
  commentId: string;
  /** Null when the finding is not linked to a screenshot. */
  screenshotId: string | null;
  label: string;
  detail: string;
  screenshots: ReviewScreenshot[];
  /** Whether this issue is carried forward from an earlier round due to a negative reviewer verdict */
  isFollowUp?: boolean;
  /** Reviewer's explanation from the negative adjudication */
  reviewerExplanation?: string | null;
  /** Prior developer response kind */
  previousResponseKind?: IssueResponseKind | null;
  /** Prior developer rejection reason if any */
  previousRejectionReason?: string | null;
  /** The round in which the comment was originally authored */
  originRound?: number;
  /** Legacy alias for originRound */
  originCycle?: number;
}

/**
 * The findings a developer must answer, derived from the reviewer's last round
 * and any unresolved carry-forward findings from prior rounds.
 *
 * Each Review Comment is an independent actionable item that the developer
 * responds to (Resolve or Reject with mandatory reason).
 */
export function issuesFromReview(
  review: Review | null,
  allReviews?: readonly (Review | ReviewHistoryEntry)[] | null,
  responses?: readonly IssueResponseRecord[] | null,
): Issue[] {
  if (review?.decision !== 'ChangesRequested') return [];

  const issues: Issue[] = [];
  const processedCommentIds = new Set<string>();

  // 1. Active workflow: Derives directly from Review Comments in the deciding review session
  if (review.comments && review.comments.length > 0) {
    const activeSessionId = review.currentReviewSessionId;
    const actionableComments = activeSessionId
      ? review.comments.filter((c) => c.reviewSessionId === activeSessionId)
      : review.comments.filter(
          (c) => !c.reviewerId || (review.reviewerId ? c.reviewerId === review.reviewerId : true),
        );

    actionableComments.forEach((comment, index) => {
      processedCommentIds.add(comment.id);
      issues.push({
        commentId: comment.id,
        screenshotId: comment.screenshots[0]?.id ?? null,
        label: `Review Comment #${index + 1}`,
        detail: comment.text,
        screenshots: comment.screenshots ?? [],
        originRound: review.reviewRound,
        originCycle: review.reviewRound,
      });
    });
  }

  // 2. Carry-forward workflow: Unresolved findings from prior rounds where reviewer marked Not Resolved / Do Not Accept
  if (allReviews && allReviews.length > 0) {
    // Collect all unique comments across prior completed rounds (sorted by round ascending)
    const priorReviews = [...allReviews]
      .filter((r) => r.reviewRound < review.reviewRound)
      .sort((a, b) => a.reviewRound - b.reviewRound);

    const allPriorComments = new Map<string, { comment: ReviewComment; round: number }>();
    for (const pr of priorReviews) {
      for (const c of pr.comments ?? []) {
        if (!allPriorComments.has(c.id)) {
          allPriorComments.set(c.id, { comment: c, round: pr.reviewRound });
        }
      }
    }

    // Pool all known responses across history entries and passed responses
    const historyResponses = priorReviews.flatMap((r) =>
      'responses' in r && Array.isArray(r.responses) ? r.responses : [],
    );
    const allKnownResponses: IssueResponseRecord[] = [...historyResponses, ...(responses ?? [])];

    for (const [commentId, { comment, round }] of allPriorComments.entries()) {
      // Skip if this comment was re-authored in the latest review
      if (processedCommentIds.has(commentId)) continue;

      // Find all completed reviewer verdicts for this comment across past rounds
      const adjudicatedResponses = allKnownResponses
        .filter(
          (r) =>
            r.commentId === commentId && (r.verdict === 'Accepted' || r.verdict === 'Overruled'),
        )
        .sort(
          (a, b) =>
            b.reviewRound - a.reviewRound ||
            (b.respondedAt ?? '').localeCompare(a.respondedAt ?? ''),
        );

      const latestAdjudicatedResponse = adjudicatedResponses[0];
      // An issue carries forward if and only if the latest completed reviewer verdict was negative (Overruled)
      if (latestAdjudicatedResponse?.verdict === 'Overruled') {
        processedCommentIds.add(commentId);
        issues.push({
          commentId: comment.id,
          screenshotId: comment.screenshots[0]?.id ?? null,
          label: `Review Comment #${issues.length + 1} (Follow-Up)`,
          detail: comment.text,
          screenshots: comment.screenshots ?? [],
          isFollowUp: true,
          reviewerExplanation: latestAdjudicatedResponse.reviewerComment ?? null,
          previousResponseKind: latestAdjudicatedResponse.kind,
          previousRejectionReason: latestAdjudicatedResponse.rejectionReason ?? null,
          originRound: round,
          originCycle: round,
        });
      }
    }
  }

  // If we collected any active comment-based issues, return them
  if (issues.length > 0) {
    return issues;
  }

  // Legacy backwards compatibility for historical fixture cycles without review comments
  const legacyIssues: Issue[] = (review.screenshots ?? []).map((shot: ReviewScreenshot) => ({
    commentId: shot.id,
    screenshotId: shot.id,
    label: shot.fileName,
    detail: shot.comment,
    screenshots: [shot],
  }));

  const written = [
    review.findings?.incorrectCode,
    review.findings?.incompleteImplementation,
    review.findings?.sourceFormatting,
  ]
    .map((text) => text?.trim() ?? '')
    .filter((text) => text !== '');

  if (written.length > 0) {
    legacyIssues.push({
      commentId: 'legacy-findings',
      screenshotId: null,
      label: 'findings',
      detail: written.join('\n\n'),
      screenshots: [],
    });
  }

  return legacyIssues;
}

/**
 * The shape both a draft response and a stored one satisfy.
 */
export interface ResponseLike {
  commentId?: string | null | undefined;
  screenshotId?: string | null | undefined;
  kind: IssueResponseKind;
  rejectionReason?: string | null | undefined;
}

/** FL 2.11.2.3-01: a rejection without a written reason is not a rejection. */
export function isResponseComplete(response: ResponseLike): boolean {
  if (response.kind !== 'Rejected') return true;
  return (response.rejectionReason ?? '').trim() !== '';
}

export interface ResubmitReadiness {
  /** Issues with no answer at all. */
  unanswered: number;
  /** Rejections still missing their justification. */
  unjustified: number;
  canResubmit: boolean;
}

/**
 * Whether the developer may resubmit.
 */
export function resubmitReadiness(
  issues: readonly Issue[],
  responses: readonly ResponseLike[],
): ResubmitReadiness {
  let unanswered = 0;
  let unjustified = 0;

  for (const issue of issues) {
    const response = responses.find(
      (r) =>
        (r.commentId != null && r.commentId === issue.commentId) ||
        (issue.commentId === 'legacy-findings' && r.screenshotId === null) ||
        (issue.screenshotId != null && r.screenshotId === issue.screenshotId),
    );

    if (response === undefined) {
      unanswered += 1;
      continue;
    }
    if (!isResponseComplete(response)) unjustified += 1;
  }

  return {
    unanswered,
    unjustified,
    canResubmit: issues.length > 0 && unanswered === 0 && unjustified === 0,
  };
}
