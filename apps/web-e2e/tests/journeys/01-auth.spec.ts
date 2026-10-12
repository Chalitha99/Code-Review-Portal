import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { E2E_USERS, signIn } from '../support/app.ts';
import { settleAnimations } from '../support/settleAnimations.ts';

/**
 * Sign-in, session cookies and sign-out against the real NestJS API: the
 * HttpOnly session cookies, the CSRF token, and the server's generic answer for
 * a wrong password.
 */
test.describe('signing in', () => {
  test('signs in, lands on the portal home with the user named, and signs out', async ({
    page,
    context,
  }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);

    await signIn(page, E2E_USERS.developer.email);
    await expect(page).toHaveURL(/\/crp$/);
    await expect(page.getByText(E2E_USERS.developer.name).first()).toBeVisible();

    // The session lives in HttpOnly cookies only; nothing readable by script.
    const cookies = await context.cookies();
    expect(cookies.find((cookie) => cookie.name === 'sdp_access')?.httpOnly).toBe(true);
    expect(cookies.find((cookie) => cookie.name === 'sdp_refresh')?.httpOnly).toBe(true);
    expect(await page.evaluate(() => document.cookie)).not.toContain('sdp_access');

    await page.getByRole('button', { name: /account menu/i }).click();
    await page.getByRole('button', { name: /^sign out$/i }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto('/crp');
    await expect(page).toHaveURL(/\/login/);
  });

  test('rejects a wrong password with the one generic message', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/work email/i).fill(E2E_USERS.developer.email);
    await page.getByLabel(/^password/i).fill('not-the-password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();

    await expect(page.getByRole('alert')).toHaveText(/invalid email or password/i);
    await expect(page).toHaveURL(/\/login$/);
  });

  test('returns to the deep link that needed a sign-in', async ({ page }) => {
    await page.goto('/crp/admin/users');
    await expect(page).toHaveURL(/\/login$/);
    await signIn(page, E2E_USERS.admin.email);
    await expect(page).toHaveURL(/\/crp\/admin\/users$/);
  });
});

test.describe('session and guest screens', () => {
  test('keeps the session across a reload when Remember me is checked', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByLabel(/remember me/i)).toBeChecked();
    await signIn(page, E2E_USERS.reviewer.email);
    await expect(page).toHaveURL(/\/crp$/);

    await page.reload();
    await expect(page).toHaveURL(/\/crp$/);
    await expect(page.getByText(E2E_USERS.reviewer.name).first()).toBeVisible();
  });

  test('guest screens are reachable signed out', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: /forgot password/i }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
    await expect(page.getByRole('heading', { name: 'Forgot your password?' })).toBeVisible();

    await page.goto('/link-expired');
    await expect(page.getByRole('heading', { name: "This link can't be used" })).toBeVisible();
  });

  test('sends a signed-in user from the sign-in screens to the CRP home', async ({ page }) => {
    await signIn(page, E2E_USERS.reviewer2.email);
    for (const path of ['/forgot-password', '/login']) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/crp$/);
    }
  });
});

test.describe('login page layout', () => {
  const VIEWPORTS = [
    { name: 'desktop-1440', width: 1440, height: 900 },
    { name: 'laptop-1280', width: 1280, height: 800 },
    { name: 'tablet-768', width: 768, height: 1024 },
    { name: 'mobile-390', width: 390, height: 844 },
  ];

  for (const viewport of VIEWPORTS) {
    test(`fits the viewport without scrolling at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/login');
      const submit = page.getByRole('button', { name: 'Sign in', exact: true });
      await submit.waitFor();

      const overflow = await page.evaluate(() => {
        const el = document.scrollingElement ?? document.documentElement;
        return {
          vertical: el.scrollHeight - el.clientHeight,
          horizontal: el.scrollWidth - el.clientWidth,
        };
      });
      expect(overflow.vertical, 'page scrolls vertically').toBeLessThanOrEqual(1);
      expect(overflow.horizontal, 'page scrolls horizontally').toBeLessThanOrEqual(1);
      await expect(submit).toBeInViewport();
    });
  }

  // Durations compared numerically: Chromium serialises 0.01ms as "1e-05s".
  const shapeDurationsMs = () =>
    Array.from(document.querySelectorAll('[aria-hidden="true"] span'))
      .map((el) => getComputedStyle(el).animationDuration)
      .filter((d) => d !== '0s' && d !== '')
      .map((d) => (d.endsWith('ms') ? parseFloat(d) : parseFloat(d) * 1000));

  test('holds the decorative shapes still when reduced motion is requested', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/login');
    await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor();
    const durations = await page.evaluate(shapeDurationsMs);
    expect(durations.length).toBeGreaterThan(0);
    for (const ms of durations) expect(ms).toBeLessThan(1);
  });

  test('animates the decorative shapes slowly when motion is allowed', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/login');
    await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor();
    const durations = await page.evaluate(shapeDurationsMs);
    expect(durations.length).toBeGreaterThan(0);
    for (const ms of durations) expect(ms).toBeGreaterThan(10_000);
  });
});

test.describe('accessibility', () => {
  for (const [label, email] of [
    ['login', null],
    ['portal home', E2E_USERS.admin.email],
  ] as const) {
    test(`${label} has no critical or serious axe violations`, async ({ page }) => {
      if (email === null) await page.goto('/login');
      else await signIn(page, email);
      await settleAnimations(page);
      const results = await new AxeBuilder({ page }).analyze();
      const blocking = results.violations.filter((violation) =>
        ['critical', 'serious'].includes(violation.impact ?? ''),
      );
      expect(blocking.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
    });
  }
});
