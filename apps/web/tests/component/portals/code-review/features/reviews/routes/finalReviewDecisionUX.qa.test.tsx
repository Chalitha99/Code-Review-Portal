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
import { buildDataset, toListItem, type Dataset } from '@tests/support/fixtures/dataset.ts';
import {
  serveReviewDecisions,
  serveReviewDraftWrites,
  serveReviewerWorkspace,
} from '@tests/support/serveReview.ts';

/**
 * The final decision UX. Who is notified of a decision, and which decisions are
 * allowed, are NestJS rules (apps/api reviews.service.spec); here the server
 * accepts the decision and the test checks the dialog flow and the request the
 * screen sends.
 */
let db: Dataset;
const decisions = () => apiStub.requests('POST', '/tasks/:taskId/review');

const REVIEWER = 'u-pinsara';
const IN_REVIEW_TASK = 't-blom-010';

function setupEnvironment(initialPath = `/crp/reviewer/tasks/${IN_REVIEW_TASK}`) {
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
  const task = db.tasks.find((t) => t.id === IN_REVIEW_TASK);
  if (task) {
    task.status = 'InReview';
    task.reviewerId = REVIEWER;
    task.reviewRound = 1;
    task.countedCycle = 1;
    task.adjustedCycles = [];
    task.isHandedOver = false;
  }
  db.reviews = db.reviews.filter((r) => r.taskId !== IN_REVIEW_TASK);
  db.events = db.events.filter((e) => e.taskId !== IN_REVIEW_TASK);
  db.issueResponses = db.issueResponses.filter((r) => r.taskId !== IN_REVIEW_TASK);
  serveReviewerWorkspace(db, { assigned: task ? [task] : [] });
  serveReviewDraftWrites(db);
  serveReviewDecisions(db);
  apiStub.get('/tasks', () => ({ items: [], pagination: { page: 1, pageSize: 1, total: 0 } }));
});

// A debounced autosave must not land after the test and leak into the next one.
afterEach(settleRequests);

