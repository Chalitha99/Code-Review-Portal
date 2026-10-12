import { reviewerPendingTasksDetailsSchema, type PendingReviewTask } from '@sdp/contracts';
import { ApiError } from '@/lib/apiClient.ts';

export const REVIEWER_HAS_PENDING_TASKS = 'REVIEWER_HAS_PENDING_TASKS';

/**
 * The tasks blocking a reviewer's deactivation, deletion or Reviewer-role
 * removal, or `null` when `cause` is any other failure. The server is the only
 * judge of what is pending, so the UI never pre-computes this list.
 */
export function pendingReviewTasksFrom(cause: unknown): PendingReviewTask[] | null {
  if (!(cause instanceof ApiError) || cause.code !== REVIEWER_HAS_PENDING_TASKS) return null;
  const parsed = reviewerPendingTasksDetailsSchema.safeParse(cause.details);
  return parsed.success ? parsed.data.tasks : [];
}
