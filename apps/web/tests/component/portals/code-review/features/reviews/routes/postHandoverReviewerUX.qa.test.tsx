import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { Toaster } from 'sonner';
import { signInForTest } from '@tests/support/setup.ts';
import { routes } from '@/app/routes.tsx';
import { settleRequests } from '@tests/support/settleRequests.ts';
import { apiError, apiStub } from '@tests/support/apiStub.ts';
import { buildDataset, type Dataset } from '@tests/support/fixtures/dataset.ts';
import {
  serveHandoverOutcomes,
  serveReviewDraftWrites,
  serveReviewerWorkspace,
} from '@tests/support/serveReview.ts';

let db: Dataset;

const REVIEWER = 'u-pinsara';
const OTHER_REVIEWER = 'u-kavidu';
const TARGET_TASK = 't-blom-010';

function setupEnvironment(initialPath = `/crp/reviewer/tasks/${TARGET_TASK}`) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] });

  const utils = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>,
  );

  return { ...utils, queryClient, router, user: userEvent.setup({ delay: null }) };
}

beforeEach(() => {
  db = buildDataset();
  signInForTest(REVIEWER);

  const task = db.tasks.find((t) => t.id === TARGET_TASK);
  if (task) {
    task.status = 'InReview';
    task.reviewerId = REVIEWER;
    task.reviewRound = 1;
    task.countedCycle = 1;
    task.adjustedCycles = [];
    task.isHandedOver = false;
    task.currentReviewSessionId = null;
  }
  db.reviews = db.reviews.filter((r) => r.taskId !== TARGET_TASK);
  db.events = db.events.filter((e) => e.taskId !== TARGET_TASK);
  db.issueResponses = db.issueResponses.filter((r) => r.taskId !== TARGET_TASK);
  db.handovers = db.handovers.filter((h) => h.taskId !== TARGET_TASK);
  serveReviewerWorkspace(db, { assigned: task ? [task] : [] });
  serveReviewDraftWrites(db);
  serveHandoverOutcomes(db);
});

// A debounced autosave must not land after the test and leak into the next one.
afterEach(settleRequests);

