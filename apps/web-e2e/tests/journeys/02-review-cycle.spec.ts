import { expect, test, type Page } from '@playwright/test';
import { E2E_USERS, signIn } from '../support/app.ts';

/**
 * The core workflow across three workspaces, against the real API:
 * a developer creates and submits a task through the wizard → a reviewer picks
 * it and requests changes → the developer sees the outcome → the admin's
 * counters agree. Replaces the jsdom `crossRoleJourney` suite.
 */
const CRIM = `CRIM-E2E-${String(Date.now()).slice(-6)}`;
let taskCode = '';

async function answerEveryQuestion(page: Page) {
  for (const group of await page.getByRole('radiogroup').all()) {
    await group.getByRole('radio', { name: 'Yes' }).check({ force: true });
  }
}

test.describe.serial('developer → reviewer → developer/admin', () => {
  test('a developer creates a task in the wizard and submits it', async ({ page }) => {
    await signIn(page, E2E_USERS.developer.email);
    await page.goto('/crp/developer/tasks/new');

    await page.getByRole('combobox', { name: /customer/i }).click();
    await page.getByRole('option', { name: 'E2E Customer' }).click();
    await page.getByLabel(/crim id/i).fill(CRIM);
    await page.getByRole('button', { name: /next: quality checklist/i }).click();
    await expect(page).toHaveURL(/\/tasks\/new\/checklist$/);

    // A visually hidden native checkbox behind a styled label: click the label,
    // as a user does.
    await page.getByText('Customization', { exact: true }).click();
    await expect(page.getByRole('checkbox', { name: 'Customization' })).toBeChecked();
    await answerEveryQuestion(page);
    await page.getByRole('button', { name: /next: review & submit/i }).click();
    await expect(page).toHaveURL(/\/tasks\/new\/review$/);

    await page.getByRole('button', { name: /submit for review/i }).click();
    await expect(page).toHaveURL(/\/tasks\/new\/confirmed$/);
    // NestJS issues the code: the normalised customer name + a per-customer number.
    const confirmation = await page.getByText(/is now in the reviewer queue/).textContent();
    taskCode = confirmation?.match(/E2ECUSTOMER-\d+/)?.[0] ?? '';
    expect(taskCode).toMatch(/^E2ECUSTOMER-\d+$/);
  });

  test('a reviewer picks it from Available Tasks and requests changes', async ({ page }) => {
    await signIn(page, E2E_USERS.reviewer.email);
    await page.goto(`/crp/reviewer?search=${taskCode}`);

    await page.getByRole('button', { name: `Pick ${taskCode} for review` }).click();
    await expect(page.getByRole('heading', { name: /reviewer assessment/i })).toBeVisible();

    await page.getByRole('radio', { name: /rank 2/i }).click();
    await page
      .getByRole('button', { name: /add (first )?comment/i })
      .first()
      .click();
    await page
      .getByPlaceholder(/describe the actionable issue/i)
      .fill('Null customer id is not handled.');
    await page.getByRole('button', { name: /request changes/i }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: /request changes/i }).click();
    await expect(dialog.getByText('Changes Requested')).toBeVisible();
  });

  test('the developer sees the returned task and the reviewer’s comment', async ({ page }) => {
    await signIn(page, E2E_USERS.developer.email);
    await page.goto(`/crp/developer?search=${taskCode}`);
    await page.getByRole('button', { name: `View ${taskCode}` }).click();

    await expect(page.getByText('Changes Requested').first()).toBeVisible();
    await expect(page.getByText('Null customer id is not handled.').first()).toBeVisible();
  });

  test('the admin sees it as Changes Requested, with Cancel but not Delete', async ({ page }) => {
    await signIn(page, E2E_USERS.admin.email);
    await page.goto('/crp/admin');
    await page.getByRole('searchbox', { name: /search tasks/i }).fill(taskCode);
    const row = page.getByRole('row', { name: new RegExp(taskCode) });
    await expect(row.getByText('Changes Requested')).toBeVisible();
    await expect(
      row.getByRole('button', { name: new RegExp(`cancel ${taskCode}`, 'i') }),
    ).toBeVisible();
    await expect(
      row.getByRole('button', { name: new RegExp(`delete ${taskCode}`, 'i') }),
    ).toHaveCount(0);
  });
});
