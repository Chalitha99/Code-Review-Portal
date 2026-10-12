import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { userSchema, type User } from '@sdp/contracts';
import { api } from '@/lib/apiClient.ts';
import { currentUserKeys } from '@/hooks/useCurrentUser.ts';
import { useSession } from '@/hooks/useSession.ts';
import type { LoginInput } from '../domain/loginSchema.ts';

/**
 * Sign-in and sign-out.
 *
 * `useCurrentUser` deliberately lives in `hooks/`, not here: every feature needs
 * to know who is asking, and a cross-feature import for that would be shared
 * infrastructure wearing a feature's name. What remains in this file is what
 * only the auth feature does.
 */

/**
 * Sign in.
 *
 * The session is only established after the server confirms the credentials, so
 * a failed attempt cannot leave the app half-authenticated.
 */
export function useLogin() {
  const queryClient = useQueryClient();
  const signIn = useSession((s) => s.signIn);

  return useMutation({
    mutationFn: (input: LoginInput) =>
      api.post('/auth/login', userSchema, {
        email: input.email,
        password: input.password,
        remember: input.remember,
      }),
    onSuccess: (user: User, input) => {
      // Every list in the app is scoped to the caller, so an identity change
      // clears the whole cache rather than invalidating selectively.
      queryClient.clear();
      signIn(user.id, input.remember);
      // Seed the cache so the app does not immediately refetch a user we
      // already hold, which would otherwise flash a loading state after login.
      queryClient.setQueryData(currentUserKeys.me(), user);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const signOut = useSession((s) => s.signOut);

  return useMutation({
    mutationFn: () => api.post('/auth/logout', z.undefined()),
    // `onSettled`, not `onSuccess`: if the logout call fails we still clear the
    // local session. Leaving a user signed in because the server was
    // unreachable is the worse outcome.
    onSettled: () => {
      signOut();
      queryClient.clear();
    },
  });
}
