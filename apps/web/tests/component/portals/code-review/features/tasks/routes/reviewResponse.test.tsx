import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { Toaster } from 'sonner';
import { signInForTest } from '@tests/support/setup.ts';
import { routes } from '@/app/routes.tsx';
import { apiError, apiStub } from '@tests/support/apiStub.ts';
import { buildDataset, toListItem, type Dataset } from '@tests/support/fixtures/dataset.ts';
import { serveDeveloperWorkspace } from '@tests/support/serve.ts';
import { serveResponseWrites } from '@tests/support/serveReview.ts';

let db: Dataset;

/**
 * FL 2.11.2.3-01, end to end through the real route table.
 *
 * The rule that matters: a developer may disagree with a reviewer, but not
 * silently. Rejecting a finding without a written reason must not resubmit the
 * task. The SERVER also refuses it (422 REJECTION_REASON_REQUIRED, and 422
 * RESPONSES_INCOMPLETE for a resubmission with unanswered findings) — tested in
 * apps/api; the answers below are the ones NestJS gives.
 */

const DEVELOPER = 'u-hiruni';
const REVIEWER = 'u-pinsara';

/**
 * "Submit for Review", and NOT "Resubmit for Review".
 *
 * An unanchored `/submit for review/i` is a substring match, and "Resubmit for
 * Review" contains it — so the obvious query finds the panel's button and every
 * assertion about the header control silently measures the wrong element.
 */
const HEADER_SUBMIT = /^submit for review$/i;

/** The fixture task each test reshapes, so the tests here share one starting point. */
function developerTask() {
  const task = db.tasks.find(
    (candidate) => candidate.developerId === DEVELOPER && candidate.isChecklistComplete,
  );
  if (!task) throw new Error('fixtures have no complete task for this developer');
  return task;
}

