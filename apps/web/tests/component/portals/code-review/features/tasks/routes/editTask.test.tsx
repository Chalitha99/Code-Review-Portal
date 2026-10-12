import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { signInForTest } from '@tests/support/setup.ts';
import { routes } from '@/app/routes.tsx';
import type { Task } from '@sdp/contracts';
import { apiError, apiStub } from '@tests/support/apiStub.ts';
import { buildDataset, type Dataset } from '@tests/support/fixtures/dataset.ts';
import { serveNotifications, serveReferenceData, serveTaskDetail } from '@tests/support/serve.ts';
import { useTaskDraft } from '@/portals/code-review/features/tasks/hooks/useTaskDraft.ts';

/**
 * `/crp/developer/tasks/:taskId/edit` — the route that answers "which task am I
 * editing" from the URL.
 *
 * Before it existed, every Continue-editing affordance navigated to the generic
 * wizard path and the wizard opened on whatever `sessionStorage` happened to
 * hold. `hydrate()` and `resumeStep()` were both written for this and called
 * from nowhere, so the button reliably edited the WRONG TASK while looking as
 * though it worked — the worst shape a defect can take.
 *
 * These tests exist because the route had no coverage at all: `router.test.tsx`
 * never asserts it resolves, and `newTaskWizard.test.tsx` reaches it only
 * through a Draft, by clicking. The cases that actually bite — a returned task
 * loading a stale draft's answers, someone else's task, a task id that no longer
 * exists — are all here.
 *
 * The server's answers follow NestJS: a task the caller may not read (someone
 * else's draft) is 404 TASK_NOT_FOUND, exactly like a task that does not exist.
 */

const DEVELOPER = 'u-hiruni';
/** Owns tasks of their own, so "not yours" is a real row rather than a fiction. */
const OTHER_DEVELOPER = 'u-kavidu';

function renderAt(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(routes, { initialEntries: [path] });

  return {
    ...render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    ),
    router,
    user: userEvent.setup({ delay: null }),
  };
}

/**
 * A draft the developer can reopen, with a complete saved checklist.
 *
 * Editing is Draft-only (a returned task is the response turn), and the fixture
 * drafts carry no checklist, so the developer's returned task is served as a
 * Draft with its saved checklist.
 */
function editableDraft(): Task {
  const task = db.tasks.find(
    (candidate) => candidate.developerId === DEVELOPER && candidate.status === 'ChangesRequested',
  );
  if (!task) throw new Error('fixtures have no returned task for this developer');
  task.status = 'Draft';
  task.reviewerId = null;
  serveTaskDetail(db, task);
  return task;
}

/** What NestJS answers for a task this developer can read. */
function serveReadable(task: Task): Task {
  serveTaskDetail(db, task);
  return task;
}

const findChecklist = (taskId: string) => db.checklists.find((entry) => entry.taskId === taskId);
let db: Dataset;

beforeEach(() => {
  db = buildDataset();
  signInForTest(DEVELOPER);
  serveReferenceData(db);
  serveNotifications(db);
  // Anything not served below: NestJS's 404 for a missing or unreadable task.
  apiStub.get('/tasks/:taskId', () => apiError(404, 'TASK_NOT_FOUND', 'Task not found.'));
  apiStub.get('/tasks/:taskId/checklist', () => apiError(404, 'TASK_NOT_FOUND', 'Task not found.'));
  useTaskDraft.getState().reset();
});

