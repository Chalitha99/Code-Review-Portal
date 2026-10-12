import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { focusManager } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { signOutForTest } from '@tests/support/setup.ts';
import { initialiseSession, useSession } from '@/hooks/useSession.ts';
import { apiStub } from '@tests/support/apiStub.ts';
import { buildDataset } from '@tests/support/fixtures/dataset.ts';
import {
  serveNotifications,
  serveReferenceData,
  serveSignIn,
  serveTaskDetail,
  serveWorkspacesForNavigation,
} from '@tests/support/serve.ts';
import { routes } from '@/app/routes.tsx';
import { AppProviders } from '@/app/providers.tsx';

/**
 * A session that dies while the user is away, and the trip back to their work.
 *
 * THE SCENARIO
 * A user signs in, opens a screen, and leaves the tab idle for hours. While they
 * are away the server ends the session. When they come back, the app must:
 *
 *   1. show the "You've been signed out" screen — on the screen they were on,
 *      not a crash and not a silent bounce to the login form;
 *   2. after "Sign in again" and a successful sign-in, put them back on EXACTLY
 *      that screen — same path, same query string — not on Home.
 *
 * The expiry screen promises the second part in its own copy ("Sign in again and
 * you'll come straight back to where you were"), so it is a requirement, not a
 * nicety.
 *
 * HOW "HOURS IDLE" IS MODELLED
 * Session lifetime is owned by the server (HttpOnly cookies); the client learns
 * the session is gone from the first 401. So the test does what the real world
 * does: the clock jumps forward three hours, the server starts rejecting the
 * session, and the window regains focus — which is what refetches the stale
 * principal when a user returns to an idle tab. Only `Date` is faked, so
 * Testing Library polling still runs on real timers.
 */

const IDENTITY_KEY = 'sdp.mock-user-id';
const USER_ID = 'u-hiruni';
const EMAIL = 'hiruni.wijethilaka@sebsaworld.com';
const PASSWORD = 'Correct-Horse-2026';
const THREE_HOURS_MS = 3 * 60 * 60 * 1000;

/** Owned by `u-hiruni` in the fixture tasks. */
const TASK_ID = 't-blom-010';

/**
 * Server-side session state for the test. While `revoked`, every API call except
 * sign-in answers 401, exactly as an expired session does. A successful sign-in
 * issues a new session, which clears the flag.
 */
let revoked = false;

function installServerSession(): void {
  revoked = false;
  const data = buildDataset();
  serveReferenceData(data);
  serveNotifications(data);
  serveWorkspacesForNavigation(data);
  serveTaskDetail(
    data,
    data.tasks.find((task) => task.id === TASK_ID)!,
  );
  serveSignIn(data, PASSWORD);
  // The cookie session: every request answers 401 while it is revoked, except
  // signing in, which issues a fresh session.
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.endsWith('/api/auth/login')) revoked = false;
    else if (revoked) {
      return Promise.resolve(
        new Response(
          JSON.stringify({ statusCode: 401, code: 'AUTH_REQUIRED', message: 'Unauthorized' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    }
    return apiStub.fetch(input, init);
  });
}

/** Boots the real app, signed in from storage, at `path`. */
function renderSignedInApp(path: string) {
  // The real app restores the HttpOnly cookie session via /auth/me; browser
  // storage is never an authentication source.
  const account = buildDataset().users.find((candidate) => candidate.id === USER_ID);
  apiStub.get('/auth/me', () => account);
  initialiseSession();

  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const utils = render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { ...utils, router, user: userEvent.setup({ delay: null }) };
}

/** Path plus query string, as the user would see it in the address bar. */
function currentUrl(router: ReturnType<typeof createMemoryRouter>): string {
  return `${router.state.location.pathname}${router.state.location.search}`;
}

/** The account chip renders only once `/auth/me` has resolved a principal. */
async function waitUntilWorking(): Promise<void> {
  expect(await screen.findByRole('button', { name: /account menu/i })).toBeInTheDocument();
}

/** The user walks away for three hours; the server ends the session meanwhile. */
function idleForHoursWhileServerExpiresSession(): void {
  vi.setSystemTime(Date.now() + THREE_HOURS_MS);
  revoked = true;
}

/** The user comes back to the tab. */
function returnToTheTab(): void {
  act(() => {
    focusManager.setFocused(false);
    focusManager.setFocused(true);
  });
}

async function signInAgain(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('button', { name: /sign in again/i }));
  await user.type(await screen.findByLabelText(/work email/i), EMAIL);
  await user.type(screen.getByLabelText(/^password/i), PASSWORD);
  await user.click(screen.getByRole('button', { name: /^sign in$/i }));
}

// The analytics route is a lazy module pulling in Recharts; its first cold transform can
// outlast a `findBy` budget, so load it once up front (as `developerAnalytics.test.tsx` does).
beforeAll(async () => {
  await import('@/portals/code-review/features/tasks/routes/AnalyticsPage.tsx');
}, 60_000);

beforeEach(() => {
  // Signed out with nothing stored: each test signs in from storage itself, so
  // the harness's in-memory identity override cannot mask a lost session.
  signOutForTest();
  window.localStorage.clear();
  window.sessionStorage.clear();
  useSession.setState({ didExpire: false, isExpired: false });
  vi.useFakeTimers({ toFake: ['Date'] });
  installServerSession();
});

afterEach(() => {
  vi.useRealTimers();
  focusManager.setFocused(undefined);
});

