import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@tests/support/renderWithProviders.tsx';
import { signOutForTest } from '@tests/support/setup.ts';
import { useSession } from '@/hooks/useSession.ts';
import { LoginPage } from '@/features/auth/routes/LoginPage.tsx';
import { apiError, apiStub } from '@tests/support/apiStub.ts';
import { buildDataset } from '@tests/support/fixtures/dataset.ts';

const SEEDED_EMAIL = 'hiruni.wijethilaka@sebsaworld.com';
const PASSWORD = 'Correct-Horse-2026';
const hiruni = buildDataset().users.find((user) => user.email === SEEDED_EMAIL);

/**
 * POST /auth/login answers as NestJS does: the user for the right password, one
 * generic 401 for any unknown email or wrong password (no account enumeration),
 * and 403 ACCOUNT_INACTIVE only after the password was proven.
 */
beforeEach(() => {
  apiStub.post('/auth/login', ({ body }) => {
    const { email, password } = body as { email: string; password: string };
    if (email === 'nimal.perera@sebsaworld.com' && password === PASSWORD) {
      return apiError(
        403,
        'ACCOUNT_INACTIVE',
        'Authentication failed or user account not configured. Please contact your administrator.',
      );
    }
    if (email === SEEDED_EMAIL && password === PASSWORD) return hiruni;
    return apiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
  });
});

/*
 * Password queries are anchored (`/^password/i`) because the page also contains
 * a "Show password" toggle and a "Forgot password?" link; an unanchored match
 * finds all three.
 */

function renderLogin() {
  signOutForTest();
  const onSignedIn = vi.fn();
  const utils = renderWithProviders(<LoginPage onSignedIn={onSignedIn} />, {
    route: '/login',
  });
  return { ...utils, onSignedIn, user: userEvent.setup({ delay: null }) };
}

describe('LoginPage validation', () => {
  it('blocks submission and names both empty fields', async () => {
    const { user } = renderLogin();

    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Enter your email address')).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
  });

  it('rejects a malformed email before contacting the server', async () => {
    const { user } = renderLogin();

    await user.type(screen.getByLabelText(/work email/i), 'not-an-email');
    await user.type(screen.getByLabelText(/^password/i), 'anything');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
  });

  it('associates each error with its input for assistive tech', async () => {
    const { user } = renderLogin();

    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByText('Enter your email address');

    const email = screen.getByLabelText(/work email/i);
    expect(email).toHaveAttribute('aria-invalid', 'true');
    // The error must be reachable from the input, not merely nearby on screen.
    const describedBy = email.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy ?? '')).toHaveTextContent(
      'Enter your email address',
    );
  });
});

describe('LoginPage authentication', () => {
  it('signs in once the server accepts the credentials', async () => {
    const { user, onSignedIn } = renderLogin();

    await user.type(screen.getByLabelText(/work email/i), SEEDED_EMAIL);
    await user.type(screen.getByLabelText(/^password/i), PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(onSignedIn).toHaveBeenCalledTimes(1));
    expect(useSession.getState().isAuthenticated).toBe(true);
    expect(useSession.getState().userId).toBe('u-hiruni');
    expect(apiStub.requests('POST', '/auth/login')[0]?.body).toEqual({
      email: SEEDED_EMAIL,
      password: PASSWORD,
      remember: true,
    });
  });

  it('shows the server’s answer for a wrong password and stays signed out', async () => {
    const { user, onSignedIn } = renderLogin();

    await user.type(screen.getByLabelText(/work email/i), SEEDED_EMAIL);
    await user.type(screen.getByLabelText(/^password/i), 'not-it');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.');
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  it('rejects an unknown email without revealing whether the account exists', async () => {
    const { user, onSignedIn } = renderLogin();

    await user.type(screen.getByLabelText(/work email/i), 'nobody@example.com');
    await user.type(screen.getByLabelText(/^password/i), 'whatever');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.');
    expect(onSignedIn).not.toHaveBeenCalled();
    expect(useSession.getState().isAuthenticated).toBe(false);
  });

  it('rejects an inactive account', async () => {
    const { user, onSignedIn } = renderLogin();

    // NestJS reveals an account is switched off only to someone who proved the
    // password; the screen must show that message.
    await user.type(screen.getByLabelText(/work email/i), 'nimal.perera@sebsaworld.com');
    await user.type(screen.getByLabelText(/^password/i), PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/not configured/i);
    expect(onSignedIn).not.toHaveBeenCalled();
  });
});

describe('LoginPage session persistence', () => {
  it('asks the server for a remembered session when Remember me is checked', async () => {
    const { user } = renderLogin();

    // Checked by default; assert the default rather than assuming it.
    expect(screen.getByLabelText(/remember me/i)).toBeChecked();

    await user.type(screen.getByLabelText(/work email/i), SEEDED_EMAIL);
    await user.type(screen.getByLabelText(/^password/i), PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(useSession.getState().isAuthenticated).toBe(true));
    // The session lives in HttpOnly cookies whose lifetime NestJS sets from
    // `remember`; nothing about it is written to browser storage.
    expect(apiStub.requests('POST', '/auth/login')[0]?.body).toMatchObject({ remember: true });
    expect(window.localStorage.length).toBe(0);
  });

  it('asks for a browser-session sign-in when Remember me is cleared', async () => {
    const { user } = renderLogin();

    await user.click(screen.getByLabelText(/remember me/i));
    await user.type(screen.getByLabelText(/work email/i), SEEDED_EMAIL);
    await user.type(screen.getByLabelText(/^password/i), PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(useSession.getState().isAuthenticated).toBe(true));
    expect(apiStub.requests('POST', '/auth/login')[0]?.body).toMatchObject({ remember: false });
    expect(window.localStorage.length).toBe(0);
  });

  it('never stores a real authentication token in browser storage', async () => {
    const { user } = renderLogin();

    await user.type(screen.getByLabelText(/work email/i), SEEDED_EMAIL);
    await user.type(screen.getByLabelText(/^password/i), PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(useSession.getState().isAuthenticated).toBe(true));

    expect(window.localStorage.getItem('sdp.session')).toBeNull();
    expect(window.sessionStorage.getItem('sdp.session')).toBeNull();
  });
});

describe('LoginPage password visibility', () => {
  it('toggles between masked and readable without losing the value', async () => {
    const { user } = renderLogin();

    const password = screen.getByLabelText(/^password/i);
    await user.type(password, 'secret123');
    expect(password).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: /show password/i }));
    expect(password).toHaveAttribute('type', 'text');
    expect(password).toHaveValue('secret123');

    await user.click(screen.getByRole('button', { name: /hide password/i }));
    expect(password).toHaveAttribute('type', 'password');
  });
});
