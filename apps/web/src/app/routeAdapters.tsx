import { useLocation, useNavigate } from 'react-router-dom';
import { ROUTES } from '@/config/routes.ts';
import { routePaths } from '@/constants/routePaths';
import { redirectFromState } from '@/lib/safeRedirect.ts';
import { LoginPage } from '@/features/auth/routes/LoginPage.tsx';
import { HomePage } from '@/features/home/routes/HomePage.tsx';
import { useSessionUser } from './session.ts';

/**
 * Thin adapters between the router and feature routes.
 *
 * They read the session resolved by `RootLayout` and hand it down as a plain
 * prop, which is what lets feature routes stay unaware of the auth feature —
 * required by the boundary rules, and it makes those routes trivial to render
 * in tests with a fabricated user.
 *
 * Kept out of `router.tsx` so that file exports only the router, which is what
 * Fast Refresh needs to reload routes without a full page reload.
 */

/** Mounted under `RequireGuest`, which already keeps signed-in users out. */
export function LoginRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = redirectFromState(location.state);

  return (
    <LoginPage
      // Temporary local sign-in; goes when SSO arrives (see features/local-auth/config.ts).
      forgotPasswordTo={routePaths.forgotPassword}
      onSignedIn={() => {
        // `replace` so Back does not return to the login screen after signing in.
        void navigate(from ?? ROUTES.home, { replace: true });
      }}
    />
  );
}

export function HomeRoute() {
  const user = useSessionUser();
  return <HomePage user={user} />;
}
