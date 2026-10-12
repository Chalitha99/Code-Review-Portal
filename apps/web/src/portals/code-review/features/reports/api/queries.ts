import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { reviewSchema } from '@sdp/contracts';
import { api } from '@/lib/apiClient.ts';

/**
 * Every decided review, for the admin Reports tab.
 *
 * Kept out of `hooks/` because only Reports reads the whole set — the reviewer's
 * own history and a task's cycle list are separate, narrower queries that answer
 * different questions.
 */

export const reportKeys = {
  reviews: ['reports', 'reviews'] as const,
};

export function useAllReviews() {
  return useQuery({
    queryKey: reportKeys.reviews,
    queryFn: ({ signal }) => api.get('/reviews', z.array(reviewSchema), { signal }),
    // Metrics tolerate a slightly stale read far better than every chart
    // refetching on each tab switch.
    staleTime: 60 * 1000,
  });
}
