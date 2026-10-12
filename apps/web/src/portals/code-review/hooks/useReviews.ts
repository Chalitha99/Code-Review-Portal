import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { reviewHistoryEntrySchema, reviewSchema } from '@sdp/contracts';
import { absentAsNull, api } from '@/lib/apiClient.ts';

/**
 * Reading reviews — shared by both workspaces.
 *
 * The reviewer reads them to continue a review; the developer reads exactly the
 * same rows to answer the feedback and to see the cycle history. Writing a
 * review stays in `features/reviews`, which is the only place that decides one.
 */

export const reviewKeys = {
  all: ['reviews'] as const,
  generalCheck: () => ['general-check'] as const,
  current: (taskId: string) => [...reviewKeys.all, 'current', taskId] as const,
  history: (taskId: string) => [...reviewKeys.all, 'history', taskId] as const,
  mine: () => [...reviewKeys.all, 'mine'] as const,
  given: () => [...reviewKeys.all, 'given'] as const,
};

/**
 * Every decided review of the signed-in developer's own tasks.
 *
 * Backs the quality figures on the Analytics tab — a rank lives on a review, not
 * on a task, so there is no way to draw "My Quality Ranking" from the task list
 * alone. The server decides what "mine" means (see the `/reviews` handler); the
 * client cannot widen it by editing the query string.
 *
 * One request rather than one per task: a developer with forty tasks would
 * otherwise open forty connections to render one donut.
 */
export function useMyReviews() {
  return useQuery({
    queryKey: reviewKeys.mine(),
    queryFn: ({ signal }) =>
      api.get('/reviews', z.array(reviewSchema), {
        signal,
        searchParams: { scope: 'mine' },
      }),
    // Metrics tolerate a slightly stale read far better than a refetch on every
    // tab switch — the same reasoning as the admin Reports query.
    staleTime: 60 * 1000,
  });
}

/**
 * Every review the signed-in user GAVE, decided or still open.
 *
 * The mirror image of `useMyReviews`, and the pair is easy to confuse: that one
 * is reviews OF this person's work, this one is reviews BY them. Backs the
 * Reviewer Analytics tab, where every figure is about what the reviewer did.
 *
 * Keyed on the review's own `reviewerId` server-side, not on the task's — a
 * Request Changes decision clears `task.reviewerId`, so a reviewer's own task
 * queue silently drops every review that found a problem. Counting from the
 * review is what makes "Changes Requested" a number rather than a blank.
 *
 * Undecided rows come back too, deliberately: the page needs the open ones to
 * report queue depth, and filters to decided reviews where a decision is the
 * point (`decidedReviews` in `lib/reviewStats.ts`).
 */
export function useReviewsGiven() {
  return useQuery({
    queryKey: reviewKeys.given(),
    queryFn: ({ signal }) =>
      api.get('/reviews', z.array(reviewSchema), {
        signal,
        searchParams: { scope: 'reviewer' },
      }),
    // Same reasoning as `useMyReviews`: metrics tolerate a stale read far better
    // than a refetch on every tab switch.
    staleTime: 60 * 1000,
  });
}

/** The in-progress review for the task's current cycle; `null` before one exists. */
export function useCurrentReview(taskId: string | undefined) {
  return useQuery({
    queryKey: reviewKeys.current(taskId ?? ''),
    queryFn: ({ signal }) =>
      api.get(`/tasks/${taskId ?? ''}/review`, absentAsNull(reviewSchema), {
        signal,
      }),
    enabled: taskId !== undefined && taskId !== '',
  });
}

/** Past cycles, newest first — screen 14, and the developer's feedback history. */
export function useReviewHistory(taskId: string | undefined) {
  return useQuery({
    queryKey: reviewKeys.history(taskId ?? ''),
    queryFn: ({ signal }) =>
      api.get(`/tasks/${taskId ?? ''}/reviews`, z.array(reviewHistoryEntrySchema), { signal }),
    enabled: taskId !== undefined && taskId !== '',
  });
}
