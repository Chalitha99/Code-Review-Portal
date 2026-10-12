import { useQuery } from '@tanstack/react-query';
import { userSchema } from '@sdp/contracts';
import { api } from '@/lib/apiClient.ts';
import { useSession } from './useSession.ts';

/**
 * The authenticated principal.
 *
 * Lives in `hooks/` rather than inside `features/auth` because almost every
 * feature needs to know who is asking — the developer workspace to greet them,
 * the task screens to decide which actions the status machine permits. Leaving
 * it in the auth feature would have made "who am I" a cross-feature import,
 * which the boundary rules correctly reject: a thing five features need is
 * shared infrastructure, not one feature's internals.
 *
 * `features/auth` keeps what is genuinely its own — the login form, sign-in and
 * sign-out.
 *
 * Disabled while signed out, so it does not fire a request guaranteed to 401 and
 * put the app into an error state on the login screen, where being
 * unauthenticated is the expected condition.
 */

export const currentUserKeys = {
  all: ['auth'] as const,
  me: () => [...currentUserKeys.all, 'me'] as const,
};

export function useCurrentUser() {
  const isChecking = useSession((s) => s.isChecking);
  const isAuthenticated = useSession((s) => s.isAuthenticated);

  return useQuery({
    // Keyed by user so switching identity refetches rather than serving a stale
    // principal from cache.
    queryKey: currentUserKeys.me(),
    queryFn: ({ signal }) => api.get('/auth/me', userSchema, { signal }),
    enabled: isChecking || isAuthenticated,
    staleTime: 5 * 60_000,
  });
}
