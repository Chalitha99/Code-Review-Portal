import { useOutletContext } from 'react-router-dom';
import type { User } from '@sdp/contracts';

export interface SessionContext {
  user: User;
}

/**
 * The authenticated principal, resolved once by `RootLayout`.
 *
 * Routes read the user from here rather than each calling `useCurrentUser`,
 * which keeps two guarantees in one place: the user is never null below the
 * layout, and feature routes do not have to import the auth feature (which the
 * boundary rules forbid). The app layer passes it down as a plain prop instead.
 */
export function useSessionUser(): User {
  return useOutletContext<SessionContext>().user;
}
