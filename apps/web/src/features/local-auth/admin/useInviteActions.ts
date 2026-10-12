import { useMutation, useQueryClient } from '@tanstack/react-query';
import { resendInvite, revokeInvite, sendResetLink } from '../api/localAuthApi.ts';

/**
 * Mutations behind the Users tab's invite actions. Each refreshes the user list
 * so the status pill and Invite column reflect what the server now holds.
 * Adding a user is the portal's ordinary create, which sends the first invite.
 */

/** `usersKey` is the user list's query key, passed in so this folder stays free of portal imports. */
function useRefreshUsers(usersKey: readonly unknown[]) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: usersKey });
}

export function useResendInvite(usersKey: readonly unknown[]) {
  const refresh = useRefreshUsers(usersKey);
  return useMutation({
    mutationFn: (userId: string) => resendInvite(userId),
    onSuccess: refresh,
  });
}

export function useSendResetLink() {
  return useMutation({ mutationFn: (userId: string) => sendResetLink(userId) });
}

export function useRevokeInvite(usersKey: readonly unknown[]) {
  const refresh = useRefreshUsers(usersKey);
  return useMutation({
    mutationFn: (userId: string) => revokeInvite(userId),
    onSuccess: refresh,
  });
}
