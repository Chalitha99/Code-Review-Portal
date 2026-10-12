import { expect, test } from '@playwright/test';
import {
  apiAs,
  E2E_PASSWORD,
  E2E_USERS,
  latestLinkFor,
  signIn,
  submittedTask,
} from '../support/app.ts';

/**
 * Two administration rules added in NestJS, driven through the admin screens:
 *  - Super Admin cannot be transferred to a reviewer who still holds review
 *    work (409 REVIEWER_HAS_PENDING_TASKS, listed in the dialog);
 *  - changing a user's sign-in email sends them back to Invited: every session
 *    ends and they must set a new password from an invite to the new address.
 */
test.describe('Users tab', () => {
  for (const actor of [E2E_USERS.superAdmin, E2E_USERS.admin]) {
    test(`lists every user for ${actor.name}`, async ({ page }) => {
      await signIn(page, actor.email);
      await page.goto('/crp/admin/users');

      const table = page.getByRole('table');
      await expect(table.getByText(E2E_USERS.superAdmin.email)).toBeVisible();
      await expect(table.getByText(E2E_USERS.developer.email)).toBeVisible();
      await expect(page.getByText(/this page ran into a problem/i)).toHaveCount(0);
    });
  }
});

test.describe('Super Admin transfer', () => {
  test('is blocked while the target reviewer holds review work, and lists it', async ({ page }) => {
    const task = await submittedTask(
      E2E_USERS.developer.email,
      `CRIM-SA-${String(Date.now()).slice(-6)}`,
    );
    const holder = await apiAs(E2E_USERS.adminReviewer.email);
    await holder.post(`/tasks/${task.id}/pick`);
    await holder.dispose();

    await signIn(page, E2E_USERS.superAdmin.email);
    await page.goto('/crp/admin/users');
    await page.getByRole('searchbox', { name: /search users/i }).fill(E2E_USERS.adminReviewer.name);
    await page
      .getByRole('button', { name: `Transfer Super Admin to ${E2E_USERS.adminReviewer.name}` })
      .click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: /^transfer super admin$/i }).click();

    const notice = dialog.getByRole('alert');
    await expect(notice).toContainText(/pending review task/i);
    await expect(notice.getByRole('link', { name: new RegExp(task.taskCode) })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /^transfer super admin$/i })).toBeDisabled();

    // Nothing changed: the actor is still the Super Admin.
    await page.reload();
    await expect(page.getByRole('heading', { name: /user management/i })).toBeVisible();
  });
});

test.describe('changing a user’s email', () => {
  test('requires a new password from an invite to the new address', async ({ page, browser }) => {
    const target = E2E_USERS.devReviewer;
    const newEmail = `e2e.devrev.${String(Date.now()).slice(-6)}@example.com`;

    // The user is signed in somewhere else.
    const elsewhere = await browser.newPage();
    await signIn(elsewhere, target.email);

    await signIn(page, E2E_USERS.admin.email);
    await page.goto('/crp/admin/users');
    await page.getByRole('searchbox', { name: /search users/i }).fill(target.name);
    await page.getByRole('button', { name: new RegExp(`^edit ${target.name}$`, 'i') }).click();
    const dialog = page.getByRole('dialog');
    const email = dialog.getByLabel(/email/i);
    await email.fill(newEmail);
    await expect(dialog.getByRole('note')).toContainText(/must set a new password/i);
    await dialog.getByRole('button', { name: /^save changes$/i }).click();
    await expect(
      page.getByText(new RegExp(`invite to set a new password was sent to ${newEmail}`, 'i')),
    ).toBeVisible();

    // Their other session is over at once (the access token is bound to it).
    await elsewhere.reload();
    await expect(elsewhere).toHaveURL(/\/login/);

    // Neither address signs in until the invite is accepted.
    await elsewhere.getByLabel(/work email/i).fill(newEmail);
    await elsewhere.getByLabel(/^password/i).fill(E2E_PASSWORD);
    await elsewhere.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(elsewhere.getByRole('alert')).toHaveText(/invalid email or password/i);

    // The invite went to the NEW address; it sets a new password.
    await elsewhere.goto(latestLinkFor(newEmail));
    await expect(elsewhere.getByRole('heading', { name: 'Create your password' })).toBeVisible();
    const newPassword = 'Fresh-Start-2026!';
    const fields = elsewhere.locator('input[type="password"]');
    await fields.nth(0).fill(newPassword);
    await fields.nth(1).fill(newPassword);
    await elsewhere.getByRole('button', { name: 'Save password' }).click();
    await expect(elsewhere.getByRole('heading', { name: 'Password saved' })).toBeVisible();

    await signIn(elsewhere, newEmail, newPassword);
    await expect(elsewhere).toHaveURL(/\/crp$/);
    await elsewhere.close();
  });
});
