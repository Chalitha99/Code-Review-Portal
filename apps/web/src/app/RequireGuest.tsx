import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { ROUTES } from '@/config/routes.ts';
import { useSession } from '@/hooks/useSession.ts';
import { redirectFromState } from '@/lib/safeRedirect.ts';
import { PageSkeleton } from '@/components/common/Skeleton.tsx';

/**
 * Gate for the screens that only make sense while signed out: sign-in and
 * forgot-password. The emailed-link screens (set-password, link-expired) sit
 * outside it so a link still opens in a browser that is already signed in.
 *
 * The counterpart of `RequireAuth`, as a layout route so every guest screen is
 * covered by one rule instead of each page re-checking the session. A signed-in
 * user is sent where they were going (`from`, validated) or to the CRP home,
 * which is also where signing in lands.
 *
 * Like `RequireAuth`, this shapes the experience and is not a security control:
 * a set-password link is only usable because the server accepts its token.
 */
export function RequireGuest() {
  const isAuthenticated = useSession((s) => s.isAuthenticated);
  const isChecking = useSession((s) => s.isChecking);
  const location = useLocation();

  // Wait for the session check rather than flashing a guest screen at a user
  // who is about to be recognised as signed in.
  if (isChecking) return <PageSkeleton className="min-h-screen" />;

  if (isAuthenticated) {
    return <Navigate to={redirectFromState(location.state) ?? ROUTES.home} replace />;
  }

  return <Outlet />;
}