/** Puts a task into ChangesRequested with one screenshot finding to answer. */
function seedFeedback() {
  const task = developerTask();

  task.status = 'ChangesRequested';
  task.reviewerId = null;
  task.reviewRound = 2;
  task.countedCycle = 2;

  db.reviews.push({
    id: `rev-${task.id}-1`,
    taskId: task.id,
    reviewRound: 1,
    reviewerId: REVIEWER,
    reviewerName: 'Pinsara Chandika',
    comments: [],
    generalCheck: [],
    findings: {
      incorrectCode: 'The cursor selects against a table instead of a view.',
      incompleteImplementation: '',
      sourceFormatting: '',
    },
    otherRemarks: '',
    feedbackSummary: 'Two things to fix before this can go.',
    rank: 2,
    screenshots: [
      {
        id: 'shot-1',
        fileName: 'cursor.png',
        sizeBytes: 2048,
        mimeType: 'image/png',
        storageRef: 'data:,',
        comment: 'This query is the problem.',
        uploadedAt: '2026-01-02T00:00:00.000Z',
      },
    ],
    decision: 'ChangesRequested',
    decidedAt: '2026-01-02T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  });

  return task;
}

function renderTask(taskId: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(routes, { initialEntries: [`/crp/developer/tasks/${taskId}`] });

  return {
    ...render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <Toaster />
      </QueryClientProvider>,
    ),
    router,
    user: userEvent.setup({ delay: null }),
  };
}

beforeEach(() => {
  db = buildDataset();
  signInForTest(DEVELOPER);
  serveDeveloperWorkspace(db, DEVELOPER);
  serveResponseWrites(db);
  // NestJS refuses a rejection without a reason before storing anything.
  const accept = db;
  apiStub.post('/tasks/:taskId/responses', ({ params, body }) => {
    const input = body as {
      kind: string;
      rejectionReason?: string;
      screenshotId?: string | null;
      commentId?: string | null;
    };
    if (input.kind === 'Rejected' && !input.rejectionReason?.trim()) {
      return apiError(
        422,
        'REJECTION_REASON_REQUIRED',
        'Provide a reason when rejecting a review finding.',
      );
    }
    const task = accept.tasks.find((entry) => entry.id === params['taskId'])!;
    const key = input.commentId ?? input.screenshotId ?? 'overall';
    const record = {
      id: `resp-${task.id}-${String(task.reviewRound)}-${key}`,
      taskId: task.id,
      reviewRound: task.reviewRound,
      commentId: input.commentId ?? null,
      screenshotId: input.screenshotId ?? null,
      kind: input.kind as 'Resolved' | 'Rejected',
      rejectionReason: input.rejectionReason?.trim() ? input.rejectionReason.trim() : null,
      verdict: 'Pending' as const,
      respondedAt: new Date().toISOString(),
    };
    accept.issueResponses = [
      ...accept.issueResponses.filter((entry) => entry.id !== record.id),
      record,
    ];
    return accept.issueResponses.filter((entry) => entry.taskId === task.id);
  });
});

describe('responding to review feedback', () => {
  it('shows every finding the reviewer raised', async () => {
    const task = seedFeedback();
    renderTask(task.id);

    // 'Review Feedback' and 'Review Feedback History' both match a loose regex.
    expect(await screen.findByText('Review Feedback')).toBeInTheDocument();
    // One issue per screenshot, plus one for the written findings.
    expect(await screen.findByText(/this query is the problem/i)).toBeInTheDocument();
    expect(screen.getAllByText(/cursor selects against a table/i).length).toBeGreaterThan(0);
    // The summary appears twice by design: once in the panel being answered, and
    // again in the cycle history below it.
    expect(screen.getAllByText(/two things to fix/i).length).toBeGreaterThan(0);
  });

  it('blocks resubmission until every finding is answered', async () => {
    const task = seedFeedback();
    const { user } = renderTask(task.id);

    const resubmit = await screen.findByRole('button', { name: /resubmit for review/i });
    expect(resubmit).toBeDisabled();
    expect(screen.getByText(/2 findings still need a response/i)).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: /^resolve$/i })[0]!);
    await waitFor(() => {
      expect(screen.getByText(/1 finding still needs a response/i)).toBeInTheDocument();
    });
  });

  it('will not record a rejection without a reason (FL 2.11.2.3-01)', async () => {
    const task = seedFeedback();
    const { user } = renderTask(task.id);

    await screen.findByRole('button', { name: /resubmit for review/i });

    await user.click(screen.getAllByRole('button', { name: /^reject$/i })[0]!);
    await user.click(screen.getByRole('button', { name: /save rejection/i }));

    // Nothing was saved, and the developer is told why.
    expect(
      await screen.findByText(/provide a reason when rejecting a review finding/i),
    ).toBeInTheDocument();
    expect(db.issueResponses.filter((r) => r.taskId === task.id)).toHaveLength(0);
  });

  it('records a justified rejection and then allows resubmission', async () => {
    const task = seedFeedback();
    apiStub.post(`/tasks/${task.id}/submit`, () => {
      Object.assign(task, { status: 'InReview', reviewerId: REVIEWER });
      return toListItem(db, task);
    });
    const { user } = renderTask(task.id);

    await screen.findByRole('button', { name: /resubmit for review/i });

    // Reject the screenshot finding, with a reason.
    await user.click(screen.getAllByRole('button', { name: /^reject$/i })[0]!);
    await user.type(
      screen.getByLabelText(/why are you rejecting/i),
      'The view is generated at deploy time.',
    );
    await user.click(screen.getByRole('button', { name: /save rejection/i }));

    // Resolve the written findings.
    await waitFor(() => {
      expect(db.issueResponses.filter((r) => r.taskId === task.id)).toHaveLength(1);
      expect(screen.getAllByRole('button', { name: /^resolve$/i })[1]).toBeEnabled();
    });
    await user.click(screen.getAllByRole('button', { name: /^resolve$/i })[1]!);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /resubmit for review/i })).toBeEnabled();
    });

    await user.click(screen.getByRole('button', { name: /resubmit for review/i }));

    // Resubmitted. Routing it back to the reviewer who asked for changes (and
    // notifying them) is NestJS's rule, tested in apps/api.
    await waitFor(() => {
      expect(apiStub.requests('POST', `/tasks/${task.id}/submit`)).toHaveLength(1);
    });

    const stored = db.issueResponses.find((r) => r.screenshotId === 'shot-1');
    expect(stored?.kind).toBe('Rejected');
    expect(stored?.rejectionReason).toBe('The view is generated at deploy time.');
    // The reviewer rules on the rejection next cycle (FL 2.11.2.3-02).
    expect(stored?.verdict).toBe('Pending');
  });

  /**
   * One control, one rule.
   *
   * `canSubmitForReview` is true on BOTH submit edges — Draft → Submitted and
   * ChangesRequested → ReSubmitted — so a header Submit gated only on checklist
   * completeness let a developer resubmit a returned task without answering a
   * single finding. The server refused with 422 `RESPONSES_INCOMPLETE` (the test
   * below), so nothing was corrupted, but the developer was handed an error they
   * had no way to anticipate while a correctly-disabled Resubmit sat further
   * down the same page.
   *
   * Spec 2.11.2.2 makes "all feedback items addressed" the activation condition,
   * and `ReviewFeedbackPanel` already enforces exactly that. The header control
   * steps aside once a task has been returned.
   */
  it('offers no header Submit on a returned task, only the gated Resubmit', async () => {
    const task = seedFeedback();
    renderTask(task.id);

    // The panel's own control is present and blocked — so the page is fully
    // rendered and the absence below is a real absence, not a slow mount.
    expect(await screen.findByRole('button', { name: /resubmit for review/i })).toBeDisabled();

    expect(screen.queryByRole('button', { name: HEADER_SUBMIT })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /continue editing/i })).not.toBeInTheDocument();
  });

  /**
   * The negative control for the test above.
   *
   * Without it, `queryByRole('button', { name: /submit for review/i })` returning
   * null proves nothing — a renamed label or a page that failed to render would
   * satisfy it just as well. A Draft task must still offer the header Submit.
   */
  it('still offers the header Submit on a draft', async () => {
    // The same row the seeder above reshapes, left as a Draft instead. Same task,
    // same checklist, one field different — so the only thing the two tests can
    // disagree about is the status.
    const draft = developerTask();
    draft.status = 'Draft';
    draft.reviewerId = null;

    renderTask(draft.id);

    expect(await screen.findByRole('button', { name: HEADER_SUBMIT })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /resubmit for review/i })).not.toBeInTheDocument();
  });

  it('Scenario 1: RESOLVED -> click Reject -> Cancel -> returns to RESOLVED unchanged', async () => {
    const task = seedFeedback();
    const { user } = renderTask(task.id);

    await screen.findByRole('button', { name: /resubmit for review/i });

    // 1. Mark first finding as Resolved
    await user.click(screen.getAllByRole('button', { name: /^resolve$/i })[0]!);
    await waitFor(() => {
      expect(screen.getByText('Resolved')).toBeInTheDocument();
      expect(db.issueResponses.find((r) => r.screenshotId === 'shot-1')?.kind).toBe('Resolved');
      expect(screen.getAllByRole('button', { name: /^reject$/i })[0]).toBeEnabled();
    });

    // 2. Click Reject on the resolved finding -> enters local REJECTING draft
    await user.click(screen.getAllByRole('button', { name: /^reject$/i })[0]!);

    // Rejection form is visible with Cancel and Save rejection
    expect(screen.getByLabelText(/why are you rejecting/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save rejection/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^cancel$/i })).toBeInTheDocument();

    // Persisted state in db is STILL Resolved (not mutated by opening draft)
    expect(db.issueResponses.find((r) => r.screenshotId === 'shot-1')?.kind).toBe('Resolved');

    // 3. Click Cancel -> discards local draft, cleanly restores RESOLVED
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));

    // Editor is gone
    expect(screen.queryByLabelText(/why are you rejecting/i)).not.toBeInTheDocument();
    // Badge and persisted state remain Resolved
    expect(screen.getByText('Resolved')).toBeInTheDocument();
    expect(db.issueResponses.find((r) => r.screenshotId === 'shot-1')?.kind).toBe('Resolved');
  });

  it('Scenario 2: REJECTED ("reason A") -> Change response -> edit locally -> Cancel -> returns to REJECTED with "reason A" unchanged', async () => {
    const task = seedFeedback();
    const { user } = renderTask(task.id);

    await screen.findByRole('button', { name: /resubmit for review/i });

    // 1. Reject first finding with "reason A"
    await user.click(screen.getAllByRole('button', { name: /^reject$/i })[0]!);
    await user.type(screen.getByLabelText(/why are you rejecting/i), 'reason A');
    await user.click(screen.getByRole('button', { name: /save rejection/i }));

    // Collapsed summary displays "reason A"
    await waitFor(() => {
      expect(screen.getByText('reason A')).toBeInTheDocument();
      expect(screen.getByText('Developer Response')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /save rejection/i })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /change response/i })).toBeEnabled();
    });
    expect(db.issueResponses.find((r) => r.screenshotId === 'shot-1')?.rejectionReason).toBe(
      'reason A',
    );

    // 2. Click "Change response" -> opens editor prefilled with "reason A"
    await user.click(screen.getByRole('button', { name: /change response/i }));
    const textarea = screen.getByLabelText(/why are you rejecting/i);
    expect(textarea).toHaveValue('reason A');

    // 3. Edit text locally to "reason B"
    await user.clear(textarea);
    await user.type(textarea, 'reason B');
    expect(textarea).toHaveValue('reason B');

    // DB remains "reason A"
    expect(db.issueResponses.find((r) => r.screenshotId === 'shot-1')?.rejectionReason).toBe(
      'reason A',
    );

    // 4. Click Cancel -> restores collapsed card with original "reason A"
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(screen.queryByLabelText(/why are you rejecting/i)).not.toBeInTheDocument();
    expect(screen.getByText('reason A')).toBeInTheDocument();
    expect(screen.queryByText('reason B')).not.toBeInTheDocument();
    expect(db.issueResponses.find((r) => r.screenshotId === 'shot-1')?.rejectionReason).toBe(
      'reason A',
    );
  });

  it('allows deselecting Resolve to return finding to Pending Response', async () => {
    const task = seedFeedback();
    const { user } = renderTask(task.id);

    await screen.findByRole('button', { name: /resubmit for review/i });

    // Resolve first finding
    await user.click(screen.getAllByRole('button', { name: /^resolve$/i })[0]!);
    await waitFor(() => {
      expect(screen.getByText('Resolved')).toBeInTheDocument();
      expect(db.issueResponses.filter((r) => r.taskId === task.id)).toHaveLength(1);
      expect(screen.getAllByRole('button', { name: /^resolve$/i })[0]).toBeEnabled();
    });

    // Click Resolve again to deselect
    await user.click(screen.getAllByRole('button', { name: /^resolve$/i })[0]!);

    // Reverts to Pending Response and removes from DB
    await waitFor(() => {
      expect(screen.getAllByText(/pending response/i).length).toBeGreaterThanOrEqual(1);
      expect(db.issueResponses.filter((r) => r.taskId === task.id)).toHaveLength(0);
    });
  });

  it('allows removing a saved rejection to return finding to Pending Response', async () => {
    const task = seedFeedback();
    const { user } = renderTask(task.id);

    await screen.findByRole('button', { name: /resubmit for review/i });

    // Save a rejection
    await user.click(screen.getAllByRole('button', { name: /^reject$/i })[0]!);
    await user.type(screen.getByLabelText(/why are you rejecting/i), 'Temporary rejection');
    await user.click(screen.getByRole('button', { name: /save rejection/i }));

    await waitFor(() => {
      expect(screen.getByText('Temporary rejection')).toBeInTheDocument();
      expect(db.issueResponses.filter((r) => r.taskId === task.id)).toHaveLength(1);
      expect(screen.getByRole('button', { name: /remove response/i })).toBeEnabled();
    });

    // Click Remove response
    await user.click(screen.getByRole('button', { name: /remove response/i }));

    // Reverts to Pending Response and deletes record from DB
    await waitFor(() => {
      expect(screen.queryByText('Temporary rejection')).not.toBeInTheDocument();
      expect(screen.getAllByText(/pending response/i).length).toBeGreaterThanOrEqual(1);
      expect(db.issueResponses.filter((r) => r.taskId === task.id)).toHaveLength(0);
    });
  });

  it('blocks resubmission while a rejection draft is active even if all other issues are addressed', async () => {
    const task = seedFeedback();
    const { user } = renderTask(task.id);

    const resubmit = await screen.findByRole('button', { name: /resubmit for review/i });

    // Resolve both issues
    await user.click(screen.getAllByRole('button', { name: /^resolve$/i })[0]!);
    await waitFor(() => {
      expect(db.issueResponses.filter((r) => r.taskId === task.id)).toHaveLength(1);
      expect(screen.getAllByRole('button', { name: /^resolve$/i })[1]).toBeEnabled();
    });
    await user.click(screen.getAllByRole('button', { name: /^resolve$/i })[1]!);

    await waitFor(() => {
      expect(resubmit).toBeEnabled();
      expect(screen.getAllByRole('button', { name: /^reject$/i })[0]).toBeEnabled();
    });

    // Now start drafting a rejection on issue 1
    await user.click(screen.getAllByRole('button', { name: /^reject$/i })[0]!);

    // Resubmit must immediately be blocked due to unsaved draft
    expect(resubmit).toBeDisabled();
    expect(screen.getByText(/you have an unsaved rejection draft/i)).toBeInTheDocument();

    // Cancel draft -> resubmit is enabled again
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(resubmit).toBeEnabled();
  });
});
