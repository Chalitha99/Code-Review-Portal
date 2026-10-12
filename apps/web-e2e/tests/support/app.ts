import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, request, type APIRequestContext, type Page } from '@playwright/test';
import { E2E_PASSWORD, E2E_USERS } from '../../../api/prisma/e2e-fixtures.ts';
import { E2E_WEB_URL as WEB_URL } from '../../ports.config.mjs';

export { E2E_PASSWORD, E2E_USERS, WEB_URL };

const dirname = path.dirname(fileURLToPath(import.meta.url));

const OUTBOX = path.resolve(dirname, '../../test-results/mail-outbox.jsonl');

/** Signs in through the real login form. */
export async function signIn(page: Page, email: string, password: string = E2E_PASSWORD) {
  await page.goto('/login');
  await page.getByLabel(/work email/i).fill(email);
  await page.getByLabel(/^password/i).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

/**
 * The API as a signed-in user, for test SET-UP only (creating a task to act
 * on). The behaviour under test is always driven through the browser.
 * Sends the CSRF double-submit header NestJS requires on writes.
 */
export interface ApiAs {
  get<T = unknown>(path: string): Promise<T>;
  post<T = unknown>(path: string, body?: unknown): Promise<T>;
  dispose(): Promise<void>;
}

export async function apiAs(email: string): Promise<ApiAs> {
  const context: APIRequestContext = await request.newContext({ baseURL: WEB_URL });
  const login = await context.post('/api/auth/login', { data: { email, password: E2E_PASSWORD } });
  expect(login.ok(), `sign-in as ${email}`).toBe(true);
  const state = await context.storageState();
  const csrf = state.cookies.find((cookie) => cookie.name === 'sdp_csrf')?.value ?? '';
  const call = async <T>(method: 'get' | 'post', url: string, body?: unknown): Promise<T> => {
    const response = await context[method](`/api${url}`, {
      headers: { 'X-CSRF-Token': csrf },
      ...(body === undefined ? {} : { data: body }),
    });
    expect(
      response.ok(),
      `${method.toUpperCase()} ${url} → ${String(response.status())} ${await response.text()}`,
    ).toBe(true);
    return (response.status() === 204 ? undefined : await response.json()) as T;
  };
  return {
    get: (url) => call('get', url),
    post: (url, body) => call('post', url, body),
    dispose: () => context.dispose(),
  };
}

interface Customer {
  id: string;
  name: string;
}
interface TaskType {
  id: string;
}
interface Category {
  applicableTaskTypeIds: string[];
  questions: { id: string; isActive: boolean }[];
}
export interface TaskItem {
  id: string;
  taskCode: string;
  status: string;
}

/** A developer's task with a complete checklist, submitted for review. */
export async function submittedTask(developerEmail: string, crimId: string): Promise<TaskItem> {
  const dev = await apiAs(developerEmail);
  try {
    const customers = await dev.get<Customer[]>('/customers');
    const customer = customers.find((entry) => entry.name === 'E2E Customer')!;
    const [taskType] = await dev.get<TaskType[]>('/task-types');
    const template = await dev.get<Category[]>('/checklist-template');
    const questions = template
      .filter((category) => category.applicableTaskTypeIds.includes(taskType!.id))
      .flatMap((category) => category.questions.filter((question) => question.isActive));
    const task = await dev.post<TaskItem>('/tasks', {
      customerId: customer.id,
      crimId,
      priority: 'Medium',
      taskTypeIds: [Number(taskType!.id)],
      checklistAnswers: questions.map((question) => ({ questionId: question.id, answer: 'Yes' })),
    });
    return await dev.post<TaskItem>(`/tasks/${task.id}/submit`);
  } finally {
    await dev.dispose();
  }
}

/** The newest invite/reset link sent to `email` (the e2e mail outbox). */
export function latestLinkFor(email: string): string {
  const lines = readFileSync(OUTBOX, 'utf8').split('\n').filter(Boolean);
  const message = lines
    .map((line) => JSON.parse(line) as { to: string; text: string })
    .filter(
      (entry) => entry.to.toLowerCase() === email.toLowerCase() && entry.text.includes('#token='),
    )
    .at(-1);
  const link = message?.text.match(/https?:\/\/\S+\/set-password#token=[\w-]+/)?.[0];
  if (!link) throw new Error(`No set-password link was sent to ${email}`);
  return link;
}