describe('idle session expiry', () => {
  it('shows the signed-out screen on the screen the user was working on', async () => {
    const start = `/crp/developer/tasks/${TASK_ID}`;
    const { router } = renderSignedInApp(start);
    await waitUntilWorking();

    idleForHoursWhileServerExpiresSession();
    returnToTheTab();

    expect(await screen.findByText(/you’ve been signed out/i)).toBeInTheDocument();
    expect(screen.getByText(/come straight back to where you were/i)).toBeInTheDocument();
    // Not the crash it used to be, and not a bounce: still on the user's screen.
    expect(screen.queryByText(/this page ran into a problem/i)).toBeNull();
    expect(currentUrl(router)).toBe(start);
    // The session is already gone behind the screen.
    expect(useSession.getState().isAuthenticated).toBe(false);
    expect(window.localStorage.getItem(IDENTITY_KEY)).toBeNull();
  });

  /*
   * The regression that real browsers hit. Returning to an idle tab refetches
   * every stale query AT ONCE — about nine on a task screen — so nine 401s land
   * together. The first expired the session; the second, seeing nobody signed in
   * any more, called a plain `signOut()` that cancelled the expiry, and the user
   * was bounced to the login form with no explanation.
   */
  it('stays on the signed-out screen when many requests fail at once', async () => {
    const start = `/crp/developer/tasks/${TASK_ID}`;
    const { router } = renderSignedInApp(start);
    await waitUntilWorking();

    idleForHoursWhileServerExpiresSession();
    act(() => {
      for (let i = 0; i < 9; i += 1) window.dispatchEvent(new Event('sdp:unauthorized'));
    });

    expect(await screen.findByText(/you’ve been signed out/i)).toBeInTheDocument();
    // Long enough for any redirect the burst might trigger to have happened.
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(screen.getByRole('button', { name: /sign in again/i })).toBeInTheDocument();
    expect(currentUrl(router)).toBe(start);
    expect(useSession.getState()).toMatchObject({ isExpired: true, didExpire: true });
  });

  it('keeps the login reminder when late 401s arrive after "Sign in again"', async () => {
    const start = `/crp/developer/tasks/${TASK_ID}`;
    const { router, user } = renderSignedInApp(start);
    await waitUntilWorking();

    idleForHoursWhileServerExpiresSession();
    returnToTheTab();
    await user.click(await screen.findByRole('button', { name: /sign in again/i }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/login');
    });

    // A request that was still in flight fails after the user has moved on.
    act(() => {
      window.dispatchEvent(new Event('sdp:unauthorized'));
    });

    expect(screen.getByText(/you’ve been signed out/i)).toBeInTheDocument();
    expect(useSession.getState().didExpire).toBe(true);
  });

  it('keeps the user signed in while the server still accepts the session', async () => {
    const start = `/crp/developer/tasks/${TASK_ID}`;
    const { router } = renderSignedInApp(start);
    await waitUntilWorking();

    // Same three hours away, but the server has not ended the session.
    vi.setSystemTime(Date.now() + THREE_HOURS_MS);
    returnToTheTab();

    // Give the focus refetch time to land, then confirm nothing changed.
    await waitFor(() => {
      expect(useSession.getState().isChecking).toBe(false);
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(screen.queryByText(/you’ve been signed out/i)).toBeNull();
    expect(useSession.getState().isAuthenticated).toBe(true);
    expect(currentUrl(router)).toBe(start);
  });
});

describe('signing back in after an idle expiry', () => {
  /*
   * One screen from each workspace, plus a list whose filters live in the query
   * string — losing `?status=…` would put the user back on the right page with
   * the wrong data, which is as disorienting as the wrong page.
   */
  it.each([
    ['a developer task', `/crp/developer/tasks/${TASK_ID}`],
    ['a filtered developer task list', '/crp/developer?status=InReview&priority=High'],
    ['developer analytics', '/crp/developer/analytics'],
    ['the reviewer queue', '/crp/reviewer/my-tasks'],
    ['admin user management', '/crp/admin/users'],
    ['an admin task', `/crp/admin/tasks/${TASK_ID}`],
  ])('returns the user to %s', async (_label, start) => {
    const { router, user } = renderSignedInApp(start);
    await waitUntilWorking();
    expect(currentUrl(router)).toBe(start);

    idleForHoursWhileServerExpiresSession();
    returnToTheTab();
    await screen.findByText(/you’ve been signed out/i);

    await signInAgain(user);

    await waitFor(() => {
      expect(currentUrl(router)).toBe(start);
    });
    await waitUntilWorking();
    expect(useSession.getState().isAuthenticated).toBe(true);
    // The reminder has done its job and is gone.
    expect(screen.queryByText(/you’ve been signed out/i)).toBeNull();
  });

  it('does not leave the login screen in Back history after returning', async () => {
    const start = `/crp/developer/tasks/${TASK_ID}`;
    const { router, user } = renderSignedInApp(start);
    await waitUntilWorking();

    idleForHoursWhileServerExpiresSession();
    returnToTheTab();
    await screen.findByText(/you’ve been signed out/i);
    await signInAgain(user);
    await waitFor(() => {
      expect(currentUrl(router)).toBe(start);
    });

    // Back must not land on the sign-in form the user has just used.
    await act(async () => {
      await router.navigate(-1);
    });
    expect(router.state.location.pathname).not.toBe('/login');
  });
});

describe('ordinary sign-in is unchanged', () => {
  it('a sign-in with no expired session behind it goes to the portal home', async () => {
    signOutForTest();
    const router = createMemoryRouter(routes, { initialEntries: ['/login'] });
    render(
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>,
    );
    const user = userEvent.setup({ delay: null });

    await user.type(await screen.findByLabelText(/work email/i), EMAIL);
    await user.type(screen.getByLabelText(/^password/i), PASSWORD);
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/crp');
    });
  });
});
