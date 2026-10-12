import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ROUTES } from '@/config/routes.ts';
import { useSession } from '@/hooks/useSession.ts';

/**
 * Gate for everything behind sign-in.
 *
 * The attempted location is carried in router state so a deep link survives the
 * detour — someone following a notification link to a task lands on that task
 * after signing in, not on the home page having lost their place.
 *
 * This is a usability control, not a security boundary: the browser can always
 * be lied to. Enforcement is server-side: NestJS's JWT, role and CSRF guards
 * (apps/api app.module.ts) check every request.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const isAuthenticated = useSession((s) => s.isAuthenticated);
  /*
   * An expiry that has not been acknowledged yet is NOT a redirect.
   *
   * Without this the guard bounces to `/login` the instant the session dies, and
   * the user never learns why they lost their place — which is the whole point of
   * `SessionExpiredScreen`. While the flag is set, children render so `RootLayout`
   * can show the explanation; the redirect happens when the user dismisses it.
   *
   * Nothing is exposed by doing so: `expireSession()` has already purged storage
   * and the query cache, so there is no session and no data behind the screen.
   */
  const isExpired = useSession((s) => s.isExpired);
  const isChecking = useSession((s) => s.isChecking);
  const location = useLocation();

  if (!isAuthenticated && !isExpired && !isChecking) {
    return (
      <Navigate
        to={ROUTES.login}
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }

  return <>{children}</>;
}
