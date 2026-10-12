import { expect, test, type Page } from '@playwright/test';
import { E2E_USERS, latestLinkFor, signIn } from '../support/app.ts';

/**
 * Local sign-in onboarding against NestJS password links: an admin invites a
 * user → the emailed link (read from the e2e mail outbox) sets a password →
 * first sign-in → the link is spent. Then forgot-password for the same user.
 * Replaces the jsdom `passwordLinkFlow` suite.
 */
const NEW_NAME = 'Flow Person';
const NEW_EMAIL = `flow.person.${String(Date.now()).slice(-6)}@example.com`;
const FIRST_PASSWORD = 'Zebra-Kettle-42!';
const SECOND_PASSWORD = 'Harbor-Lantern-77!';

async function choosePassword(page: Page, password: string, heading = 'Create your password') {
  await expect(page.getByRole('heading', { name: heading })).toBeVisible();
  const fields = page.locator('input[type="password"]');
  await fields.nth(0).fill(password);
  await fields.nth(1).fill(password);
  await page.getByRole('button', { name: 'Save password' }).click();
}

/** The forgot-password email is sent after the reply, so wait for a new link to arrive. */
async function nextLinkFor(email: string, previous: string | null) {
  let link = '';
  await expect
    .poll(() => {
      try {
        link = latestLinkFor(email);
      } catch {
        link = '';
      }
      return link !== '' && link !== previous;
    })
    .toBe(true);
  return link;
}

test('an unknown link token explains itself', async ({ page }) => {
  await page.goto(`/set-password#token=${'0'.repeat(43)}`);
  await expect(page.getByRole('heading', { name: "This link can't be used" })).toBeVisible();
});

test.describe.serial('new user onboarding', () => {
  test('an admin adds the user, who is listed as Invited', async ({ page }) => {
    await signIn(page, E2E_USERS.admin.email);
    await page.goto('/crp/admin/users');
    await page.getByRole('button', { name: /add user/i }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(/name/i).fill(NEW_NAME);
    await dialog.getByLabel(/email/i).fill(NEW_EMAIL);
    await dialog.getByText('Developer', { exact: true }).click();
    await dialog.getByRole('button', { name: /^create user$/i }).click();
    await expect(dialog).toBeHidden();

    await page.getByRole('searchbox', { name: /search users/i }).fill(NEW_EMAIL);
    const row = page.getByRole('row', { name: new RegExp(NEW_EMAIL.replaceAll('.', '\\.')) });
    await expect(row.getByText('Invited')).toBeVisible();
    await expect(row.getByRole('button', { name: /^activate/i })).toHaveCount(0);
  });

  test('the invite link sets a password, signs in, and then cannot be reused', async ({ page }) => {
    const link = latestLinkFor(NEW_EMAIL);
    await page.goto(link);
    // The token stays in the address bar until the password is saved, so a reload still works.
    await expect(page.getByRole('heading', { name: 'Create your password' })).toBeVisible();
    await expect(page).toHaveURL(/#token=/);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Create your password' })).toBeVisible();

    // A password the server rejects keeps the link usable.
    await choosePassword(page, 'Flow-Person-2026!');
    await expect(page.getByRole('alert')).toContainText("doesn't include your name");
    await expect(page).toHaveURL(/#token=/);

    await choosePassword(page, FIRST_PASSWORD);
    await expect(page.getByRole('heading', { name: 'Password saved' })).toBeVisible();
    await expect(page).not.toHaveURL(/#token=/);

    await signIn(page, NEW_EMAIL, FIRST_PASSWORD);
    await expect(page).toHaveURL(/\/crp$/);
    await expect(page.getByText(NEW_NAME).first()).toBeVisible();

    await page.context().clearCookies();
    await page.goto(link);
    await expect(page.getByRole('heading', { name: "This link can't be used" })).toBeVisible();
  });

  test('forgot password answers the same for anyone, and a real account gets a working link', async ({
    page,
  }) => {
    await page.goto('/forgot-password');
    await page.getByLabel(/email/i).fill('nobody@nowhere.example');
    await page.getByRole('button', { name: 'Verify email' }).click();
    await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();

    const inviteLink = latestLinkFor(NEW_EMAIL);
    await page.goto('/forgot-password');
    await page.getByLabel(/email/i).fill(NEW_EMAIL);
    await page.getByRole('button', { name: 'Verify email' }).click();
    await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();
    const resetLink = await nextLinkFor(NEW_EMAIL, inviteLink);

    // The link opens even when someone else is signed in on this browser.
    await signIn(page, E2E_USERS.admin.email);
    await page.goto(resetLink);
    await choosePassword(page, SECOND_PASSWORD, 'Choose a new password');
    await expect(page.getByRole('heading', { name: 'Password saved' })).toBeVisible();
    await signIn(page, NEW_EMAIL, SECOND_PASSWORD);
    await expect(page).toHaveURL(/\/crp$/);
  });
});
