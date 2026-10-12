import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { signInForTest } from '@tests/support/setup.ts';
import { routes } from '@/app/routes.tsx';
import { buildDataset, type Dataset } from '@tests/support/fixtures/dataset.ts';
import { serveReviewDraftWrites, serveReviewerWorkspace } from '@tests/support/serveReview.ts';

let db: Dataset;
/** The draft NestJS has stored for this round (what the last PUT /review saved). */
const findReview = (taskId: string, round: number) =>
  db.reviews.find((review) => review.taskId === taskId && review.reviewRound === round);
import { settleRequests } from '@tests/support/settleRequests.ts';

/**
 * Reviewer Assessment State:
 *
 * Verifies that typing review comments, attaching evidence, and selecting ranks
 * preserves form state, properly gates Request Changes / Approve Task decisions,
 * and autosaves drafts without deciding the review.
 */

/** Pinsara is the assigned reviewer on BLOM-010, which is In Review. */
const REVIEWER = 'u-pinsara';
const IN_REVIEW_TASK = 't-blom-010';

/** A real 1×1 PNG, so the size and type checks see an actual image. */
function pngFile(name: string) {
  const bytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return new File([bytes], name, { type: 'image/png' });
}

function renderReviewForm() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(routes, {
    initialEntries: [`/crp/reviewer/tasks/${IN_REVIEW_TASK}`],
  });

  const utils = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  return { ...utils, user: userEvent.setup({ delay: null }) };
}

function fileInput() {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (input === null) throw new Error('No screenshot input on the review form');
  return input;
}

beforeEach(() => {
  db = buildDataset();
  signInForTest(REVIEWER);
  // Ensure task is InReview
  const task = db.tasks.find((t) => t.id === IN_REVIEW_TASK);
  if (task) {
    task.status = 'InReview';
    task.reviewerId = REVIEWER;
    task.reviewRound = 1;
    task.countedCycle = 1;
    task.adjustedCycles = [];
  }
  db.reviews = db.reviews.filter((r) => r.taskId !== IN_REVIEW_TASK);
  serveReviewerWorkspace(db, { assigned: task ? [task] : [] });
  serveReviewDraftWrites(db);
});

// A debounced autosave must not land after the test and leak into the next one.
afterEach(settleRequests);

describe('review form state', () => {
  it('shows the counted cycle without the removed adjustment label', async () => {
    const task = db.tasks.find((candidate) => candidate.id === IN_REVIEW_TASK);
    if (!task) throw new Error('seed has no in-review task');
    task.reviewRound = 2;
    task.countedCycle = 1;

    renderReviewForm();

    expect(await screen.findByText('Cycle 1')).toBeInTheDocument();
    expect(screen.queryByText(/Adjusted \(-1\)/i)).not.toBeInTheDocument();
  });

  it('keeps typed review comments and the chosen rank when attaching a screenshot to a comment', async () => {
    const { user } = renderReviewForm();

    await screen.findByRole('heading', { name: /Reviewer Assessment/i });

    // Select Rank 2
    const rank2 = screen.getByRole('radio', { name: /rank 2/i });
    await user.click(rank2);

    // Add a comment
    const addCommentBtn = screen.getByRole('button', { name: /add comment/i });
    await user.click(addCommentBtn);

    const commentInput = screen.getByPlaceholderText(/describe the actionable issue/i);
    await user.type(commentInput, 'The cancellation path is missing.');

    // Upload attachment
    await user.upload(fileInput(), pngFile('defect.png'));
    expect(await screen.findByText(/screenshot-1\.png/i)).toBeInTheDocument();

    // Everything typed survives
    expect(screen.getByPlaceholderText(/describe the actionable issue/i)).toHaveValue(
      'The cancellation path is missing.',
    );
    expect(screen.getByRole('radio', { name: /rank 2/i })).toHaveAttribute('aria-checked', 'true');
  });

  it('lets a Rank 2 review reach Request Changes once a review comment exists without screenshots', async () => {
    const { user } = renderReviewForm();

    await screen.findByRole('heading', { name: /Reviewer Assessment/i });

    // Select Rank 2
    await user.click(screen.getByRole('radio', { name: /rank 2/i }));

    const requestChanges = screen.getByRole('button', { name: /request changes/i });
    // Blocked when 0 comments exist
    expect(requestChanges).toBeDisabled();

    // Add a comment
    await user.click(screen.getByRole('button', { name: /add comment/i }));
    const commentInput = screen.getByPlaceholderText(/describe the actionable issue/i);
    await user.type(commentInput, 'Rollback branch is wrong.');

    // Request changes is now enabled without needing any screenshot attachments!
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /request changes/i })).toBeEnabled();
    });

    // Approve stays disabled because Rank 2 is not eligible for approval
    expect(screen.getByRole('button', { name: /approve task/i })).toBeDisabled();
  });

  it('persists work in progress without deciding the review', async () => {
    const { user } = renderReviewForm();

    await screen.findByRole('heading', { name: /Reviewer Assessment/i });

    // Select Rank 3
    await user.click(screen.getByRole('radio', { name: /rank 3/i }));

    // Add a comment
    await user.click(screen.getByRole('button', { name: /add comment/i }));
    const commentInput = screen.getByPlaceholderText(/describe the actionable issue/i);
    await user.type(commentInput, 'Retry loop never terminates.');

    // Save as draft manually
    await user.click(screen.getByRole('button', { name: /save as draft/i }));

    await waitFor(
      () => {
        const stored = findReview(IN_REVIEW_TASK, 1);
        expect(stored?.comments?.[0]?.text).toBe('Retry loop never terminates.');
        expect(stored?.rank).toBe(3);
      },
      { timeout: 5000 },
    );

    const stored = findReview(IN_REVIEW_TASK, 1);
    expect(stored?.decision).toBeNull();
    expect(stored?.decidedAt).toBeNull();

    // Task remains InReview
    expect(db.tasks.find((task) => task.id === IN_REVIEW_TASK)?.status).toBe('InReview');
  });
});