describe('POST-HANDOVER REVIEWER UX QA SUITE', () => {
  it('1. Handover submission shows success state in modal, navigates to dashboard, and bypasses blocker', async () => {
    const { user, router } = setupEnvironment();

    await screen.findByRole('heading', { name: /Reviewer Assessment/i });

    // Enter comment and select Rank 2
    await user.click(await screen.findByRole('button', { name: /add comment/i }));
    const commentInput = await screen.findByPlaceholderText(/describe the actionable issue/i);
    await user.type(commentInput, 'Review comment prior to handover');
    await user.click(screen.getByRole('radio', { name: /Rank 2/i }));

    // Open Handover Dialog
    const handoverBtn = await screen.findByRole('button', { name: /hand over/i });
    await user.click(handoverBtn);

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByRole('heading', { name: /Review Rank Cannot Be Handed Over/i }),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /Clear Rank & Hand Over/i }));

    expect(
      within(dialog).getByRole('heading', { name: /Hand this review over/i }),
    ).toBeInTheDocument();

    // Type reason
    const reasonInput = within(dialog).getByRole('textbox', { name: /^reason$/i });
    await user.type(reasonInput, 'Medical leave - transferring to team');

    // Confirm Handover
    const confirmBtn = within(dialog).getByRole('button', { name: /^hand over$/i });
    await user.click(confirmBtn);

    // Modal switches to success acknowledgement
    await waitFor(() => {
      expect(
        within(dialog).getByRole('heading', { name: /Review Handed Over/i }),
      ).toBeInTheDocument();
      expect(
        within(dialog).getByText(/The task has been sent to Admin for reassignment/i),
      ).toBeInTheDocument();
      expect(
        within(dialog).getByText(/Returning to Reviewer Dashboard\.\.\./i),
      ).toBeInTheDocument();
    });

    // Automatically navigates to dashboard after smooth delay
    await waitFor(
      () => {
        expect(router.state.location.pathname).toBe('/crp/reviewer');
      },
      { timeout: 3000 },
    );

    // Verify blocker did not trigger
    expect(screen.queryByText(/Unsaved Changes/i)).toBeNull();

    // Verify task state in db
    const updatedTask = db.tasks.find((t) => t.id === TARGET_TASK);
    expect(updatedTask?.isHandedOver).toBe(true);
    expect(updatedTask?.reviewerId).toBeNull();
  });

  it('2. Handed-over task URL renders HandedOverSummary with correct Review Round vs Cycle and event metadata', async () => {
    const task = db.tasks.find((t) => t.id === TARGET_TASK)!;
    task.status = 'Submitted';
    task.reviewerId = null;
    task.isHandedOver = true;
    task.reviewRound = 2; // Physical Review Round
    task.countedCycle = 1; // Counted cycle after adjustment

    db.events.push({
      id: 'e-ho-1',
      taskId: TARGET_TASK,
      kind: 'HandedOver',
      reviewRound: 1,
      actorId: REVIEWER,
      actorName: 'Pinsara Chandika',
      note: 'Need domain expert on bloom filter hashing',
      occurredAt: '2026-09-10T09:30:00.000Z',
    });

    const { user, router } = setupEnvironment();

    // Wait for HandedOverSummary
    await screen.findByText('Awaiting Admin Reassignment', { exact: true });
    const summaryCard = screen.getByTestId('handed-over-summary');
    expect(screen.getAllByText('Review Handed Over').length).toBeGreaterThanOrEqual(1);

    // Verify Round is Round 2 and Cycle is Cycle 1 (distinct!)
    expect(within(summaryCard).getByText('Round').nextElementSibling).toHaveTextContent('Round 2');
    expect(within(summaryCard).getByText('Cycle').nextElementSibling).toHaveTextContent(
      'Cycle 1',
    );

    // Verify metadata from HandedOver event
    expect(within(summaryCard).getByText('Pinsara Chandika')).toBeInTheDocument();
    expect(
      within(summaryCard).getByText(/Need domain expert on bloom filter hashing/i),
    ).toBeInTheDocument();

    // Verify absolutely NO active review assessment elements
    expect(screen.queryByText(/Ranking Required/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /add comment/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /save as draft/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /approve task/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /request changes/i })).toBeNull();

    // Verify sidebar shows Review Handed Over
    expect(
      screen.getByText('This review has been handed over and is awaiting Admin reassignment.'),
    ).toBeInTheDocument();

    // Click Back to Dashboard
    const backBtn = screen.getByRole('button', { name: /Back to Reviewer Dashboard/i });
    await user.click(backBtn);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/crp/reviewer');
    });
  });

  it('3. After Admin reassigns task to Reviewer B, Reviewer A revisiting old URL sees clean access state with no active review workspace', async () => {
    // Task reassigned to Reviewer B
    const task = db.tasks.find((t) => t.id === TARGET_TASK)!;
    task.status = 'InReview';
    task.reviewerId = OTHER_REVIEWER;
    task.isHandedOver = false;

    // Signed in as Reviewer A (REVIEWER)
    signInForTest(REVIEWER);
    const { user, router } = setupEnvironment();

    // Wait for read-only assigned state
    await screen.findByText('Task Assigned to Another Reviewer');
    expect(
      screen.getByText(/This task is currently in review by Kavidu Dilshan/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/You do not have permission to view or edit this active assessment/i),
    ).toBeInTheDocument();

    // Verify Reviewer A cannot see or edit active workspace
    expect(screen.queryByText(/Ranking Required/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /add comment/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /save as draft/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /approve task/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /request changes/i })).toBeNull();

    // Back to dashboard
    const backBtn = screen.getByRole('button', { name: /Back to Reviewer Dashboard/i });
    await user.click(backBtn);
    expect(router.state.location.pathname).toBe('/crp/reviewer');
  });

  it('4. Handover API failure preserves typed reason, shows error, and keeps user on the page', async () => {
    apiStub.post('/tasks/:taskId/handover', () =>
      apiError(500, 'INTERNAL_ERROR', 'Database connection failed'),
    );

    const { user, router } = setupEnvironment();

    await screen.findByRole('heading', { name: /Reviewer Assessment/i });

    // Open Handover Dialog
    const handoverBtn = await screen.findByRole('button', { name: /hand over/i });
    await user.click(handoverBtn);

    const dialog = await screen.findByRole('dialog');
    const reasonInput = within(dialog).getByRole('textbox', { name: /^reason$/i });
    await user.type(reasonInput, 'Need reassignment');

    const confirmBtn = within(dialog).getByRole('button', { name: /^hand over$/i });
    await user.click(confirmBtn);

    // Dialog stays open, error is shown, user does NOT navigate
    await waitFor(() => {
      expect(screen.getByText(/Database connection failed/i)).toBeInTheDocument();
    });
    expect(within(dialog).getByRole('textbox', { name: /^reason$/i })).toHaveValue(
      'Need reassignment',
    );
    expect(router.state.location.pathname).toBe(`/crp/reviewer/tasks/${TARGET_TASK}`);
  });

  it('5. Pre-handover comments and draft travel with the handover, without a ReviewDraftSaved save', async () => {
    const { user } = setupEnvironment();

    await screen.findByRole('heading', { name: /Reviewer Assessment/i });

    // Enter draft comments and Rank 3
    await user.click(await screen.findByRole('button', { name: /add comment/i }));
    const commentInput = await screen.findByPlaceholderText(/describe the actionable issue/i);
    await user.type(commentInput, 'Critical bug in lock acquisition');
    await user.click(screen.getByRole('radio', { name: /Rank 3/i }));

    // Hand over
    await user.click(screen.getByRole('button', { name: /hand over/i }));
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByRole('heading', { name: /Review Rank Cannot Be Handed Over/i }),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /Clear Rank & Hand Over/i }));

    await user.type(
      within(dialog).getByRole('textbox', { name: /^reason$/i }),
      'Handing over to concurrency specialist',
    );
    await user.click(within(dialog).getByRole('button', { name: /^hand over$/i }));

    // One handover request. NestJS saves the draft it carries in the same
    // transaction as the handover (apps/api handovers), so the draft must be in
    // it — rank cleared, the comment kept — with no separate manual save.
    await waitFor(() => {
      expect(apiStub.requests('POST', '/tasks/:taskId/handover')).toHaveLength(1);
    });
    expect(apiStub.requests('POST', '/tasks/:taskId/handover')[0]?.body).toMatchObject({
      reason: 'Handing over to concurrency specialist',
      draft: {
        rank: null,
        comments: [expect.objectContaining({ text: 'Critical bug in lock acquisition' })],
      },
    });
    expect(
      apiStub
        .requests('PUT', '/tasks/:taskId/review')
        .filter(({ query }) => query.get('source') === 'manual'),
    ).toHaveLength(0);
    expect(db.tasks.find((t) => t.id === TARGET_TASK)?.isHandedOver).toBe(true);
  });
});
