/**
 * Review-round and cycle arithmetic shared by the developer and reviewer workspaces.
 * `reviews/domain/reviewRules` re-exports these for its callers.
 */

/**
 * The next strictly monotonic historical review round number, so a review id never
 * collides even after the business `countedCycle` was decremented.
 */
export function nextReviewRound(
  task: {
    reviewRound?: number | undefined;
    reviewCycle?: number | undefined;
    historicalCycle?: number | undefined;
  },
  existingReviews: readonly {
    reviewRound?: number | undefined;
    reviewCycle?: number | undefined;
  }[] = [],
): number {
  const highestExisting =
    existingReviews.length > 0
      ? Math.max(...existingReviews.map((r) => r.reviewRound ?? r.reviewCycle ?? 0))
      : 0;
  const currentHistorical = Math.max(
    task.reviewRound ?? 0,
    task.historicalCycle ?? 0,
    task.reviewCycle ?? 0,
    1,
  );
  return Math.max(highestExisting, currentHistorical) + 1;
}

/** Legacy alias for nextReviewRound */
export const nextHistoricalReviewCycle = nextReviewRound;

/**
 * The review round that developer responses and re-review adjudication belong to.
 *
 * Once a review has been decided and the task is back in rework or re-review,
 * the active round sits above every completed one, so responses get
 * round-scoped ids and never overwrite an earlier round's data.
 */
export function resolveActiveReviewRound(
  task: {
    reviewRound?: number | null;
    reviewCycle?: number | null | undefined;
    historicalCycle?: number | null | undefined;
    status?: string | null;
  },
  existingReviews: readonly {
    reviewRound?: number | null | undefined;
    reviewCycle?: number | null | undefined;
    decision?: string | null;
  }[] = [],
): number {
  const completedReviews = existingReviews.filter((r) => r.decision !== null);
  const highestCompletedRound =
    completedReviews.length > 0
      ? Math.max(...completedReviews.map((r) => r.reviewRound ?? r.reviewCycle ?? 0))
      : 0;
  const anyRound =
    existingReviews.length > 0
      ? Math.max(...existingReviews.map((r) => r.reviewRound ?? r.reviewCycle ?? 0))
      : 0;
  const taskRound = task.reviewRound ?? task.historicalCycle ?? task.reviewCycle ?? 1;

  const inRework =
    task.status === 'ChangesRequested' ||
    task.status === 'ReSubmitted' ||
    task.status === 'InReview';
  if (highestCompletedRound > 0 && inRework) {
    return Math.max(taskRound, highestCompletedRound + 1, anyRound);
  }

  return Math.max(taskRound, highestCompletedRound, anyRound, 1);
}

/** Legacy alias for resolveActiveReviewRound */
export const resolveActiveReviewCycle = resolveActiveReviewRound;

/** A round-scoped response id, so a response is never shared across rounds. */
export function createRoundResponseId(taskId: string, round: number, entityKey: string): string {
  const cleanKey =
    entityKey.startsWith('c-') || entityKey.startsWith('s-') ? entityKey : `c-${entityKey}`;
  return `resp-${taskId}-${String(round)}-${cleanKey}`;
}

/** Legacy alias for createRoundResponseId */
export const createCycleResponseId = createRoundResponseId;
