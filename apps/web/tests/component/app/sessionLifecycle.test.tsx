import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { signOutForTest } from '@tests/support/setup.ts';
import { apiError, apiStub } from '@tests/support/apiStub.ts';
import { buildDataset } from '@tests/support/fixtures/dataset.ts';
import { serveNotifications, serveReferenceData, serveTaskLists } from '@tests/support/serve.ts';
import { initialiseSession, useSession } from '@/hooks/useSession.ts';
import { routes } from '@/app/routes.tsx';
import { AppProviders } from '@/app/providers.tsx';

/**
 * The session lifecycle, end to end through the real route table.
 *
 * Everything here was previously uncovered — `initialiseSession` had literally
 * zero test coverage — and it is where a real, user-visible bug lived: an
 * authentication error appearing minutes after launch, with a "Try again" that
 * could not work.
 */

/** A browser-storage identity of the kind the old demo build used; never trusted. */
const KEY = 'sdp.mock-user-id';
const USER = 'u-hiruni';
const hiruni = buildDataset().users.find((user) => user.id === USER);

function renderApp(initialPath = '/') {
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] });

  return {
    ...render(
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>,
    ),
    router,
    user: userEvent.setup({ delay: null }),
  };
}

/** NestJS recognises the HttpOnly session cookie: GET /auth/me answers with the user. */
function seedCookieSession(): void {
  apiStub.get('/auth/me', () => hiruni);
}

function seedActiveSession(): void {
  seedCookieSession();
  useSession.setState({
    userId: USER,
    isAuthenticated: true,
    isChecking: false,
    didExpire: false,
    isExpired: false,
  });
}

beforeEach(() => {
  // Start from genuinely signed out: these tests are about what the STORED
  // session does, so the in-memory shortcut the harness normally uses would
  // mask exactly what is under test.
  signOutForTest();
  const data = serveReferenceData();
  serveNotifications(data);
  serveTaskLists({});
  window.localStorage.clear();
  window.sessionStorage.clear();
  useSession.setState({
    userId: null,
    isAuthenticated: false,
    didExpire: false,
  });
});

describe('booting from a cookie-backed session', () => {
  it('restores a live session through /auth/me', async () => {
    seedCookieSession();
    initialiseSession();

    expect(useSession.getState().isAuthenticated).toBe(false);
    expect(useSession.getState().isChecking).toBe(true);

    const { router } = renderApp('/');
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/');
    });
    // The account chip only exists once `/auth/me` has resolved a principal.
    // Asserting on a heading would not do: the login page has one too, so the
    // test would pass while sitting on the login screen.
    expect(await screen.findByRole('button', { name: /account menu/i })).toBeInTheDocument();
  });

  /**
   * The negative control. Before the expiry envelope existed, storage held a
   * bare user id and a session lived forever — this is the case that proves the
   * two-hour limit is real rather than decorative.
   */
  it('lands on login when /auth/me finds no cookie-backed session', async () => {
    initialiseSession();

    expect(useSession.getState().isAuthenticated).toBe(false);
    expect(window.localStorage.getItem(KEY)).toBeNull();

    const { router } = renderApp('/');
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/login');
    });
  });

  /** Browser storage is never accepted as proof of authentication. */
  it('ignores a forged browser-storage identity', async () => {
    window.localStorage.setItem(KEY, USER);
    initialiseSession();

    const { router } = renderApp('/');
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(useSession.getState().isAuthenticated).toBe(false);
  });
});

/** Makes GET /auth/me reject the session, as NestJS rejects an expired one. */
function rejectTheSession(): void {
  apiStub.get('/auth/me', () => apiError(401, 'AUTH_REQUIRED', 'Unauthorized'));
  apiStub.get('/tasks', () => apiError(401, 'AUTH_REQUIRED', 'Unauthorized'));
  apiStub.get('/notifications', () => apiError(401, 'AUTH_REQUIRED', 'Unauthorized'));
}

describe('a session rejected mid-flight', () => {
  /**
   * The regression test for a real crash.
   *
   * `RootLayout` used to call `signOut()` from its RENDER BODY on a 401. That
   * write notified `RequireAuth`, which subscribes to the same store from above
   * it, so a component that had already rendered was invalidated mid-render — and
   * because the 401 was still there on the next pass it fired again every render.
   * React threw on the loop and the route boundary showed "This page ran into a
   * problem", which is what the user reported.
   *
   * Asserting the ABSENCE of that boundary is the point of this test. The screen
   * assertion below would pass even with the loop, because the boundary renders
   * in place of the layout and the test would simply not find the screen either.
   */
  it('explains the expiry instead of crashing into the error boundary', async () => {
    seedActiveSession();
    rejectTheSession();

    const { router } = renderApp('/crp/developer');

    expect(await screen.findByText(/you’ve been signed out/i)).toBeInTheDocument();
    expect(screen.queryByText(/this page ran into a problem/i)).toBeNull();

    // Told what happened AND what was done about it — not bounced silently.
    expect(screen.getByText(/secure sign-in has expired/i)).toBeInTheDocument();
    expect(screen.getByText(/have been cleared/i)).toBeInTheDocument();

    // The purge happens up front, so nothing sensitive sits behind the screen.
    expect(useSession.getState().isAuthenticated).toBe(false);
    expect(window.localStorage.getItem(KEY)).toBeNull();

    // Deliberately still on the route the user was on: the redirect is theirs to
    // trigger, which is what makes the explanation readable.
    expect(router.state.location.pathname).toBe('/crp/developer');
  });

  it('purges everything stored for the user, not just the session envelope', async () => {
    // A half-finished wizard draft. It used to survive a sign-out, so the next
    // person to sign in on a shared browser inherited a stranger's task.
    window.sessionStorage.setItem('sdp.taskDraft', JSON.stringify({ state: { crimId: 'CRIM-1' } }));

    seedActiveSession();
    rejectTheSession();

    renderApp('/crp/developer');
    await screen.findByText(/you’ve been signed out/i);

    expect(window.sessionStorage.getItem('sdp.taskDraft')).toBeNull();
  });

  it('goes to the login form, with its notice, when the user asks', async () => {
    seedActiveSession();
    rejectTheSession();

    const { router, user } = renderApp('/crp/developer');
    await screen.findByText(/you’ve been signed out/i);

    await user.click(screen.getByRole('button', { name: /sign in again/i }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/login');
    });

    // `didExpire` outlives the screen, so the reminder is still there on the form.
    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
    expect(screen.getByText(/you’ve been signed out/i)).toBeInTheDocument();
  });
});
