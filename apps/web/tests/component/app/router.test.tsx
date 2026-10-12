import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { signInForTest, signOutForTest } from '@tests/support/setup.ts';
import { useSession } from '@/hooks/useSession.ts';
import { routes } from '@/app/routes.tsx';
import { apiStub } from '@tests/support/apiStub.ts';
import {
  serveNotifications,
  serveReferenceData,
  serveSignIn,
  serveTaskLists,
  serveTaskSummary,
} from '@tests/support/serve.ts';

/**
 * Router-level integration tests.
 *
 * This is the coverage that was missing when sign-in broke in the browser while
 * nine LoginPage tests passed: those mount `<LoginPage>` directly and never
 * touch `RequireAuth`, `LoginRoute`, the redirect-with-`from`, or the
 * post-login navigation. Everything here drives the REAL route table.
 */

const SEEDED_EMAIL = 'hiruni.wijethilaka@sebsaworld.com';
const PASSWORD = 'Correct-Horse-2026';

beforeEach(() => {
  const data = serveReferenceData();
  serveSignIn(data, PASSWORD);
  serveNotifications(data);
  serveTaskSummary(12);
  serveTaskLists({});
  apiStub.get('/handovers', () => []);
  apiStub.get('/reviews', () => []);
  apiStub.get('/auth/link-policy', () => ({
    inviteTtlMinutes: 1440,
    resetTtlMinutes: 60,
    resendCooldownSeconds: 60,
  }));
  // The emailed-link screen validates its token before showing the form.
  apiStub.post('/auth/token/validate', () => ({
    status: 'valid',
    purpose: 'INVITE',
    emailHint: 'd***@sebsaworld.com',
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  }));
});

function renderApp(initialPath = '/') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  const router = createMemoryRouter(routes, { initialEntries: [initialPath] });

  const utils = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  return { ...utils, router, user: userEvent.setup({ delay: null }) };
}

