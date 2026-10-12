import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { Toaster } from 'sonner';
import type { Task } from '@sdp/contracts';
import { signInForTest } from '@tests/support/setup.ts';
import { routes } from '@/app/routes.tsx';
import { apiError, apiStub } from '@tests/support/apiStub.ts';
import { buildDataset, toListItem } from '@tests/support/fixtures/dataset.ts';
import {
  serveNotifications,
  serveReferenceData,
  serveTaskDetail,
  serveTaskLists,
} from '@tests/support/serve.ts';

/**
 * The reviewer queues, driven through the real route table.
 *
 * WHICH tasks belong in each queue is decided by NestJS and tested there
 * (apps/api review-tasks.service.spec.ts, "list visibility": own submissions
 * never reach Available, History is keyed on the review's reviewer and leaves
 * out what is in review again). Here the server's answer is given, and the test
 * checks what the screen does with it: render it faithfully, pick, and report a
 * lost race.
 */

/** A user who holds Reviewer and has submitted tasks of their own. */
const REVIEWER = 'u-hiruni';
const db = buildDataset();
const listItem = (task: Task) => toListItem(db, task);

/** What NestJS sends for Available Tasks: waiting, unclaimed, not the caller's own. */
const available = db.tasks
  .filter(
    (task) =>
      task.reviewerId === null &&
      task.developerId !== REVIEWER &&
      (task.status === 'Submitted' || task.status === 'ReSubmitted'),
  )
  .map(listItem);
const assigned = db.tasks
  .filter((task) => task.reviewerId === REVIEWER && task.status === 'InReview')
  .map(listItem);

function renderApp(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(routes, { initialEntries: [path] });

  return {
    ...render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        {/*
          `Toaster` lives in `App`, which these router-level tests do not mount.
          A rule the user only learns about through a toast is not verified
          unless the toast renders.
        */}
        <Toaster />
      </QueryClientProvider>,
    ),
    router,
    user: userEvent.setup({ delay: null }),
  };
}

function bodyRows() {
  const table = screen.getByRole('table');
  const body = within(table).getAllByRole('rowgroup')[1];
  if (!body) throw new Error('table has no body');
  return within(body).getAllByRole('row');
}

/**
 * Waits for the grid to hold real rows. `DataTable` renders its skeleton as
 * rows inside the real `<table>` and marks the loading pass `role="status"`, so
 * that marker's disappearance is the honest readiness signal.
 */
async function findLoadedTable() {
  await screen.findByRole('table');
  await waitFor(() => {
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
}

beforeEach(() => {
  signInForTest(REVIEWER);
  serveReferenceData(db);
  serveNotifications(db);
  serveTaskLists({ available, assigned, history: [] });
});

describe('Available Tasks', () => {
  it('shows stored titles without a duplicate version tag or column', async () => {
    renderApp('/crp/reviewer');
    await findLoadedTable();

    expect(screen.queryByRole('columnheader', { name: /^version$/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId('version-tag')).not.toBeInTheDocument();
  });

  it('asks the server for the available scope and renders exactly what it sends', async () => {
    renderApp('/crp/reviewer');
    await findLoadedTable();

    expect(
      apiStub.requests('GET', '/tasks').some(({ query }) => query.get('scope') === 'available'),
    ).toBe(true);
    expect(available.length).toBeGreaterThan(0);
    expect(bodyRows()).toHaveLength(available.length);
    for (const task of available) {
      expect(screen.getByRole('table')).toHaveTextContent(task.taskCode);
    }
  });

  it('picks a task, moves it to In Review and opens it', async () => {
    const target = available[0]!;
    const picked = {
      ...target,
      status: 'InReview' as const,
      reviewerId: REVIEWER,
      reviewerName: 'Hiruni Wijethilaka',
    };
    apiStub.post(`/tasks/${target.id}/pick`, () => {
      serveTaskDetail(db, picked);
      return picked;
    });
    const { router, user } = renderApp('/crp/reviewer');
    await findLoadedTable();

    await user.click(
      within(bodyRows().find((row) => row.textContent?.includes(target.taskCode))!).getByRole(
        'button',
        { name: /pick .* for review/i },
      ),
    );

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/crp/reviewer/tasks/${target.id}`);
    });
    expect(apiStub.requests('POST', `/tasks/${target.id}/pick`)).toHaveLength(1);
  });

  it('reports the lost race rather than failing silently (FL 3.3-02)', async () => {
    // The server says someone else got there first. The reviewer must be told
    // who, not shown a generic error and left wondering.
    apiStub.post('/tasks/:taskId/pick', () =>
      apiError(409, 'ALREADY_PICKED', 'Pinsara Chandika has already picked up this task.'),
    );

    const { router, user } = renderApp('/crp/reviewer');
    await findLoadedTable();

    await user.click(screen.getAllByRole('button', { name: /pick .* for review/i })[0]!);

    expect(await screen.findByText(/pinsara chandika has already picked up/i)).toBeInTheDocument();
    // And it does NOT navigate to a review the reviewer does not own.
    expect(router.state.location.pathname).toBe('/crp/reviewer');
  });
});

describe('My Review Tasks', () => {
  it('lists what the server says this reviewer is holding', async () => {
    const extra = db.tasks.find(
      (candidate) => candidate.developerId !== REVIEWER && candidate.status === 'Submitted',
    )!;
    const holding = [...assigned, listItem({ ...extra, reviewerId: REVIEWER, status: 'InReview' })];
    serveTaskLists({ available, assigned: holding, history: [] });

    renderApp('/crp/reviewer/my-tasks');
    await findLoadedTable();

    expect(bodyRows()).toHaveLength(holding.length);
    expect(screen.getByRole('table')).toHaveTextContent(extra.taskCode);
  });
});

describe('Review History', () => {
  /**
   * The client must not re-filter history on `task.reviewerId`.
   *
   * Requesting changes clears the task's reviewer (so the resubmission returns
   * to the queue). History used to be filtered on exactly that field, so every
   * review that found a problem vanished from the reviewer's own History tab.
   * The server keys history on the REVIEW's reviewer; the screen must show the
   * row even though the task no longer names them.
   */
  it('keeps a task the reviewer sent back, whose reviewerId was cleared', async () => {
    const task = db.tasks.find(
      (candidate) => candidate.developerId !== REVIEWER && candidate.status === 'Submitted',
    )!;
    const sentBack = listItem({
      ...task,
      status: 'ChangesRequested',
      reviewRound: 2,
      countedCycle: 2,
      reviewerId: null,
    });
    serveTaskLists({ available, assigned, history: [sentBack] });

    renderApp('/crp/reviewer/history');
    await findLoadedTable();

    expect(screen.getByRole('table')).toHaveTextContent(task.taskCode);
  });
});
