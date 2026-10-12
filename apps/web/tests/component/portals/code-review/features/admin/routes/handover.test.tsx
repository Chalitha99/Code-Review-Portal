import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { signInForTest } from '@tests/support/setup.ts';
import { routes } from '@/app/routes.tsx';
import { useSession } from '@/hooks/useSession.ts';
import { apiStub } from '@tests/support/apiStub.ts';
import { buildDataset, toListItem, type Dataset } from '@tests/support/fixtures/dataset.ts';
import { page } from '@tests/support/serve.ts';
import {
  serveHandoverOutcomes,
  serveReviewDraftWrites,
  serveReviewerWorkspace,
} from '@tests/support/serveReview.ts';

let db: Dataset;

/**
 * Task lists read live from this test's state, so a handover made by the
 * reviewer is what the admin and the next reviewer see. The filters are a
 * plain statement of each queue for this journey; NestJS's own scope rules are
 * tested in apps/api.
 */
function serveLiveQueues() {
  apiStub.get('/tasks', ({ query }) => {
    const me = useSession.getState().userId;
    const scope = query.get('scope');
    const rows = db.tasks.filter((task) => {
      if (scope === 'all') return task.status !== 'Draft';
      if (scope === 'available')
        return (
          task.reviewerId === null &&
          task.developerId !== me &&
          (task.status === 'Submitted' || task.status === 'ReSubmitted')
        );
      if (scope === 'assigned') return task.reviewerId === me && task.status === 'InReview';
      if (scope === 'mine') return task.developerId === me;
      return false;
    });
    return page(rows.map((task) => toListItem(db, task)));
  });
}

/**
 * Handover, end to end: reviewer hands back → admin sees it → admin reassigns.
 *
 * ⚠️ The whole feature is our design — the specification defines handover in one
 * paragraph and no wireframe exists. That makes the tests the specification, so
 * they assert the properties the design rests on rather than its pixels:
 *
 *  1. a handed-over task returns to Available Tasks with its handover context;
 *  2. the review cycle does NOT increment (a cycle is a completed review, and
 *     handing over is the absence of one — inflating it would corrupt Reports);
 *  3. the previous reviewer remains eligible to pick it or receive reassignment.
 */

const ADMIN = 'u-charith';
/** Assigned reviewer on BLOM-010, which is In Review. */
const ASSIGNED_REVIEWER = 'u-pinsara';
/** A reviewer with no claim on BLOM-010 — the negative control. */
const OTHER_REVIEWER = 'u-kavidu';

const IN_REVIEW_TASK = 't-blom-010';

function renderAt(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  const router = createMemoryRouter(routes, { initialEntries: [path] });

  const utils = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  return { ...utils, router, user: userEvent.setup({ delay: null }) };
}

/**
 * Hands BLOM-010 back, as its assigned reviewer, then unmounts.
 *
 * The unmount matters: Testing Library cleans up between TESTS, not between two
 * renders inside one. Leaving the reviewer's page mounted would leave a second
 * copy of the app in the document, and every later query would match whichever
 * it found first — passing or failing for reasons that have nothing to do with
 * the handover. The test's state survives the unmount, which is what lets the
 * admin half of each test see the result.
 */
