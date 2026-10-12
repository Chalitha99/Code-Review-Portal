import { beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { useTaskDraft } from '@/portals/code-review/features/tasks/hooks/useTaskDraft.ts';
import tasks from '@/content/tasks.json';
import { renderApp } from '@tests/support/renderApp.tsx';
import { DRAFT_OWNER, hydrateCompleteDraft } from '@tests/support/taskDraft.ts';
import { apiStub } from '@tests/support/apiStub.ts';
import { buildDataset, toListItem, type Dataset } from '@tests/support/fixtures/dataset.ts';
import {
  serveDraftWrites,
  serveReferenceData,
  serveTaskDetail,
  serveTaskLists,
} from '@tests/support/serve.ts';

let db: Dataset;

beforeEach(() => {
  db = buildDataset();
  serveReferenceData(db);
  serveDraftWrites(db);
  serveTaskLists({
    mine: db.tasks.filter((t) => t.developerId === DRAFT_OWNER).map((t) => toListItem(db, t)),
  });
  // NestJS accepts the submission of a complete draft and answers with the task.
  apiStub.post('/tasks/:taskId/submit', ({ params }) => {
    const task = db.tasks.find((entry) => entry.id === params['taskId'])!;
    Object.assign(task, { status: 'Submitted', submittedAt: new Date().toISOString() });
    return toListItem(db, task);
  });
  useTaskDraft.getState().reset();
});

/** Submits from the review step and waits for the confirmation screen itself (a lazy route). */
async function submitFromReviewStep() {
  const utils = renderApp('/crp/developer/tasks/new/review', DRAFT_OWNER);
  await utils.user.click(await screen.findByRole('button', { name: /submit for review/i }));
  expect(
    await screen.findByRole('heading', { name: tasks.wizard.confirmed.title, level: 1 }),
  ).toBeInTheDocument();
  expect(utils.router.state.location.pathname).toBe('/crp/developer/tasks/new/confirmed');
  return utils;
}

describe('submitting a task from the wizard', () => {
  it('submits, confirms, and leaves no stale draft pointing at the submitted task', async () => {
    const task = hydrateCompleteDraft(DRAFT_OWNER, db);
    serveTaskDetail(db, task);
    await submitFromReviewStep();

    expect(screen.getByText(task.taskCode, { exact: false })).toBeInTheDocument();
    expect(apiStub.requests('POST', '/tasks/:taskId/submit')[0]?.params).toEqual({
      taskId: task.id,
    });
    await waitFor(() => {
      expect(useTaskDraft.getState().taskId).toBeNull();
    });
    expect(useTaskDraft.getState().answers).toEqual([]);
  });

  it('opens an empty wizard when a step URL is visited after submitting', async () => {
    serveTaskDetail(db, hydrateCompleteDraft(DRAFT_OWNER, db));
    const { unmount } = await submitFromReviewStep();
    unmount();

    renderApp('/crp/developer/tasks/new/details', DRAFT_OWNER);
    expect(await screen.findByRole('combobox', { name: /customer/i })).toBeInTheDocument();
    expect(useTaskDraft.getState().taskId).toBeNull();
    expect(useTaskDraft.getState().crimId).toBe('');
  });
});