describe('reopening a task in the wizard', () => {
  it('hydrates a reopened draft from the URL, not from a stale draft', async () => {
    /*
     * The scenario the route was built for.
     *
     * A developer edits draft A, goes away, comes back and reopens draft B. Both live in the same single-slot store, so without the URL winning,
     * B's page shows A's customer, A's CRIM ID and A's checklist answers — and
     * the next Save Draft PATCHes A.
     */
    useTaskDraft.getState().hydrate({
      taskId: 't-stale-draft',
      taskCode: 'AASL-999',
      customerId: 'c-aasl',
      crimId: 'CRIM-STALE',
      remarks: 'Notes that belong to a different task.',
    });

    const task = editableDraft();
    const { router } = renderAt(`/crp/developer/tasks/${task.id}/edit`);

    await waitFor(() => {
      expect(router.state.location.pathname).toMatch(
        new RegExp(`^/crp/developer/tasks/${task.id}/edit/`),
      );
    });

    const state = useTaskDraft.getState();
    expect(state.taskId).toBe(task.id);
    expect(state.crimId).toBe(task.crimId);
    expect(state.customerId).toBe(task.customerId);
    expect(state.taskTypeIds).toEqual(task.taskTypeIds);
    // Not a field left over from the draft above. `hydrate` shallow-merges, so
    // every field the redirect does not pass would survive from the last task.
    expect(state.remarks).toBe(findChecklist(task.id)?.remarks ?? '');
  });

  it('carries the saved checklist answers back into the store', async () => {
    const task = editableDraft();
    const saved = findChecklist(task.id);
    if (!saved || saved.answers.length === 0) throw new Error('seed task has no saved checklist');

    const { router } = renderAt(`/crp/developer/tasks/${task.id}/edit`);

    await waitFor(() => {
      expect(router.state.location.pathname).toMatch(
        new RegExp(`^/crp/developer/tasks/${task.id}/edit/`),
      );
    });

    const { answers } = useTaskDraft.getState();
    expect(answers).toHaveLength(saved.answers.length);
    for (const entry of saved.answers) {
      expect(answers).toContainEqual({ questionId: entry.questionId, answer: entry.answer });
    }
  });

  it('lands on the review step when nothing is outstanding', async () => {
    /*
     * `resumeStep`, not "always step 1". This task has a customer, a CRIM ID,
     * task types and a complete checklist, so there is no step left to fill in
     * and the developer should not be walked through two they already finished.
     */
    const task = editableDraft();
    expect(task.isChecklistComplete).toBe(true);

    const { router } = renderAt(`/crp/developer/tasks/${task.id}/edit`);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/crp/developer/tasks/${task.id}/edit/review`);
    });

    // Check that title indicates editing existing task, and back button returns to Task Overview
    expect(await screen.findByRole('heading', { name: /edit review task/i })).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: /back to task overview/i }).length,
    ).toBeGreaterThan(0);
  });

  it('refuses a task belonging to another developer', async () => {
    const theirs = db.tasks.find(
      (candidate) => candidate.developerId === OTHER_DEVELOPER && candidate.status === 'Draft',
    );
    if (!theirs) throw new Error('seed has no draft for the other developer');

    const { router } = renderAt(`/crp/developer/tasks/${theirs.id}/edit`);

    expect(await screen.findByText(/this task cannot be edited/i)).toBeInTheDocument();
    // It did not hydrate on the way to refusing, and it did not navigate.
    expect(useTaskDraft.getState().taskId).toBeNull();
    expect(router.state.location.pathname).toBe(`/crp/developer/tasks/${theirs.id}/edit`);
  });

  it('refuses a task whose status has moved on', async () => {
    const submitted = db.tasks.find(
      (candidate) => candidate.developerId === DEVELOPER && candidate.status === 'Approved',
    );
    if (!submitted) throw new Error('fixtures have no approved task for this developer');
    serveReadable(submitted);

    renderAt(`/crp/developer/tasks/${submitted.id}/edit`);

    expect(await screen.findByText(/this task cannot be edited/i)).toBeInTheDocument();
    expect(useTaskDraft.getState().taskId).toBeNull();
  });

  it('survives a task id that no longer exists', async () => {
    /*
     * A retained id outliving its row is the ordinary case, not an exotic one:
     * a bookmarked or emailed link outlives the task it pointed at. It must refuse, not crash and
     * not hydrate half a task.
     */
    const { router } = renderAt('/crp/developer/tasks/t-does-not-exist/edit');

    expect(await screen.findByText(/this task cannot be edited/i)).toBeInTheDocument();
    expect(useTaskDraft.getState().taskId).toBeNull();
    expect(router.state.location.pathname).toBe('/crp/developer/tasks/t-does-not-exist/edit');
  });

  it('reports a missing task and someone else’s task identically', async () => {
    /*
     * Deliberate: the API answers 404 for both, so a developer cannot use this
     * route to discover that a task exists but is not theirs. If these two ever
     * diverge, the route has become an existence oracle.
     */
    const theirs = db.tasks.find((candidate) => candidate.developerId === OTHER_DEVELOPER);
    if (!theirs) throw new Error('seed has no task for the other developer');

    const missing = renderAt('/crp/developer/tasks/t-does-not-exist/edit');
    const missingText = (await screen.findByText(/this task cannot be edited/i)).textContent;
    missing.unmount();

    renderAt(`/crp/developer/tasks/${theirs.id}/edit`);
    const foreignText = (await screen.findByText(/this task cannot be edited/i)).textContent;

    expect(foreignText).toBe(missingText);
  });

  it('replaces itself in history so Back does not bounce through the redirect', async () => {
    const task = editableDraft();
    const { router } = renderAt(`/crp/developer/tasks/${task.id}/edit`);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/crp/developer/tasks/${task.id}/edit/review`);
    });

    // Navigated with `replace`, so there is no bare `/edit` frame left behind to re-hydrate on the way back.
    expect(router.state.historyAction).toBe('REPLACE');
  });
});
