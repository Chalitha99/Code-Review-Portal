import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { Toaster } from 'sonner';
import { signInForTest } from '@tests/support/setup.ts';
import { routes } from '@/app/routes.tsx';
import { apiStub } from '@tests/support/apiStub.ts';
import { buildDataset, type Dataset } from '@tests/support/fixtures/dataset.ts';
import {
  serveResponseWrites,
  serveReviewDecisions,
  serveReviewDraftWrites,
  serveReviewerWorkspace,
} from '@tests/support/serveReview.ts';

/**
 * Re-review adjudication, on the reviewer's and the developer's screens.
 *
 * Verdicts are recorded as sent (`serveResponseWrites`); whether a decision is
 * allowed, and how the counted cycle moves, are NestJS rules (apps/api
 * reviews.service.spec, "counted-cycle decision matrix") — this suite checks
 * the screens gate, send and render correctly.
 */
let db: Dataset;
const decisions = () => apiStub.requests('POST', '/tasks/:taskId/review');
import { settleRequests } from '@tests/support/settleRequests.ts';

const REVIEWER = 'u-pinsara';
const DEVELOPER = 'u-hiruni';

function renderApp(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(routes, { initialEntries: [path] });

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

async function expandSection(name: RegExp) {
  const trigger = await screen.findByRole('button', { name });
  if (trigger.getAttribute('aria-expanded') === 'false') await userEvent.click(trigger);
}

// A debounced autosave must not land after the test and leak into the next one.
afterEach(settleRequests);

describe('Re-Review Adjudication Workflow QA Suite', () => {
  beforeEach(() => {
    db = buildDataset();
    signInForTest(REVIEWER);
    serveReviewerWorkspace(db);
    serveReviewDraftWrites(db);
    serveReviewDecisions(db);
    serveResponseWrites(db);
  });

  it('1. Resolved -> Verify Resolved: Reviewer verifies developer fix, updates verdict to Accepted', async () => {
    const task = db.tasks.find((t) => t.developerId === DEVELOPER)!;
    task.status = 'InReview';
    task.reviewerId = REVIEWER;
    task.reviewRound = 2;
    task.countedCycle = 2;
    task.adjustedCycles = [];

    // Seed previous review
    db.reviews = db.reviews.filter((r) => r.taskId !== task.id);
    db.reviews.push({
      id: `rev-${task.id}-1`,
      taskId: task.id,
      reviewRound: 1,
      reviewerId: REVIEWER,
      reviewerName: 'Pinsara Chandika',
      comments: [
        {
          id: 'comm-res-1',
          reviewRound: 1,
          text: 'Fix typo in login header.',
          screenshots: [],
          createdAt: new Date().toISOString(),
          reviewerId: REVIEWER,
        },
      ],
      generalCheck: [],
      findings: { incorrectCode: '', incompleteImplementation: '', sourceFormatting: '' },
      otherRemarks: '',
      feedbackSummary: '',
      rank: 2,
      screenshots: [],
      decision: 'ChangesRequested',
      decidedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Developer resolved this finding
    db.issueResponses = db.issueResponses.filter((r) => r.taskId !== task.id);
    db.issueResponses.push({
      id: `resp-${task.id}-1-comm-res-1`,
      taskId: task.id,
      reviewRound: 1,
      commentId: 'comm-res-1',
      screenshotId: null,
      kind: 'Resolved',
      rejectionReason: null,
      verdict: 'Pending',
      respondedAt: new Date().toISOString(),
    });

    renderApp(`/crp/reviewer/tasks/${task.id}`);

    // Verify Re-review section renders
    await screen.findByRole('heading', { name: /Developer Response.*Rejection Review/i });
    expect(screen.getAllByText(/Developer: Resolved/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Pending Verification/i)).toBeInTheDocument();

    // Verify Action Buttons for Resolved finding
    const verifyResolvedBtn = screen.getByRole('button', { name: /Verify Resolved/i });
    const notResolvedBtn = screen.getByRole('button', { name: /Not Resolved/i });
    expect(verifyResolvedBtn).toBeInTheDocument();
    expect(notResolvedBtn).toBeInTheDocument();

    // Reviewer clicks Verify Resolved
    await userEvent.click(verifyResolvedBtn);

    // Assert database verdict is updated to Accepted
    await waitFor(() => {
      const resp = db.issueResponses.find((r) => r.commentId === 'comm-res-1');
      expect(resp?.verdict).toBe('Accepted');
    });

    // Badge updates to Resolution Verified
    expect((await screen.findAllByText(/Resolution Verified/i)).length).toBeGreaterThanOrEqual(1);

    // Now Rank 1 should be selectable and Approve Task enabled
    await userEvent.click(screen.getByRole('radio', { name: /Rank 1/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Approve Task/i })).toBeEnabled();
    });
  });

  it('2. Resolved -> Not Resolved: Requires mandatory explanation, blocks Rank 1 / Approve', async () => {
    const task = db.tasks.find((t) => t.developerId === DEVELOPER)!;
    task.status = 'InReview';
    task.reviewerId = REVIEWER;
    task.reviewRound = 2;
    task.countedCycle = 2;
    task.adjustedCycles = [];

    db.reviews = db.reviews.filter((r) => r.taskId !== task.id);
    db.reviews.push({
      id: `rev-${task.id}-1`,
      taskId: task.id,
      reviewRound: 1,
      reviewerId: REVIEWER,
      reviewerName: 'Pinsara Chandika',
      comments: [
        {
          id: 'comm-res-fail',
          reviewRound: 1,
          text: 'Handle null pointer on empty input array.',
          screenshots: [],
          createdAt: new Date().toISOString(),
          reviewerId: REVIEWER,
        },
      ],
      generalCheck: [],
      findings: { incorrectCode: '', incompleteImplementation: '', sourceFormatting: '' },
      otherRemarks: '',
      feedbackSummary: '',
      rank: 2,
      screenshots: [],
      decision: 'ChangesRequested',
      decidedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    db.issueResponses = db.issueResponses.filter((r) => r.taskId !== task.id);
    db.issueResponses.push({
      id: `resp-${task.id}-1-comm-res-fail`,
      taskId: task.id,
      reviewRound: 1,
      commentId: 'comm-res-fail',
      screenshotId: null,
      kind: 'Resolved',
      rejectionReason: null,
      verdict: 'Pending',
      respondedAt: new Date().toISOString(),
    });

    renderApp(`/crp/reviewer/tasks/${task.id}`);

    await screen.findByRole('heading', { name: /Developer Response.*Rejection Review/i });

    // Reviewer clicks Not Resolved
    const notResolvedBtn = screen.getByRole('button', { name: /Not Resolved/i });
    await userEvent.click(notResolvedBtn);

    // Inline textarea appears
    const textarea = screen.getByLabelText(/Reviewer follow-up explanation/i);
    expect(textarea).toBeInTheDocument();

    // Attempting to save without explanation is blocked
    const saveVerdictBtn = screen.getByRole('button', { name: /Save Verdict/i });
    await userEvent.click(saveVerdictBtn);
    expect(
      screen.getByText(/An explanation is required when not accepting or not resolving a finding/i),
    ).toBeInTheDocument();

    // Enter explanation and save
    await userEvent.type(textarea, 'Fix still crashes when input array contains null elements.');
    await userEvent.click(saveVerdictBtn);

    // Assert database is updated to Overruled with reviewerComment
    await waitFor(() => {
      const resp = db.issueResponses.find((r) => r.commentId === 'comm-res-fail');
      expect(resp?.verdict).toBe('Overruled');
      expect(resp?.reviewerComment).toBe(
        'Fix still crashes when input array contains null elements.',
      );
    });

    // Badge updates to Not Resolved (the verdict also shows in the round history)
    expect((await screen.findAllByText(/Not Resolved/i)).length).toBeGreaterThanOrEqual(1);

    // Rank 1 is disabled because unresolved findings remain
    const rank1Card = screen.getByRole('radio', { name: /Rank 1/i });
    expect(rank1Card).toBeDisabled();

    // Approve Task button is disabled
    const approveBtn = screen.getByRole('button', { name: /Approve Task/i });
    expect(approveBtn).toBeDisabled();
  });

  it('3. Rejected -> Accept Rejection: Reviewer accepts developer rejection, updates verdict to Accepted', async () => {
    const task = db.tasks.find((t) => t.developerId === DEVELOPER)!;
    task.status = 'InReview';
    task.reviewerId = REVIEWER;
    task.reviewRound = 2;
    task.countedCycle = 2;
    task.adjustedCycles = [];

    db.reviews = db.reviews.filter((r) => r.taskId !== task.id);
    db.reviews.push({
      id: `rev-${task.id}-1`,
      taskId: task.id,
      reviewRound: 1,
      reviewerId: REVIEWER,
      reviewerName: 'Pinsara Chandika',
      comments: [
        {
          id: 'comm-rej-1',
          reviewRound: 1,
          text: 'Add border to table container.',
          screenshots: [],
          createdAt: new Date().toISOString(),
          reviewerId: REVIEWER,
        },
      ],
      generalCheck: [],
      findings: { incorrectCode: '', incompleteImplementation: '', sourceFormatting: '' },
      otherRemarks: '',
      feedbackSummary: '',
      rank: 2,
      screenshots: [],
      decision: 'ChangesRequested',
      decidedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    db.issueResponses = db.issueResponses.filter((r) => r.taskId !== task.id);
    db.issueResponses.push({
      id: `resp-${task.id}-1-comm-rej-1`,
      taskId: task.id,
      reviewRound: 1,
      commentId: 'comm-rej-1',
      screenshotId: null,
      kind: 'Rejected',
      rejectionReason: 'Border is omitted intentionally per Figma specification §4.2.',
      verdict: 'Pending',
      respondedAt: new Date().toISOString(),
    });

    renderApp(`/crp/reviewer/tasks/${task.id}`);

    await screen.findByRole('heading', { name: /Developer Response.*Rejection Review/i });
    expect(screen.getAllByText(/Developer: Rejected/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Pending Adjudication/i).length).toBeGreaterThanOrEqual(1);

    // Reviewer clicks Accept Rejection
    const acceptRejectionBtn = screen.getByRole('button', { name: /Accept Rejection/i });
    await userEvent.click(acceptRejectionBtn);

    // Assert database is updated to Accepted
    await waitFor(() => {
      const resp = db.issueResponses.find((r) => r.commentId === 'comm-rej-1');
      expect(resp?.verdict).toBe('Accepted');
    });

    // Badge updates to Rejection Accepted
    expect((await screen.findAllByText(/Rejection Accepted/i)).length).toBeGreaterThanOrEqual(1);

    // All rejections accepted banner is shown
    expect(
      screen.getByText(/All rejections accepted\. Zero developer corrections were required/i),
    ).toBeInTheDocument();
  });

  it('4. Rejected -> Do Not Accept: Requires mandatory explanation, blocks Rank 1 / Approve', async () => {
    const task = db.tasks.find((t) => t.developerId === DEVELOPER)!;
    task.status = 'InReview';
    task.reviewerId = REVIEWER;
    task.reviewRound = 2;
    task.countedCycle = 2;
    task.adjustedCycles = [];

    db.reviews = db.reviews.filter((r) => r.taskId !== task.id);
    db.reviews.push({
      id: `rev-${task.id}-1`,
      taskId: task.id,
      reviewRound: 1,
      reviewerId: REVIEWER,
      reviewerName: 'Pinsara Chandika',
      comments: [
        {
          id: 'comm-rej-deny',
          reviewRound: 1,
          text: 'Rate limit endpoint to 10 req/sec.',
          screenshots: [],
          createdAt: new Date().toISOString(),
          reviewerId: REVIEWER,
        },
      ],
      generalCheck: [],
      findings: { incorrectCode: '', incompleteImplementation: '', sourceFormatting: '' },
      otherRemarks: '',
      feedbackSummary: '',
      rank: 2,
      screenshots: [],
      decision: 'ChangesRequested',
      decidedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    db.issueResponses = db.issueResponses.filter((r) => r.taskId !== task.id);
    db.issueResponses.push({
      id: `resp-${task.id}-1-comm-rej-deny`,
      taskId: task.id,
      reviewRound: 1,
      commentId: 'comm-rej-deny',
      screenshotId: null,
      kind: 'Rejected',
      rejectionReason: 'Gateway already handles rate limiting.',
      verdict: 'Pending',
      respondedAt: new Date().toISOString(),
    });

    renderApp(`/crp/reviewer/tasks/${task.id}`);

    await screen.findByRole('heading', { name: /Developer Response.*Rejection Review/i });

    // Reviewer clicks Do Not Accept
    const doNotAcceptBtn = screen.getByRole('button', { name: /Do Not Accept/i });
    await userEvent.click(doNotAcceptBtn);

    // Textarea appears
    const textarea = screen.getByLabelText(/Reviewer follow-up explanation/i);
    expect(textarea).toBeInTheDocument();

    // Empty validation check
    const saveVerdictBtn = screen.getByRole('button', { name: /Save Verdict/i });
    await userEvent.click(saveVerdictBtn);
    expect(
      screen.getByText(/An explanation is required when not accepting or not resolving a finding/i),
    ).toBeInTheDocument();

    // Type explanation and save
    await userEvent.type(
      textarea,
      'Gateway rate limit is per IP; application-level rate limit per API key is also mandatory.',
    );
    await userEvent.click(saveVerdictBtn);

    // Assert database is updated to Overruled with explanation
    await waitFor(() => {
      const resp = db.issueResponses.find((r) => r.commentId === 'comm-rej-deny');
      expect(resp?.verdict).toBe('Overruled');
      expect(resp?.reviewerComment).toBe(
        'Gateway rate limit is per IP; application-level rate limit per API key is also mandatory.',
      );
    });

    // Badge updates to Rejection Not Accepted
    expect((await screen.findAllByText(/Rejection Not Accepted/i)).length).toBeGreaterThanOrEqual(
      1,
    );

    // Rank 1 is disabled
    expect(screen.getByRole('radio', { name: /Rank 1/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Approve Task/i })).toBeDisabled();
  });

  it('5. Pending Adjudication blocks both final review decisions (Approve and Request Changes)', async () => {
    const task = db.tasks.find((t) => t.developerId === DEVELOPER)!;
    task.status = 'InReview';
    task.reviewerId = REVIEWER;
    task.reviewRound = 2;
    task.countedCycle = 2;
    task.adjustedCycles = [];

    db.reviews = db.reviews.filter((r) => r.taskId !== task.id);
    db.reviews.push({
      id: `rev-${task.id}-1`,
      taskId: task.id,
      reviewRound: 1,
      reviewerId: REVIEWER,
      reviewerName: 'Pinsara Chandika',
      comments: [
        {
          id: 'comm-pending',
          reviewRound: 1,
          text: 'Add error boundary.',
          screenshots: [],
          createdAt: new Date().toISOString(),
          reviewerId: REVIEWER,
        },
      ],
      generalCheck: [],
      findings: { incorrectCode: '', incompleteImplementation: '', sourceFormatting: '' },
      otherRemarks: '',
      feedbackSummary: '',
      rank: 2,
      screenshots: [],
      decision: 'ChangesRequested',
      decidedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Response is still Pending
    db.issueResponses = db.issueResponses.filter((r) => r.taskId !== task.id);
    db.issueResponses.push({
      id: `resp-${task.id}-1-comm-pending`,
      taskId: task.id,
      reviewRound: 1,
      commentId: 'comm-pending',
      screenshotId: null,
      kind: 'Resolved',
      rejectionReason: null,
      verdict: 'Pending',
      respondedAt: new Date().toISOString(),
    });

    renderApp(`/crp/reviewer/tasks/${task.id}`);

    await screen.findByRole('heading', { name: /Developer Response.*Rejection Review/i });

    // Both decision buttons are disabled while pending adjudication
    expect(screen.getByRole('button', { name: /Approve Task/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Request Changes/i })).toBeDisabled();

    // Selecting Rank 2 also cannot submit Request Changes while adjudication is incomplete
    await userEvent.click(screen.getByRole('radio', { name: /Rank 2/i }));
    const addCommentBtn = screen.getByRole('button', { name: /Add Comment/i });
    await userEvent.click(addCommentBtn);
    const commentInput = screen.getByPlaceholderText(/Describe the actionable issue/i);
    await userEvent.type(commentInput, 'Additional check required.');

    // Request Changes remains disabled because adjudication is pending!
    expect(screen.getByRole('button', { name: /Request Changes/i })).toBeDisabled();
  });

  it('6. Negative adjudication + Request Changes preserves the full chain for the developer', async () => {
    const task = db.tasks.find((t) => t.developerId === DEVELOPER)!;
    task.status = 'ChangesRequested';
    task.reviewerId = null;
    task.reviewRound = 2;
    task.countedCycle = 2;

    // Review history with previous cycle comments
    db.reviews = db.reviews.filter((r) => r.taskId !== task.id);
    db.reviews.push({
      id: `rev-${task.id}-1`,
      taskId: task.id,
      reviewRound: 1,
      reviewerId: REVIEWER,
      reviewerName: 'Pinsara Chandika',
      comments: [
        {
          id: 'comm-chain-1',
          reviewRound: 1,
          text: 'Original reviewer finding: SQL parameter binding missing.',
          screenshots: [],
          createdAt: '2026-09-10T10:00:00.000Z',
          reviewerId: REVIEWER,
        },
      ],
      generalCheck: [],
      findings: { incorrectCode: '', incompleteImplementation: '', sourceFormatting: '' },
      otherRemarks: '',
      feedbackSummary: '',
      rank: 2,
      screenshots: [],
      decision: 'ChangesRequested',
      decidedAt: '2026-09-10T12:00:00.000Z',
      createdAt: '2026-09-10T10:00:00.000Z',
      updatedAt: '2026-09-10T12:00:00.000Z',
    });

    // Developer responded Resolved, Reviewer marked Not Resolved with follow-up explanation
    db.issueResponses = db.issueResponses.filter((r) => r.taskId !== task.id);
    db.issueResponses.push({
      id: `resp-${task.id}-1-comm-chain-1`,
      taskId: task.id,
      reviewRound: 1,
      commentId: 'comm-chain-1',
      screenshotId: null,
      kind: 'Resolved',
      rejectionReason: null,
      verdict: 'Overruled',
      reviewerComment:
        'Raw concatenation is still present in the search subquery; use query builder.',
      respondedAt: '2026-09-11T14:00:00.000Z',
      adjudicatedAt: '2026-09-12T09:00:00.000Z',
    });

    // Developer views their task
    signInForTest(DEVELOPER);
    renderApp(`/crp/developer/tasks/${task.id}`);

    // Verify complete chain visible to developer:
    // 1. Original reviewer finding
    expect(
      (await screen.findAllByText(/Original reviewer finding: SQL parameter binding missing/i))
        .length,
    ).toBeGreaterThanOrEqual(1);
    // 2. Developer response badge
    expect(screen.getAllByText(/Developer: Resolved/i).length).toBeGreaterThanOrEqual(1);
    // 3. Reviewer verdict badge
    expect(screen.getByText(/Reviewer: Not Resolved/i)).toBeInTheDocument();
    // 4. Reviewer follow-up explanation
    expect(
      screen.getAllByText(
        /Raw concatenation is still present in the search subquery; use query builder/i,
      ).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('7. ReviewRoundHistory renders Pending as "Pending Adjudication", never "Verdict: Not Accepted"', async () => {
    const task = db.tasks.find((t) => t.developerId === DEVELOPER)!;
    task.status = 'InReview';
    task.reviewerId = REVIEWER;
    task.reviewRound = 2;
    task.countedCycle = 2;

    db.reviews = db.reviews.filter((r) => r.taskId !== task.id);
    db.reviews.push({
      id: `rev-${task.id}-1`,
      taskId: task.id,
      reviewRound: 1,
      reviewerId: REVIEWER,
      reviewerName: 'Pinsara Chandika',
      comments: [
        {
          id: 'comm-pending-history',
          reviewRound: 1,
          text: 'Check memory leak in event listener.',
          screenshots: [],
          createdAt: new Date().toISOString(),
          reviewerId: REVIEWER,
        },
      ],
      generalCheck: [],
      findings: { incorrectCode: '', incompleteImplementation: '', sourceFormatting: '' },
      otherRemarks: '',
      feedbackSummary: '',
      rank: 2,
      screenshots: [],
      decision: 'ChangesRequested',
      decidedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    db.issueResponses = db.issueResponses.filter((r) => r.taskId !== task.id);
    db.issueResponses.push({
      id: `resp-${task.id}-1-pending-history`,
      taskId: task.id,
      reviewRound: 1,
      commentId: 'comm-pending-history',
      screenshotId: null,
      kind: 'Rejected',
      rejectionReason: 'Cleanup is handled by useLayoutEffect.',
      verdict: 'Pending',
      respondedAt: new Date().toISOString(),
    });

    renderApp(`/crp/reviewer/tasks/${task.id}`);

    // Wait for history section
    await screen.findByRole('heading', { name: /Review (Round|Cycle) History/i });
    await expandSection(/Review (Round|Cycle) History/i);

    // Verify it renders "Verdict: Pending Adjudication"
    expect(await screen.findByText(/Verdict: Pending Adjudication/i)).toBeInTheDocument();

    // Verify it strictly NEVER renders "Verdict: Not Accepted"
    expect(screen.queryByText(/Verdict: Not Accepted/i)).toBeNull();
  });

  it('8. Fixture integrity: all 10 QA tasks have valid status/cycle/response combinations', () => {
    const qaTasks = db.tasks.filter((t) => t.taskCode.startsWith('QA-ADJ-'));
    expect(qaTasks.length).toBe(10);

    for (const t of qaTasks) {
      expect(t.reviewRound).toBeGreaterThanOrEqual(1);
      expect(t.countedCycle).toBeGreaterThanOrEqual(1);

      const responses = db.issueResponses.filter((r) => r.taskId === t.id);
      for (const resp of responses) {
        if (resp.verdict === 'Overruled') {
          expect(resp.reviewerComment).toBeTruthy();
          expect(resp.reviewerComment?.trim().length).toBeGreaterThan(0);
        }
        if (resp.kind === 'Rejected') {
          expect(resp.rejectionReason).toBeTruthy();
          expect(resp.rejectionReason?.trim().length).toBeGreaterThan(0);
        }
      }

      // No active review has decremented cycles prematurely
      if (t.status === 'InReview' || t.status === 'ReSubmitted') {
        expect(t.adjustedCycles?.length ?? 0).toBe(0);
      }
    }
  });

  it('9. QA-ADJ-CYCLE-DECREMENT: All rejections accepted -> Approval decrements counted cycle by 1', async () => {
    const task = db.tasks.find((t) => t.taskCode === 'QA-ADJ-CYCLE-DECREMENT')!;
    expect(task.reviewRound).toBe(2);
    expect(task.countedCycle).toBe(2);
    expect(task.adjustedCycles?.length ?? 0).toBe(0);

    renderApp(`/crp/reviewer/tasks/${task.id}`);

    // Wait for review form to load
    await screen.findByRole('heading', { name: /Developer Response.*Rejection Review/i });

    // Verify all 3 rejections are accepted banner is shown
    expect(
      await screen.findByText(
        /All rejections accepted\. Zero developer corrections were required/i,
      ),
    ).toBeInTheDocument();

    // Wait for Rank 1 to be enabled
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: /Rank 1/i })).not.toBeDisabled();
    });

    // Select Rank 1
    await userEvent.click(screen.getByRole('radio', { name: /Rank 1/i }));

    // Approve task
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Approve Task/i })).toBeEnabled();
    });
    await userEvent.click(screen.getByRole('button', { name: /Approve Task/i }));

    // Confirm dialog
    await screen.findByRole('dialog');
    const confirmBtn = screen.getByRole('button', { name: /Approve Task/i });
    await userEvent.click(confirmBtn);

    // The approval is sent once, as Rank 1. NestJS then lowers the counted
    // cycle because every rejection was accepted (apps/api counted-cycle matrix).
    await waitFor(() => {
      expect(decisions()).toHaveLength(1);
    });
    expect(decisions()[0]?.body).toMatchObject({ decision: 'Approved', draft: { rank: 1 } });

    // The historical Round 1 record is untouched by the new decision.
    const histRev = db.reviews.find((r) => r.taskId === task.id && r.reviewRound === 1);
    expect(histRev?.decision).toBe('ChangesRequested');
  });

  it('10. QA-ADJ-ALL-ACCEPTED-MIXED: Resolved + Rejected accepted -> Approval preserves counted cycle (no decrement)', async () => {
    const task = db.tasks.find((t) => t.taskCode === 'QA-ADJ-ALL-ACCEPTED-MIXED')!;
    expect(task.reviewRound).toBe(2);
    expect(task.countedCycle).toBe(2);

    renderApp(`/crp/reviewer/tasks/${task.id}`);

    await screen.findByRole('heading', { name: /Developer Response.*Rejection Review/i });

    // Wait for Rank 1 to be enabled
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: /Rank 1/i })).not.toBeDisabled();
    });

    // Select Rank 1
    await userEvent.click(screen.getByRole('radio', { name: /Rank 1/i }));

    // Approve task
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Approve Task/i })).toBeEnabled();
    });
    await userEvent.click(screen.getByRole('button', { name: /Approve Task/i }));

    // Confirm dialog
    await screen.findByRole('dialog');
    await userEvent.click(screen.getByRole('button', { name: /Approve Task/i }));

    // Approved as Rank 1. That the counted cycle is NOT lowered here (real
    // developer fixes existed) is NestJS's rule, tested in apps/api.
    await waitFor(() => {
      expect(decisions()).toHaveLength(1);
    });
    expect(decisions()[0]?.body).toMatchObject({ decision: 'Approved', draft: { rank: 1 } });
  });

  it('11. QA-ADJ-FOLLOWUP-DEVELOPER: Developer sees full 4-stage chain on ChangesRequested', async () => {
    const task = db.tasks.find((t) => t.taskCode === 'QA-ADJ-FOLLOWUP-DEVELOPER')!;
    expect(task.status).toBe('ChangesRequested');

    // Sign in as developer
    signInForTest(task.developerId);
    renderApp(`/crp/developer/tasks/${task.id}`);

    // Wait for task page
    await screen.findByRole('heading', { name: /^Review Feedback$/i });

    // 1. Original reviewer finding
    expect(
      (
        await screen.findAllByText(
          /Add timeout retry handling when publishing events to the message broker/i,
        )
      ).length,
    ).toBeGreaterThanOrEqual(1);

    // 2. Developer response
    expect(screen.getAllByText(/Developer: Resolved/i).length).toBeGreaterThanOrEqual(1);

    // 3. Reviewer verdict
    expect(screen.getByText(/Reviewer: Not Resolved/i)).toBeInTheDocument();

    // 4. Reviewer follow-up explanation
    expect(
      screen.getAllByText(/The retry path still fails when the database connection times out/i)
        .length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('12. QA-ADJ-HISTORY: Multi-cycle task renders correct verdicts and explanations in history', async () => {
    const task = db.tasks.find((t) => t.taskCode === 'QA-ADJ-HISTORY')!;
    expect(task.reviewRound).toBe(3);

    renderApp(`/crp/reviewer/tasks/${task.id}`);

    await screen.findByRole('heading', { name: /Review (Round|Cycle) History/i });
    await expandSection(/Review (Round|Cycle) History/i);

    // Expand Round 1
    const round1Btn = screen.getByRole('button', { name: /Round 1/i });
    await userEvent.click(round1Btn);

    // Round 1 Rejection Accepted
    expect(
      (await screen.findAllByText(/Verdict: Rejection Accepted/i)).length,
    ).toBeGreaterThanOrEqual(1);

    // Round 2 Not Resolved + Follow-up explanation
    expect((await screen.findAllByText(/Verdict: Not Resolved/i)).length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText(/Cache eviction is called only on insert, not on update/i).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('13. Positive verdict toggle: Verify Resolved and Accept Rejection select and deselect back to Pending', async () => {
    const task = db.tasks.find((t) => t.developerId === DEVELOPER)!;
    task.status = 'InReview';
    task.reviewerId = REVIEWER;
    task.reviewRound = 2;
    task.countedCycle = 2;
    task.adjustedCycles = [];

    db.reviews = db.reviews.filter((r) => r.taskId !== task.id);
    db.reviews.push({
      id: `rev-${task.id}-toggle`,
      taskId: task.id,
      reviewRound: 1,
      reviewerId: REVIEWER,
      reviewerName: 'Pinsara Chandika',
      comments: [
        {
          id: 'comm-tog-1',
          reviewRound: 1,
          text: 'Fix typo in login header.',
          screenshots: [],
          createdAt: new Date().toISOString(),
          reviewerId: REVIEWER,
        },
        {
          id: 'comm-tog-2',
          reviewRound: 1,
          text: 'Remove obsolete config parameter.',
          screenshots: [],
          createdAt: new Date().toISOString(),
          reviewerId: REVIEWER,
        },
      ],
      generalCheck: [],
      findings: { incorrectCode: '', incompleteImplementation: '', sourceFormatting: '' },
      otherRemarks: '',
      feedbackSummary: '',
      rank: 2,
      screenshots: [],
      decision: 'ChangesRequested',
      decidedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    db.issueResponses = db.issueResponses.filter((r) => r.taskId !== task.id);
    db.issueResponses.push(
      {
        id: `resp-${task.id}-tog-1`,
        taskId: task.id,
        reviewRound: 1,
        commentId: 'comm-tog-1',
        screenshotId: null,
        kind: 'Resolved',
        rejectionReason: null,
        verdict: 'Pending',
        respondedAt: new Date().toISOString(),
      },
      {
        id: `resp-${task.id}-tog-2`,
        taskId: task.id,
        reviewRound: 1,
        commentId: 'comm-tog-2',
        screenshotId: null,
        kind: 'Rejected',
        rejectionReason: 'Config parameter is required for legacy API gateway compatibility.',
        verdict: 'Pending',
        respondedAt: new Date().toISOString(),
      },
    );

    renderApp(`/crp/reviewer/tasks/${task.id}`);

    await screen.findByRole('heading', { name: /Developer Response.*Rejection Review/i });

    // Both are initially pending
    expect(screen.getAllByText(/Pending Verification/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Pending Adjudication/i).length).toBeGreaterThanOrEqual(1);

    const verifyBtn = screen.getByRole('button', { name: /Verify Resolved/i });
    const acceptBtn = screen.getByRole('button', { name: /Accept Rejection/i });

    // 1. Click Verify Resolved -> selects Accepted
    await userEvent.click(verifyBtn);
    await waitFor(() => {
      expect(screen.getAllByText(/Resolution Verified/i).length).toBeGreaterThanOrEqual(1);
      expect(db.issueResponses.find((r) => r.commentId === 'comm-tog-1')?.verdict).toBe('Accepted');
    });

    // 2. Click Verify Resolved again -> deselects back to Pending
    await userEvent.click(verifyBtn);
    await waitFor(() => {
      expect(screen.getAllByText(/Pending Verification/i).length).toBeGreaterThanOrEqual(1);
      expect(db.issueResponses.find((r) => r.commentId === 'comm-tog-1')?.verdict).toBe('Pending');
    });

    // 3. Click Accept Rejection -> selects Accepted
    await userEvent.click(acceptBtn);
    await waitFor(() => {
      expect(screen.getAllByText(/Rejection Accepted/i).length).toBeGreaterThanOrEqual(1);
      expect(db.issueResponses.find((r) => r.commentId === 'comm-tog-2')?.verdict).toBe('Accepted');
    });

    // 4. Click Accept Rejection again -> deselects back to Pending
    await userEvent.click(acceptBtn);
    await waitFor(() => {
      expect(screen.getAllByText(/Pending Adjudication/i).length).toBeGreaterThanOrEqual(1);
      expect(db.issueResponses.find((r) => r.commentId === 'comm-tog-2')?.verdict).toBe('Pending');
    });
  });

  it('14. Negative verdict workflow: mandatory explanation required, saves with comment', async () => {
    const task = db.tasks.find((t) => t.developerId === DEVELOPER)!;
    task.status = 'InReview';
    task.reviewerId = REVIEWER;
    task.reviewRound = 2;
    task.countedCycle = 2;

    db.reviews = db.reviews.filter((r) => r.taskId !== task.id);
    db.reviews.push({
      id: `rev-${task.id}-mand`,
      taskId: task.id,
      reviewRound: 1,
      reviewerId: REVIEWER,
      reviewerName: 'Pinsara Chandika',
      comments: [
        {
          id: 'comm-mand-1',
          reviewRound: 1,
          text: 'Handle null pointer on input array.',
          screenshots: [],
          createdAt: new Date().toISOString(),
          reviewerId: REVIEWER,
        },
      ],
      generalCheck: [],
      findings: { incorrectCode: '', incompleteImplementation: '', sourceFormatting: '' },
      otherRemarks: '',
      feedbackSummary: '',
      rank: 2,
      screenshots: [],
      decision: 'ChangesRequested',
      decidedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    db.issueResponses = db.issueResponses.filter((r) => r.taskId !== task.id);
    db.issueResponses.push({
      id: `resp-${task.id}-mand-1`,
      taskId: task.id,
      reviewRound: 1,
      commentId: 'comm-mand-1',
      screenshotId: null,
      kind: 'Resolved',
      rejectionReason: null,
      verdict: 'Pending',
      respondedAt: new Date().toISOString(),
    });

    renderApp(`/crp/reviewer/tasks/${task.id}`);

    await screen.findByRole('heading', { name: /Developer Response.*Rejection Review/i });

    // Click Not Resolved
    await userEvent.click(screen.getByRole('button', { name: /Not Resolved/i }));

    // Editor appears
    const textarea = screen.getByLabelText(/Reviewer follow-up explanation/i);
    expect(textarea).toBeInTheDocument();
    expect(screen.getByText(/Drafting Adjudication/i)).toBeInTheDocument();

    // Click Save Verdict with empty explanation
    await userEvent.click(screen.getByRole('button', { name: /Save Verdict/i }));
    expect(
      screen.getByText(/An explanation is required when not accepting or not resolving a finding/i),
    ).toBeInTheDocument();
    expect(db.issueResponses.find((r) => r.commentId === 'comm-mand-1')?.verdict).toBe('Pending');

    // Type explanation and save
    await userEvent.type(textarea, 'Still crashes on undefined values.');
    await userEvent.click(screen.getByRole('button', { name: /Save Verdict/i }));

    // Persisted
    await waitFor(() => {
      expect(screen.getAllByText(/Not Resolved/i).length).toBeGreaterThanOrEqual(1);
      expect(
        screen.getAllByText('Still crashes on undefined values.').length,
      ).toBeGreaterThanOrEqual(1);
      expect(db.issueResponses.find((r) => r.commentId === 'comm-mand-1')?.verdict).toBe(
        'Overruled',
      );
      expect(db.issueResponses.find((r) => r.commentId === 'comm-mand-1')?.reviewerComment).toBe(
        'Still crashes on undefined values.',
      );
    });
  });

  it('15. Unsaved draft protection: prompts confirmation before discarding dirty explanation', async () => {
    const task = db.tasks.find((t) => t.developerId === DEVELOPER)!;
    task.status = 'InReview';
    task.reviewerId = REVIEWER;
    task.reviewRound = 2;
    task.countedCycle = 2;

    db.reviews = db.reviews.filter((r) => r.taskId !== task.id);
    db.reviews.push({
      id: `rev-${task.id}-prot`,
      taskId: task.id,
      reviewRound: 1,
      reviewerId: REVIEWER,
      reviewerName: 'Pinsara Chandika',
      comments: [
        {
          id: 'comm-prot-1',
          reviewRound: 1,
          text: 'Security check on session token.',
          screenshots: [],
          createdAt: new Date().toISOString(),
          reviewerId: REVIEWER,
        },
      ],
      generalCheck: [],
      findings: { incorrectCode: '', incompleteImplementation: '', sourceFormatting: '' },
      otherRemarks: '',
      feedbackSummary: '',
      rank: 2,
      screenshots: [],
      decision: 'ChangesRequested',
      decidedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    db.issueResponses = db.issueResponses.filter((r) => r.taskId !== task.id);
    db.issueResponses.push({
      id: `resp-${task.id}-prot-1`,
      taskId: task.id,
      reviewRound: 1,
      commentId: 'comm-prot-1',
      screenshotId: null,
      kind: 'Resolved',
      rejectionReason: null,
      verdict: 'Pending',
      respondedAt: new Date().toISOString(),
    });

    renderApp(`/crp/reviewer/tasks/${task.id}`);

    await screen.findByRole('heading', { name: /Developer Response.*Rejection Review/i });

    // 1. Open Not Resolved draft and type text
    await userEvent.click(screen.getByRole('button', { name: /Not Resolved/i }));
    const textarea = screen.getByLabelText(/Reviewer follow-up explanation/i);
    await userEvent.type(textarea, 'Unsaved note in progress...');

    // 2. Click Verify Resolved while draft is dirty
    await userEvent.click(screen.getByRole('button', { name: /Verify Resolved/i }));

    // 3. ConfirmDialog appears with warning
    expect(screen.getByText(/Discard current explanation\?/i)).toBeInTheDocument();
    expect(screen.getByText(/Your unsaved explanation will be lost/i)).toBeInTheDocument();

    // 4. Click Cancel in dialog -> preserves draft and stays in editor
    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(screen.queryByText(/Discard current explanation\?/i)).not.toBeInTheDocument();
    expect(textarea).toHaveValue('Unsaved note in progress...');
    expect(db.issueResponses.find((r) => r.commentId === 'comm-prot-1')?.verdict).toBe('Pending');

    // 5. Click Verify Resolved again -> Click Discard in dialog
    await userEvent.click(screen.getByRole('button', { name: /Verify Resolved/i }));
    await userEvent.click(screen.getByRole('button', { name: /discard/i }));

    // 6. Draft is discarded, editor closed, positive verdict selected
    await waitFor(() => {
      expect(screen.getAllByText(/Resolution Verified/i).length).toBeGreaterThanOrEqual(1);
      expect(db.issueResponses.find((r) => r.commentId === 'comm-prot-1')?.verdict).toBe(
        'Accepted',
      );
    });
  });

  it('16. Change explanation: reopens editor with existing explanation and updates verdict note', async () => {
    const task = db.tasks.find((t) => t.developerId === DEVELOPER)!;
    task.status = 'InReview';
    task.reviewerId = REVIEWER;
    task.reviewRound = 2;
    task.countedCycle = 2;

    db.reviews = db.reviews.filter((r) => r.taskId !== task.id);
    db.reviews.push({
      id: `rev-${task.id}-edit`,
      taskId: task.id,
      reviewRound: 1,
      reviewerId: REVIEWER,
      reviewerName: 'Pinsara Chandika',
      comments: [
        {
          id: 'comm-edit-1',
          reviewRound: 1,
          text: 'Review pagination boundary.',
          screenshots: [],
          createdAt: new Date().toISOString(),
          reviewerId: REVIEWER,
        },
      ],
      generalCheck: [],
      findings: { incorrectCode: '', incompleteImplementation: '', sourceFormatting: '' },
      otherRemarks: '',
      feedbackSummary: '',
      rank: 2,
      screenshots: [],
      decision: 'ChangesRequested',
      decidedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    db.issueResponses = db.issueResponses.filter((r) => r.taskId !== task.id);
    db.issueResponses.push({
      id: `resp-${task.id}-edit-1`,
      taskId: task.id,
      reviewRound: 1,
      commentId: 'comm-edit-1',
      screenshotId: null,
      kind: 'Resolved',
      rejectionReason: null,
      verdict: 'Overruled',
      reviewerComment: 'Initial explanation text.',
      respondedAt: new Date().toISOString(),
    });

    renderApp(`/crp/reviewer/tasks/${task.id}`);

    await screen.findByRole('heading', { name: /Developer Response.*Rejection Review/i });
    await expandSection(/Developer Response & Rejection Review/i);

    // Initial explanation rendered
    expect(screen.getAllByText('Initial explanation text.').length).toBeGreaterThanOrEqual(1);

    // Click Change explanation
    await userEvent.click(screen.getByRole('button', { name: /Change explanation/i }));

    // Editor opened with prefilled text
    const textarea = screen.getByLabelText(/Reviewer follow-up explanation/i);
    expect(textarea).toHaveValue('Initial explanation text.');

    // Edit text and save
    await userEvent.clear(textarea);
    await userEvent.type(textarea, 'Updated explanation after second look.');
    await userEvent.click(screen.getByRole('button', { name: /Save Verdict/i }));

    // Persisted
    await waitFor(() => {
      expect(
        screen.getAllByText('Updated explanation after second look.').length,
      ).toBeGreaterThanOrEqual(1);
      expect(db.issueResponses.find((r) => r.commentId === 'comm-edit-1')?.reviewerComment).toBe(
        'Updated explanation after second look.',
      );
    });
  });

  it('17. Remove verdict: removes saved negative verdict back to Pending, protected against accidental button click', async () => {
    const task = db.tasks.find((t) => t.developerId === DEVELOPER)!;
    task.status = 'InReview';
    task.reviewerId = REVIEWER;
    task.reviewRound = 2;
    task.countedCycle = 2;

    db.reviews = db.reviews.filter((r) => r.taskId !== task.id);
    db.reviews.push({
      id: `rev-${task.id}-rem`,
      taskId: task.id,
      reviewRound: 1,
      reviewerId: REVIEWER,
      reviewerName: 'Pinsara Chandika',
      comments: [
        {
          id: 'comm-rem-1',
          reviewRound: 1,
          text: 'Check database index.',
          screenshots: [],
          createdAt: new Date().toISOString(),
          reviewerId: REVIEWER,
        },
      ],
      generalCheck: [],
      findings: { incorrectCode: '', incompleteImplementation: '', sourceFormatting: '' },
      otherRemarks: '',
      feedbackSummary: '',
      rank: 2,
      screenshots: [],
      decision: 'ChangesRequested',
      decidedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    db.issueResponses = db.issueResponses.filter((r) => r.taskId !== task.id);
    db.issueResponses.push({
      id: `resp-${task.id}-rem-1`,
      taskId: task.id,
      reviewRound: 1,
      commentId: 'comm-rem-1',
      screenshotId: null,
      kind: 'Resolved',
      rejectionReason: null,
      verdict: 'Overruled',
      reviewerComment: 'Index missing on foreign key.',
      respondedAt: new Date().toISOString(),
    });

    renderApp(`/crp/reviewer/tasks/${task.id}`);

    await screen.findByRole('heading', { name: /Developer Response.*Rejection Review/i });
    await expandSection(/Developer Response & Rejection Review/i);
    expect(screen.getAllByText('Index missing on foreign key.').length).toBeGreaterThanOrEqual(1);

    // 1. Accidental button click: Clicking Not Resolved does NOT remove the verdict
    await userEvent.click(screen.getByRole('button', { name: /Not Resolved/i }));
    expect(db.issueResponses.find((r) => r.commentId === 'comm-rem-1')?.verdict).toBe('Overruled');

    // Cancel draft if it opened editor
    if (screen.queryByRole('button', { name: /^cancel$/i })) {
      await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    }

    // 2. Explicit Remove verdict action: Clears verdict and returns to Pending
    const removeBtn = screen.getByRole('button', { name: /Remove verdict/i });
    await userEvent.click(removeBtn);

    await waitFor(() => {
      expect(screen.getAllByText(/Pending Verification/i).length).toBeGreaterThanOrEqual(1);
      expect(db.issueResponses.find((r) => r.commentId === 'comm-rem-1')?.verdict).toBe('Pending');
      expect(
        db.issueResponses.find((r) => r.commentId === 'comm-rem-1')?.reviewerComment,
      ).toBeNull();
    });
  });

  it('18. Active adjudication draft blocks final review decisions until saved or cancelled', async () => {
    const task = db.tasks.find((t) => t.taskCode === 'QA-ADJ-ALL-ACCEPTED-MIXED')!;
    renderApp(`/crp/reviewer/tasks/${task.id}`);

    await screen.findByRole('heading', { name: /Developer Response.*Rejection Review/i });
    await expandSection(/Developer Response & Rejection Review/i);

    // Select Rank 1
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: /Rank 1/i })).not.toBeDisabled();
    });
    await userEvent.click(screen.getByRole('radio', { name: /Rank 1/i }));

    // Approve Task is enabled because all verdicts are accepted
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Approve Task/i })).toBeEnabled();
    });

    // Start drafting negative verdict on first item
    const notResolvedBtns = screen.getAllByRole('button', { name: /Not Resolved/i });
    await userEvent.click(notResolvedBtns[0]!);

    // While drafting, final approval is blocked
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Approve Task/i })).toBeDisabled();
    });

    // Cancel draft
    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

    // Approve Task is unblocked again
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Approve Task/i })).toBeEnabled();
    });
  });
});