async function signInThroughTheForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText(/work email/i), SEEDED_EMAIL);
  await user.type(screen.getByLabelText(/^password/i), PASSWORD);
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('unauthenticated routing', () => {
  it('redirects the home page to /login', async () => {
    signOutForTest();
    const { router } = renderApp('/');

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('renders the login page directly at /login without looping', async () => {
    signOutForTest();
    const { router } = renderApp('/login');

    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    // The failure this guards: /login falling through to the `*` catch-all
    // inside `/`, which redirects to /404, which RequireAuth bounces back to
    // /login — an infinite loop that presents as "I cannot log in".
    expect(router.state.location.pathname).toBe('/login');
  });

  it('remembers the attempted destination on a deep link', async () => {
    signOutForTest();
    const { router } = renderApp('/crp/admin');

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(router.state.location.state).toMatchObject({ from: '/crp/admin' });
  });
});

describe('signing in', () => {
  it('lands on the home page and greets the user by name', async () => {
    signOutForTest();
    const { router, user } = renderApp('/');

    await screen.findByRole('button', { name: 'Sign in' });
    await signInThroughTheForm(user);

    await waitFor(() => expect(router.state.location.pathname).toBe('/crp'));

    // The identity must reach the PAGE, not just the store. It appears in two
    // places by design, so each is asserted where it belongs rather than with
    // one ambiguous text match: the header account chip, and the greeting.
    await waitFor(() => {
      const header = screen.getByRole('banner');
      expect(within(header).getByText('Hiruni Wijethilaka')).toBeInTheDocument();
    });

    // Portal Home greets the signed-in user, so the name appears twice: once in
    // the header chip, once in the greeting. Asserting the count is more robust
    // than matching the greeting sentence, which spans multiple elements.
    await waitFor(() => {
      expect(screen.getAllByText('Hiruni Wijethilaka').length).toBeGreaterThanOrEqual(2);
    });
  });

  it('returns to the originally requested page after signing in', async () => {
    signOutForTest();
    const { router, user } = renderApp('/crp/admin');

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    await signInThroughTheForm(user);

    await waitFor(() => expect(router.state.location.pathname).toBe('/crp/admin'));
  });

  it('rejects a wrong password without signing in', async () => {
    signOutForTest();
    const { router, user } = renderApp('/');

    await screen.findByRole('button', { name: 'Sign in' });
    await user.type(screen.getByLabelText(/work email/i), SEEDED_EMAIL);
    await user.type(screen.getByLabelText(/^password/i), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.');
    expect(router.state.location.pathname).toBe('/login');
    expect(useSession.getState().isAuthenticated).toBe(false);
  });
});

describe('authenticated routing', () => {
  it('sends an already signed-in user away from /login', async () => {
    signInForTest();
    const { router } = renderApp('/login');

    await waitFor(() => expect(router.state.location.pathname).toBe('/crp'));
  });

  it('renders a workspace the user has access to', async () => {
    signInForTest(); // u-charith holds all three roles
    const { router } = renderApp('/crp/admin');

    await waitFor(() => expect(router.state.location.pathname).toBe('/crp/admin'));
    expect(
      await screen.findByRole('heading', { name: 'Admin Dashboard', level: 1 }),
    ).toBeInTheDocument();
  });

  it('keeps an admin-only account out of the developer and reviewer workspaces', async () => {
    // Governance: each workspace needs its own role; Admin does not imply the others.
    signInForTest('u-qa-admin');
    for (const path of ['/crp/developer', '/crp/reviewer']) {
      const { router, unmount } = renderApp(path);
      await waitFor(() => expect(router.state.location.pathname).not.toBe(path));
      unmount();
    }
  });

  it('lets a Super Admin into the admin workspace', async () => {
    signInForTest('u-qa-superadmin');
    const { router } = renderApp('/crp/admin');

    await waitFor(() => expect(router.state.location.pathname).toBe('/crp/admin'));
    expect(
      await screen.findByRole('heading', { name: 'Admin Dashboard', level: 1 }),
    ).toBeInTheDocument();
  });

  it('ignores an off-site `from` and lands on the CRP home instead', async () => {
    signInForTest();
    const router = createMemoryRouter(routes, {
      initialEntries: [{ pathname: '/login', state: { from: '//evil.example/phish' } }],
    });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(router.state.location.pathname).toBe('/crp'));
  });

  it('redirects an unknown path to /404 rather than crashing', async () => {
    signInForTest();
    const { router } = renderApp('/definitely-not-a-route');

    await waitFor(() => expect(router.state.location.pathname).toBe('/404'));
  });
});

/**
 * The guest-only screens of the temporary local sign-in. They are public — no
 * flag, no env file — but only while signed out: `RequireGuest` sends a
 * signed-in user to the CRP home, the same place signing in lands.
 */
describe('guest-only routes', () => {
  it.each([
    ['/forgot-password', 'Forgot your password?'],
    ['/link-expired', "This link can't be used"],
  ])('renders %s while signed out', async (path, heading) => {
    signOutForTest();
    const { router } = renderApp(path);

    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(path);
  });

  it('opens /set-password from an emailed link while signed out', async () => {
    signOutForTest();
    window.history.replaceState(null, '', '/set-password#token=demo-invite');
    const { router } = renderApp('/set-password');

    expect(
      await screen.findByRole('heading', { name: 'Create your password' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/set-password');
    window.history.replaceState(null, '', '/');
  });

  it.each(['/login', '/forgot-password'])(
    'sends a signed-in user from %s to the CRP home',
    async (path) => {
      signInForTest();
      const { router } = renderApp(path);

      await waitFor(() => expect(router.state.location.pathname).toBe('/crp'));
    },
  );

  it.each([
    ['/set-password', "This link can't be used"],
    ['/link-expired', "This link can't be used"],
  ])('still opens the emailed-link screen %s for a signed-in user', async (path, heading) => {
    signInForTest();
    const { router } = renderApp(path);

    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/link-expired');
  });

  it('sends /signup to sign-in, since admins create accounts', async () => {
    signOutForTest();
    const { router } = renderApp('/signup');

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  });

  it('links to forgot password from the sign-in screen', async () => {
    signOutForTest();
    const { router, user } = renderApp('/login');

    await user.click(await screen.findByRole('link', { name: /forgot password/i }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/forgot-password'));
  });
});
