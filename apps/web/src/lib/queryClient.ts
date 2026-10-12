import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './apiClient.ts';

/**
 * Shared TanStack Query configuration.
 *
 * The defaults matter more than usual here because the review queues are
 * contended: two reviewers can open Available Tasks at the same moment and both
 * try to pick the same task. Stale data makes that race more likely, so lists
 * refetch on focus rather than trusting a long cache.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        /**
         * Short but non-zero. Long enough that navigating between tabs does not
         * refire every request, short enough that a reviewer returning to the
         * queue sees who has claimed what.
         */
        staleTime: 30_000,
        gcTime: 5 * 60_000,

        refetchOnWindowFocus: true,
        refetchOnReconnect: true,

        retry: (failureCount, error) => {
          // A 400/403/404 will fail identically on retry, and retrying a 409
          // "already claimed" would just spam the server. Only retry transport
          // and 5xx failures.
          if (error instanceof ApiError && error.isClientError) return false;

          return failureCount < 2;
        },
      },
      mutations: {
        /**
         * Never auto-retry a mutation. Submitting a review or picking a task is
         * not idempotent — a retry could create a duplicate review cycle or
         * silently overwrite another reviewer's claim. The user retries.
         */
        retry: false,
      },
    },
  });
}
