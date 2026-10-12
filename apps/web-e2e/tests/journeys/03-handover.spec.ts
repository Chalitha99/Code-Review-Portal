import { expect, test } from '@playwright/test';
import { E2E_USERS, signIn, submittedTask, type TaskItem } from '../support/app.ts';

/**
 * Handover end to end: the assigned reviewer hands a review back with a reason
 * and their draft → the admin sees it in the handover queue and reassigns it →
 * the new reviewer holds it, with the previous reviewer's comment preserved.
 */
let task: TaskItem;

test.describe.serial('reviewer handover', () => {
  test.beforeAll(async () => {
    task = await submittedTask(
      E2E_USERS.developer.email,
      `CRIM-HND-${String(Date.now()).slice(-6)}`,
    );
  });

  test('the assigned reviewer hands the task over with a reason and their draft', async ({
    page,
  }) => {
    await signIn(page, E2E_USERS.reviewer.email);
    await page.goto(`/crp/reviewer?search=${task.taskCode}`);
    await page.getByRole('button', { name: `Pick ${task.taskCode} for review` }).click();
    await expect(page.getByRole('heading', { name: /reviewer assessment/i })).toBeVisible();

    await page
      .getByRole('button', { name: /add (first )?comment/i })
      .first()
      .click();
    await page
      .getByPlaceholder(/describe the actionable issue/i)
      .fill('Locking order looks wrong.');

    await page.getByRole('button', { name: /hand over/i }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: /^reason$/i }).fill('Going on leave from Friday.');
    await dialog.getByRole('button', { name: /^hand over$/i }).click();
    await expect(page).toHaveURL(/\/crp\/reviewer/);
  });

  test('the admin reassigns it from the handover queue', async ({ page }) => {
    await signIn(page, E2E_USERS.admin.email);
    await page.goto('/crp/admin/handovers');
    const row = page.getByRole('row', { name: new RegExp(task.taskCode) });
    await expect(row.getByText(/going on leave from friday/i)).toBeVisible();
    await expect(row.getByText('Awaiting action')).toBeVisible();

    await row.getByRole('button', { name: new RegExp(`reassign ${task.taskCode}`, 'i') }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('combobox', { name: /reviewer/i }).click();
    await page.getByRole('option', { name: E2E_USERS.reviewer2.name }).click();
    await dialog.getByRole('button', { name: /^reassign$/i }).click();
    // The toast and the refreshed row both say it; check the toast.
    await expect(
      page
        .locator('[data-sonner-toast]')
        .getByText(new RegExp(`reassigned to ${E2E_USERS.reviewer2.name}`, 'i')),
    ).toBeVisible();
  });

  test('the new reviewer holds it and sees the previous reviewer’s comment', async ({ page }) => {
    await signIn(page, E2E_USERS.reviewer2.email);
    await page.goto('/crp/reviewer/my-tasks');
    await page
      .getByRole('row', { name: new RegExp(task.taskCode) })
      .getByRole('button')
      .first()
      .click();
    await expect(page.getByRole('heading', { name: /reviewer assessment/i })).toBeVisible();
    await page.getByRole('button', { name: /previous reviewer feedback/i }).click();
    await expect(page.getByText('Locking order looks wrong.').first()).toBeVisible();
  });
});