async function handOver(reason = 'On leave from Friday.') {
  signInForTest(ASSIGNED_REVIEWER);
  const { user, unmount } = renderAt(`/crp/reviewer/tasks/${IN_REVIEW_TASK}`);

  await user.click(await screen.findByRole('button', { name: /hand over/i }));

  const dialog = await screen.findByRole('dialog');
  await user.type(within(dialog).getByRole('textbox', { name: /^reason/i }), reason);
  await user.click(within(dialog).getByRole('button', { name: /^hand over$/i }));

  await waitFor(() => {
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  unmount();
}

beforeEach(() => {
  db = buildDataset();
  signInForTest(ADMIN);
  serveReviewerWorkspace(db);
  serveReviewDraftWrites(db);
  serveHandoverOutcomes(db);
  serveLiveQueues();
});

describe('reviewer hands a task back', () => {
  it('offers Hand Over only to the assigned reviewer', async () => {
    signInForTest(OTHER_REVIEWER);
    renderAt(`/crp/reviewer/tasks/${IN_REVIEW_TASK}`);

    // The form is read-only for anyone else, so the action that changes the
    // task's ownership must not be offered either.
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('button', { name: /hand over/i })).toBeNull();
  });

  it('requires a reason', async () => {
    signInForTest(ASSIGNED_REVIEWER);
    const { user } = renderAt(`/crp/reviewer/tasks/${IN_REVIEW_TASK}`);

    await user.click(await screen.findByRole('button', { name: /hand over/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /^hand over$/i }));

    // The reason is the only thing the admin has to go on when choosing who
    // picks the task up, so an empty one is refused rather than stored.
    expect(await screen.findByText(/explain why this review is being handed over/i)).toBeVisible();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('returns the task to Submitted without touching the review cycle', async () => {
    await handOver();

    signInForTest(ADMIN);
    const { user } = renderAt('/crp/admin');

    // Filtered to the code rather than read off page 1: the admin grid pages at
    // 15 over fixtures with more tasks than that, so which rows are visible
    // depends on the fixture dates rather than on anything under test here.
    const search = await screen.findByRole('searchbox', {
      name: /search tasks/i,
    });
    await user.type(search, 'BLOM-010');

    const cell = await screen.findByText('BLOM-010');
    const row = cell.closest('tr');
    if (row === null) throw new Error('No BLOM-010 row');

    await waitFor(() => {
      expect(within(row).getByText('Submitted')).toBeInTheDocument();
    });
    // Reviewer cleared, and the cycle is untouched — BLOM-010 is on cycle 1 and
    // a handover is not a completed review round.
    expect(within(row).getByText('Unassigned')).toBeInTheDocument();
    expect(within(row).getByText(/Cycle 1/)).toBeInTheDocument();
  });

  it('shows the task in Available Tasks and lets the previous reviewer retake it', async () => {
    await handOver();

    signInForTest(ASSIGNED_REVIEWER);
    const { router, user } = renderAt('/crp/reviewer');

    const cell = await screen.findByText('BLOM-010');
    const row = cell.closest('tr');
    if (row === null) throw new Error('No BLOM-010 row');

    const label = within(row).getByText('Prev. Pinsara');
    expect(label).toHaveClass('text-[10px]', 'italic', 'text-status-handover');
    await user.click(within(row).getByRole('button', { name: /pick BLOM-010 for review/i }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/crp/reviewer/tasks/${IN_REVIEW_TASK}`);
    });
  });
});

describe('admin handover queue', () => {
  it('lists the handover with its reason', async () => {
    await handOver('Needs someone with Lobby experience.');

    signInForTest(ADMIN);
    renderAt('/crp/admin/handovers');

    const taskCell = await screen.findByText('BLOM-010');
    const row = taskCell.closest('tr');
    if (row === null) throw new Error('No BLOM-010 handover row');
    expect(within(row).getByText(/needs someone with lobby experience/i)).toBeInTheDocument();
    expect(within(row).getByText('Awaiting action')).toBeInTheDocument();
  });

  it('keeps the previous-reviewer label after admin reassignment', async () => {
    await handOver();

    signInForTest(ADMIN);
    const { user, unmount } = renderAt('/crp/admin/handovers');

    const cell = await screen.findByText('BLOM-010');
    const row = cell.closest('tr');
    if (row === null) throw new Error('No handover row');

    await user.click(within(row).getByRole('button', { name: /reassign BLOM-010/i }));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('combobox', { name: /reviewer/i }));

    await user.click(await screen.findByRole('option', { name: 'Kavidu Dilshan' }));
    await user.click(within(dialog).getByRole('button', { name: /^reassign$/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    // The row stays listed as history, now resolved.
    expect(await screen.findByText('Reassigned')).toBeInTheDocument();
    expect(screen.getByText(/reassigned to kavidu dilshan/i)).toBeInTheDocument();

    unmount();
    signInForTest(OTHER_REVIEWER);
    renderAt('/crp/reviewer/my-tasks');

    const reassignedTask = await screen.findByText('BLOM-010');
    const reassignedRow = reassignedTask.closest('tr');
    if (reassignedRow === null) throw new Error('No reassigned BLOM-010 row');
    expect(within(reassignedRow).getByText('Prev. Pinsara')).toBeInTheDocument();
  });

  it('returns a task to the open queue instead, when no one is named', async () => {
    await handOver();

    signInForTest(ADMIN);
    const { user } = renderAt('/crp/admin/handovers');

    const cell = await screen.findByText('BLOM-010');
    const row = cell.closest('tr');
    if (row === null) throw new Error('No handover row');

    await user.click(
      within(row).getByRole('button', { name: /return BLOM-010 to the open queue/i }),
    );
    await user.click(await screen.findByRole('button', { name: /^return to queue$/i }));

    await waitFor(() => {
      expect(screen.getByText('Returned to queue')).toBeInTheDocument();
    });
  });

  it('is closed to a non-admin', async () => {
    signInForTest('u-dheliya'); // Developer only.
    const { router } = renderAt('/crp/admin/handovers');

    await waitFor(() => {
      expect(router.state.location.pathname).not.toBe('/crp/admin/handovers');
    });
  });
});
