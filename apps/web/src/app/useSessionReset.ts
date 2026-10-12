import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
/*
 * The one place `src/app` is allowed to name a portal — see the KNOWN EXCEPTION
 * note below. Disabled explicitly rather than widened in the policy, so the
 * exception is greppable and a second one cannot appear silently.
 */
/* eslint-disable boundaries/dependencies */
import { useTaskDraft } from '@/portals/code-review/features/tasks/hooks/useTaskDraft.ts';
/* eslint-enable boundaries/dependencies */
import { useSession } from '@/hooks/useSession.ts';

/**
 * Discards everything the previous user left in memory when a session ends.
 *
 * `clearUserStorage()` handles what is on disk. This handles what is not:
 *
 * - **The query cache.** Otherwise the next person to sign in on this browser is
 *   served the previous user's tasks out of cache until each query happens to go
 *   stale. `useLogout` already did this, but only on the Sign-out button — so the
 *   two paths that matter most, the expiry timer and a 401, left it behind.
 * - **The wizard draft store.** Its persisted copy is purged with the rest of
 *   `sdp.*`, but the Zustand store's live state survives inside the running page,
 *   and it is the store the wizard reads. Clearing one without the other leaves
 *   a half-written task on screen that no longer exists anywhere.
 *
 *   `reset()` then `clearStorage()`, in that order and both needed. `reset()`
 *   goes through the `persist` middleware, which promptly writes the emptied
 *   state straight back to `sessionStorage` — so resetting alone re-creates the
 *   `sdp.taskDraft` key that `clearUserStorage()` had just removed. Caught by
 *   `e2e/sessionExpiry.spec.ts`, which asserts the key is gone.
 *
 * Watching the transition rather than the value: firing on every render where
 * nobody is signed in would clear the cache continuously on the login screen and
 * fight the sign-in mutation that is trying to seed it.
 *
 * Lives in `app/` because sign-out is genuinely an application-wide concern
 * rather than any one feature's.
 *
 * KNOWN EXCEPTION to the layer rule. The store it clears now lives inside
 * the Code Review portal, so this is the one file in `src/app` that imports
 * `@/portals/*`. It was a legal downward import while `features/tasks` was
 * top-level; moving the portal-specific features under `portals/code-review`
 * turned it into a boundary crossing.
 *
 * It is left as-is deliberately: the correct fix is to invert the dependency —
 * each portal registers a reset callback that the shell invokes, so the shell
 * never names a portal — and that is a design change, not the relocation this
 * migration is doing. It also sits on the session lifecycle, which
 * `e2e/sessionExpiry.spec.ts` guards. Recorded in the replan rather than
 * attempted here.
 */
export function useSessionReset(): void {
  const queryClient = useQueryClient();
  const isAuthenticated = useSession((state) => state.isAuthenticated);
  const wasAuthenticated = useRef(isAuthenticated);

  useEffect(() => {
    if (wasAuthenticated.current && !isAuthenticated) {
      queryClient.clear();
      useTaskDraft.getState().reset();
      useTaskDraft.persist.clearStorage();
    }
    wasAuthenticated.current = isAuthenticated;
  }, [isAuthenticated, queryClient]);
}
