import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import type { Role, User } from '@sdp/contracts';
import { LoginPage } from '@/features/auth/routes/LoginPage.tsx';
import { HomePage } from '@/features/home/routes/HomePage.tsx';
import { findBlockingA11yViolations, formatViolations } from '@tests/support/axe.ts';
import { renderWithProviders } from '@tests/support/renderWithProviders.tsx';
import { signOutForTest } from '@tests/support/setup.ts';
import { serveTaskSummary } from '@tests/support/serve.ts';

function makeUser(roles: Role[]): User {
  return {
    id: 'u-charith',
    name: 'Charith Widanapathirana',
    email: 'charith.widanapathirana@sebsaworld.com',
    roles,
    isActive: true,
    createdAt: '2025-01-14T09:00:00.000Z',
  };
}

async function expectNoBlockingViolations(container: HTMLElement): Promise<void> {
  const violations = await findBlockingA11yViolations(container);
  expect(violations, `\n${formatViolations(violations)}`).toHaveLength(0);
}

describe('accessibility', () => {
  /**
   * Negative control.
   *
   * A passing axe assertion is only meaningful if axe is actually running and
   * reporting. This renders an input with no accessible name — a genuine
   * "serious" violation — and asserts the scan catches it. Without this, a
   * misconfiguration would turn the three checks below into assertions that can
   * never fail.
   *
   * An unlabelled input is used deliberately: `jsx-a11y` cannot detect it
   * statically, so the check exercises axe rather than duplicating lint.
   */
  it('detects violations when they exist', async () => {
    const { container } = renderWithProviders(
      <div>
        <input type="text" />
      </div>,
    );

    const violations = await findBlockingA11yViolations(container);
    expect(violations.map((v) => v.id)).toContain('label');
  }, 20_000);

  it('login page has no critical or serious violations', async () => {
    signOutForTest();
    const { container } = renderWithProviders(<LoginPage onSignedIn={vi.fn()} />, {
      route: '/login',
    });

    // Wait for first paint of the form before scanning.
    await screen.findByRole('button', { name: 'Sign in' });
    await expectNoBlockingViolations(container);
  }, 20_000);

  it('login page in its error state has no critical or serious violations', async () => {
    signOutForTest();
    const { container } = renderWithProviders(<LoginPage onSignedIn={vi.fn()} />, {
      route: '/login',
    });

    // Error states introduce aria-invalid and role="alert"; scan them too,
    // because that is where wiring mistakes usually hide.
    screen.getByRole('button', { name: 'Sign in' }).click();
    await screen.findByText('Enter your email address');
    await expectNoBlockingViolations(container);
  }, 20_000);

  it('portal home has no critical or serious violations', async () => {
    serveTaskSummary(9);
    // Every role, so the scan covers all three workspace cards.
    const { container } = renderWithProviders(
      <HomePage user={makeUser(['Developer', 'Reviewer', 'Admin'])} />,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Developer' })).toBeInTheDocument();
    });
    await expectNoBlockingViolations(container);
  }, 20_000);
});