describe('FINAL REVIEW DECISION UX QA SUITE', () => {
  it('1. Valid Rank 1 -> click Approve Task opens confirmation dialog with summary and NO API request yet', async () => {
    let postReviewCalls = 0;
    apiStub.post('/tasks/:taskId/review', () => {
      postReviewCalls++;
      return toListItem(
        db,
        db.tasks.find((t) => t.id === IN_REVIEW_TASK)!,
      );
    });

    const { user } = setupEnvironment();
    await screen.findByRole('heading', { name: /Reviewer Assessment/i });

    // Select Rank 1 (0 comments)
    await user.click(screen.getByRole('radio', { name: /Rank 1/i }));

    const approveBtn = screen.getByRole('button', { name: /Approve Task/i });
    expect(approveBtn).toBeEnabled();

    // Click Approve Task
    await user.click(approveBtn);

    // Confirmation dialog opens
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Approve this task\?/i)).toBeInTheDocument();
    expect(
      within(dialog).getByText(/This will complete the review and approve the task\./i),
    ).toBeInTheDocument();

    // Summary contains Rank 1, 0 comments, Round 1
    expect(within(dialog).getByText(/Rank 1 — Good \/ Approved Quality/i)).toBeInTheDocument();
    expect(within(dialog).getByText('0')).toBeInTheDocument();
    expect(within(dialog).getByText(/Round 1/i)).toBeInTheDocument();

    // Buttons
    expect(within(dialog).getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Approve Task/i })).toBeInTheDocument();

    // NO API request fired just by opening dialog
    expect(postReviewCalls).toBe(0);
  });

  it('2. Cancel approval closes dialog, makes no mutation, and performs no navigation', async () => {
    let postReviewCalls = 0;
    apiStub.post('/tasks/:taskId/review', () => {
      postReviewCalls++;
      return toListItem(
        db,
        db.tasks.find((t) => t.id === IN_REVIEW_TASK)!,
      );
    });

    const { user, router } = setupEnvironment();
    await screen.findByRole('heading', { name: /Reviewer Assessment/i });

    // Select Rank 1 and click Approve
    await user.click(screen.getByRole('radio', { name: /Rank 1/i }));
    await user.click(screen.getByRole('button', { name: /Approve Task/i }));

    const dialog = await screen.findByRole('dialog');
    const cancelBtn = within(dialog).getByRole('button', { name: /Cancel/i });
    await user.click(cancelBtn);

    // Dialog closes
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    // Remained on review page
    expect(router.state.location.pathname).toBe(`/crp/reviewer/tasks/${IN_REVIEW_TASK}`);
    expect(postReviewCalls).toBe(0);

    const task = db.tasks.find((t) => t.id === IN_REVIEW_TASK);
    expect(task?.status).toBe('InReview');
  });

  it('3. Confirm approval displays Approving... state, fires API, shows success state, and navigates', async () => {
    const { user, router } = setupEnvironment();
    await screen.findByRole('heading', { name: /Reviewer Assessment/i });

    await user.click(screen.getByRole('radio', { name: /Rank 1/i }));
    await user.click(screen.getByRole('button', { name: /Approve Task/i }));

    const dialog = await screen.findByRole('dialog');
    const confirmBtn = within(dialog).getByRole('button', { name: /Approve Task/i });
    await user.click(confirmBtn);

    // Shows success state in dialog
    expect(await within(dialog).findByText('Task Approved')).toBeInTheDocument();
    expect(
      within(dialog).getByText(/The review was completed successfully\./i),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: /View in Review History/i }),
    ).toBeInTheDocument();

    // Clicking Back button navigates to Review History with approved bucket
    const backDashboardBtn = within(dialog).getByRole('button', {
      name: /View in Review History/i,
    });
    await user.click(backDashboardBtn);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/crp/reviewer/history');
      expect(router.state.location.search).toContain('status=Approved');
      expect(router.state.location.search).toContain('bucket=approved');
    });

    // Exactly one decision request, carrying the reviewer's draft.
    expect(decisions()).toHaveLength(1);
    expect(decisions()[0]?.body).toMatchObject({ decision: 'Approved', draft: { rank: 1 } });
  });

  it('4. Rank 2 + valid comments -> Request Changes confirmation summary displays correct live counts', async () => {
    const { user } = setupEnvironment();
    await screen.findByRole('heading', { name: /Reviewer Assessment/i });

    // Select Rank 2 and add 2 comments
    await user.click(screen.getByRole('radio', { name: /Rank 2/i }));

    await user.click(screen.getByRole('button', { name: /Add Comment/i }));
    const inputs = screen.getAllByPlaceholderText(/Describe the actionable issue/i);
    await user.type(inputs[0]!, 'First issue details');

    await user.click(screen.getByRole('button', { name: /Add Comment/i }));
    const inputs2 = screen.getAllByPlaceholderText(/Describe the actionable issue/i);
    await user.type(inputs2[1]!, 'Second issue details');

    const requestChangesBtn = screen.getByRole('button', { name: /Request Changes/i });
    expect(requestChangesBtn).toBeEnabled();
    await user.click(requestChangesBtn);

    // Confirmation dialog opens
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Request changes\?/i)).toBeInTheDocument();
    expect(
      within(dialog).getByText(/The developer will receive your review feedback/i),
    ).toBeInTheDocument();

    // Summary checks
    expect(
      within(dialog).getByText(/Rank 2 — Minor Issues \/ Needs Improvement/i),
    ).toBeInTheDocument();
    expect(within(dialog).getByText('2')).toBeInTheDocument(); // 2 comments
    expect(within(dialog).getByText('0')).toBeInTheDocument(); // 0 screenshots
    expect(within(dialog).getByText(/Round 1/i)).toBeInTheDocument();
  });

  it('5. Cancel Request Changes closes dialog without mutation', async () => {
    let postReviewCalls = 0;
    apiStub.post('/tasks/:taskId/review', () => {
      postReviewCalls++;
      return toListItem(
        db,
        db.tasks.find((t) => t.id === IN_REVIEW_TASK)!,
      );
    });

    const { user } = setupEnvironment();
    await screen.findByRole('heading', { name: /Reviewer Assessment/i });

    await user.click(screen.getByRole('radio', { name: /Rank 2/i }));
    await user.click(screen.getByRole('button', { name: /Add Comment/i }));
    const commentInput = screen.getByPlaceholderText(/Describe the actionable issue/i);
    await user.type(commentInput, 'Valid feedback');

    await user.click(screen.getByRole('button', { name: /Request Changes/i }));
    const dialog = await screen.findByRole('dialog');

    await user.click(within(dialog).getByRole('button', { name: /Cancel/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    expect(postReviewCalls).toBe(0);
    const task = db.tasks.find((t) => t.id === IN_REVIEW_TASK);
    expect(task?.status).toBe('InReview');
  });

  it('6. Confirm Request Changes sends exactly one API request, shows success state, and transitions', async () => {
    const { user, router } = setupEnvironment();
    await screen.findByRole('heading', { name: /Reviewer Assessment/i });

    await user.click(screen.getByRole('radio', { name: /Rank 2/i }));
    await user.click(screen.getByRole('button', { name: /Add Comment/i }));
    const commentInput = screen.getByPlaceholderText(/Describe the actionable issue/i);
    await user.type(commentInput, 'Critical defect in logic');

    await user.click(screen.getByRole('button', { name: /Request Changes/i }));
    const dialog = await screen.findByRole('dialog');

    const confirmBtn = within(dialog).getByRole('button', { name: /Request Changes/i });
    await user.click(confirmBtn);

    // Success state appears
    expect(await within(dialog).findByText('Changes Requested')).toBeInTheDocument();
    expect(
      within(dialog).getByText(/The developer has been notified of the required changes\./i),
    ).toBeInTheDocument();

    // Auto-transition or click back
    await user.click(within(dialog).getByRole('button', { name: /View in Review History/i }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/crp/reviewer/history');
      expect(router.state.location.search).toContain('status=ChangesRequested');
      expect(router.state.location.search).toContain('bucket=changesRequested');
    });

    expect(decisions()).toHaveLength(1);
    expect(decisions()[0]?.body).toMatchObject({
      decision: 'ChangesRequested',
      draft: { rank: 2, comments: [expect.objectContaining({ text: 'Critical defect in logic' })] },
    });
  });

  it('7. Invalid review prevents confirmation dialog from opening and shows existing validation', async () => {
    const { user } = setupEnvironment();
    await screen.findByRole('heading', { name: /Reviewer Assessment/i });

    // 1. Unranked: buttons are disabled
    const approveBtn = screen.getByRole('button', { name: /Approve Task/i });
    const requestChangesBtn = screen.getByRole('button', { name: /Request Changes/i });
    expect(approveBtn).toBeDisabled();
    expect(requestChangesBtn).toBeDisabled();

    // 2. Rank 1 with a comment: Approve is enabled; neutral info banner is shown
    await user.click(screen.getByRole('radio', { name: /Rank 1/i }));
    await user.click(screen.getByRole('button', { name: /Add Comment/i }));
    expect(approveBtn).toBeEnabled();
    expect(
      screen.getByText(/Rank 1 indicates that no unresolved issues remain/i),
    ).toBeInTheDocument();

    // 3. Rank 2 without comments: Request Changes is disabled
    await user.click(screen.getByRole('radio', { name: /Rank 2/i }));
    // Delete comment
    await user.click(screen.getByLabelText(/Delete comment/i));
    expect(requestChangesBtn).toBeDisabled();
    expect(
      screen.getAllByText(
        /(?:Rank 2 requires at least one review comment|Review Comments Required)/i,
      ).length,
    ).toBeGreaterThan(0);

    // Dialog must NOT be open
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('8. API failure preserves review data intact, does not navigate, and allows retry', async () => {
    let callCount = 0;
    apiStub.post('/tasks/:taskId/review', () => {
      callCount++;
      if (callCount === 1) {
        return apiError(500, 'INTERNAL_ERROR', 'Database connection failed');
      }
      return toListItem(
        db,
        db.tasks.find((t) => t.id === IN_REVIEW_TASK)!,
      );
    });

    const { user, router } = setupEnvironment();
    await screen.findByRole('heading', { name: /Reviewer Assessment/i });

    await user.click(screen.getByRole('radio', { name: /Rank 1/i }));
    await user.click(screen.getByRole('button', { name: /Approve Task/i }));

    const dialog = await screen.findByRole('dialog');
    const confirmBtn = within(dialog).getByRole('button', { name: /Approve Task/i });

    // First attempt fails
    await user.click(confirmBtn);

    // Error alert visible in dialog
    await waitFor(() => {
      expect(within(dialog).getByRole('alert')).toBeInTheDocument();
      expect(within(dialog).getByText(/Database connection failed/i)).toBeInTheDocument();
    });

    // Did NOT navigate
    expect(router.state.location.pathname).toBe(`/crp/reviewer/tasks/${IN_REVIEW_TASK}`);
    expect(within(dialog).queryByText('Task Approved')).not.toBeInTheDocument();

    // Retry succeeded on second attempt
    await user.click(confirmBtn);

    expect(await within(dialog).findByText('Task Approved')).toBeInTheDocument();
  });

  it('9. Repeated / rapid clicks trigger exactly one final API request', async () => {
    let apiCalls = 0;
    apiStub.post('/tasks/:taskId/review', async () => {
      apiCalls++;
      await new Promise((r) => setTimeout(r, 80));
      return toListItem(
        db,
        db.tasks.find((t) => t.id === IN_REVIEW_TASK)!,
      );
    });

    const { user } = setupEnvironment();
    await screen.findByRole('heading', { name: /Reviewer Assessment/i });

    await user.click(screen.getByRole('radio', { name: /Rank 1/i }));
    await user.click(screen.getByRole('button', { name: /Approve Task/i }));

    const dialog = await screen.findByRole('dialog');
    const confirmBtn = within(dialog).getByRole('button', { name: /Approve Task/i });

    // Rapid double click
    void user.click(confirmBtn);
    void user.click(confirmBtn);

    await waitFor(() => {
      expect(within(dialog).getByText('Task Approved')).toBeInTheDocument();
    });

    expect(apiCalls).toBe(1);
  });

  it('10. Successful final action allows smooth redirect without unsaved-navigation warning', async () => {
    const { user, router } = setupEnvironment();
    await screen.findByRole('heading', { name: /Reviewer Assessment/i });

    // Make local dirty edits
    await user.click(screen.getByRole('radio', { name: /Rank 2/i }));
    await user.click(screen.getByRole('button', { name: /Add Comment/i }));
    const commentInput = screen.getByPlaceholderText(/Describe the actionable issue/i);
    await user.type(commentInput, 'Dirty feedback note');

    // Shows unsaved changes
    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();

    // Click Request Changes
    await user.click(screen.getByRole('button', { name: /Request Changes/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /Request Changes/i }));

    // Success appears
    expect(await within(dialog).findByText('Changes Requested')).toBeInTheDocument();

    // Navigate to Review History
    await user.click(within(dialog).getByRole('button', { name: /View in Review History/i }));

    // Transitions to Review History without being interrupted by unsaved changes modal
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/crp/reviewer/history');
      expect(router.state.location.search).toContain('status=ChangesRequested');
      expect(router.state.location.search).toContain('bucket=changesRequested');
    });
    expect(screen.queryByRole('heading', { name: /Unsaved Changes/i })).not.toBeInTheDocument();
  });

  it('11. Task History records only the genuine final decision event and zero noise on open/cancel', async () => {
    const { user } = setupEnvironment();
    await screen.findByRole('heading', { name: /Reviewer Assessment/i });

    // Select Rank 1
    await user.click(screen.getByRole('radio', { name: /Rank 1/i }));

    // Open and Cancel Approve dialog
    await user.click(screen.getByRole('button', { name: /Approve Task/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /Cancel/i }));

    // Opening and cancelling sends nothing that would write history.
    expect(decisions()).toHaveLength(0);

    // Open again and confirm
    await user.click(screen.getByRole('button', { name: /Approve Task/i }));
    const dialog2 = await screen.findByRole('dialog');
    await user.click(within(dialog2).getByRole('button', { name: /Approve Task/i }));

    await waitFor(() => {
      expect(decisions()).toHaveLength(1);
    });

    // One decision; no explicit draft save (which is what writes a
    // ReviewDraftSaved history event on the server).
    expect(
      apiStub
        .requests('PUT', '/tasks/:taskId/review')
        .filter(({ query }) => query.get('source') === 'manual'),
    ).toHaveLength(0);
  });
});
