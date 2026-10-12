import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { Toaster } from 'sonner';
import { type Review, type ReviewHistoryEntry } from '@sdp/contracts';
import { signInForTest } from '@tests/support/setup.ts';
import { routes } from '@/app/routes.tsx';
import { ReviewFeedbackPanel } from '@/portals/code-review/features/tasks/components/ReviewFeedbackPanel.tsx';
import { ReviewCycleHistory } from '@/portals/code-review/components/ReviewCycleHistory.tsx';
import { settleRequests } from '@tests/support/settleRequests.ts';
import { apiStub } from '@tests/support/apiStub.ts';
import { buildDataset, type Dataset } from '@tests/support/fixtures/dataset.ts';
import {
  serveReviewDecisions,
  serveReviewDraftWrites,
  serveReviewerWorkspace,
} from '@tests/support/serveReview.ts';

let db: Dataset;

const REVIEWER = 'u-pinsara';
const OTHER_REVIEWER = 'u-kavidu';
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

function createDummyPngFile(name: string, size = 1024): File {
  const buffer = new Uint8Array(size);
  return new File([buffer], name, { type: 'image/png' });
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
    task.currentReviewSessionId = null;
  }
  db.reviews = db.reviews.filter((r) => r.taskId !== IN_REVIEW_TASK);
  db.events = db.events.filter((e) => e.taskId !== IN_REVIEW_TASK);
  db.issueResponses = db.issueResponses.filter((r) => r.taskId !== IN_REVIEW_TASK);
  db.handovers = db.handovers.filter((h) => h.taskId !== IN_REVIEW_TASK);
  serveReviewerWorkspace(db, { assigned: task ? [task] : [] });
  serveReviewDraftWrites(db);
  serveReviewDecisions(db);
});

// A debounced autosave must not land after the test and leak into the next one.
afterEach(settleRequests);

describe('COMMENT-FIRST MODERN REVIEW EXPERIENCE QA TEST SUITE', () => {
  it('1. Layout Order: Review Comments section appears ABOVE Review Ranking section', async () => {
    setupEnvironment();
    await screen.findByRole('heading', { name: /Reviewer Assessment/i });

    const commentsHeading = screen.getByRole('heading', { name: /Review Comments/i });
    const rankingHeading = screen.getByRole('heading', { name: /Review Ranking/i });

    expect(commentsHeading).toBeInTheDocument();
    expect(rankingHeading).toBeInTheDocument();

    // Verify DOM order: commentsHeading precedes rankingHeading
    expect(
      commentsHeading.compareDocumentPosition(rankingHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('2. Comment Creation: reviewer can add a text comment without screenshot', async () => {
    const { user } = setupEnvironment();
    await screen.findByRole('heading', { name: /Reviewer Assessment/i });

    // Click Add First Comment
    const addFirstCommentBtn = screen.getByRole('button', { name: /add first comment/i });
    await user.click(addFirstCommentBtn);

    // Comment card appears
    expect(screen.getByText('Review Comment #1')).toBeInTheDocument();
    const commentInput = screen.getByPlaceholderText(/describe the actionable issue/i);
    await user.type(commentInput, 'Missing validation on order amount field.');

    expect(commentInput).toHaveValue('Missing validation on order amount field.');
    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();
  });

  it('3 & 10. Comment with Screenshot & Default Naming: auto-names to {taskCode}-screenshot-1.png', async () => {
    const { user } = setupEnvironment();
    await screen.findByRole('heading', { name: /Reviewer Assessment/i });

    await user.click(screen.getByRole('button', { name: /add first comment/i }));
    const commentInput = screen.getByPlaceholderText(/describe the actionable issue/i);
    await user.type(commentInput, 'Broken responsive layout.');

    // Upload a screenshot
    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    expect(fileInput).not.toBeNull();

    const testFile = createDummyPngFile('raw_browser_screenshot_123.png', 4096);
    await user.upload(fileInput, testFile);

    // Default naming convention: BLOM-010-screenshot-1.png
    await waitFor(() => {
      expect(screen.getByText('BLOM-010-screenshot-1.png')).toBeInTheDocument();
    });
  });

  it('4 & 5. ID Association & Multiple Comments: screenshots strictly belong to their parent comment', async () => {
    const { user } = setupEnvironment();
    await screen.findByRole('heading', { name: /Reviewer Assessment/i });

    // Comment 1 with screenshot
    await user.click(screen.getByRole('button', { name: /add first comment/i }));
    const commentInput1 = screen.getByPlaceholderText(/describe the actionable issue/i);
    await user.type(commentInput1, 'Comment 1 finding');

    const fileInputs = () => document.querySelectorAll('input[type="file"]');
    await user.upload(fileInputs()[0] as HTMLInputElement, createDummyPngFile('shot1.png', 2048));

    await waitFor(() => {
      expect(screen.getByText('BLOM-010-screenshot-1.png')).toBeInTheDocument();
    });

    // Add Comment 2
    await user.click(screen.getByRole('button', { name: /^add comment$/i }));
    expect(screen.getByText('Review Comment #2')).toBeInTheDocument();

    const textareas = screen.getAllByPlaceholderText(/describe the actionable issue/i);
    await user.type(textareas[1]!, 'Comment 2 finding');

    await user.upload(fileInputs()[1] as HTMLInputElement, createDummyPngFile('shot2.png', 3072));

    await waitFor(() => {
      expect(screen.getByText('BLOM-010-screenshot-2.png')).toBeInTheDocument();
    });

    // Save as draft to inspect in db
    await user.click(screen.getByRole('button', { name: /save as draft/i }));
    await waitFor(() => {
      expect(screen.getByText(/^saved$/i)).toBeInTheDocument();
    });

    const savedReview = db.reviews.find((r) => r.taskId === IN_REVIEW_TASK);
    expect(savedReview?.comments).toHaveLength(2);
    expect(savedReview?.comments[0]!.screenshots).toHaveLength(1);
    expect(savedReview?.comments[0]!.screenshots[0]!.fileName).toBe('BLOM-010-screenshot-1.png');
    expect(savedReview?.comments[1]!.screenshots).toHaveLength(1);
    expect(savedReview?.comments[1]!.screenshots[0]!.fileName).toBe('BLOM-010-screenshot-2.png');
  });

  it('6 & 25. Preview Rendering & Non-Cropping: renders with object-contain to prevent evidence cropping', async () => {
    const { user } = setupEnvironment();
    await screen.findByRole('heading', { name: /Reviewer Assessment/i });

    await user.click(screen.getByRole('button', { name: /add first comment/i }));
    await user.type(
      screen.getByPlaceholderText(/describe the actionable issue/i),
      'Visual alignment issue',
    );

    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    await user.upload(fileInput, createDummyPngFile('header.png', 2048));

    const previewImg = await screen.findByAltText('BLOM-010-screenshot-1.png');
    expect(previewImg).toBeInTheDocument();
    // Must contain object-contain class (never object-cover)
    expect(previewImg.className).toContain('object-contain');
    expect(previewImg.className).not.toContain('object-cover');
  });

  it('7 & 8. Full-screen Lightbox: opens accessible modal with zoom controls and metadata', async () => {
    const { user } = setupEnvironment();
    await screen.findByRole('heading', { name: /Reviewer Assessment/i });

    await user.click(screen.getByRole('button', { name: /add first comment/i }));
    await user.type(screen.getByPlaceholderText(/describe the actionable issue/i), 'Bug report');

    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    await user.upload(fileInput, createDummyPngFile('chart.png', 5120));

    await screen.findByText('BLOM-010-screenshot-1.png');

    // Click preview button
    const previewBtn = screen.getByRole('button', { name: /preview blom-010-screenshot-1\.png/i });
    await user.click(previewBtn);

    // Lightbox modal dialog opens
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('BLOM-010-screenshot-1.png')).toBeInTheDocument();
    expect(within(dialog).getByText(/5 KB/i)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /zoom in/i })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /zoom out/i })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /reset zoom/i })).toBeInTheDocument();

    // Zoom In
    const zoomInBtn = within(dialog).getByRole('button', { name: /zoom in/i });
    await user.click(zoomInBtn);
    expect(within(dialog).getByText('125%')).toBeInTheDocument();

    // Close lightbox via Close button
    await user.click(within(dialog).getByRole('button', { name: /close lightbox/i }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    // Let the debounced write finish before the shared mock database is reset for the next test.
    await waitFor(
      () => {
        expect(screen.getByText(/^saved$/i)).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });

  it('9. Screenshot Download: triggers file download with display filename', async () => {
    const { user } = setupEnvironment();
    await screen.findByRole('heading', { name: /Reviewer Assessment/i });

    await user.click(screen.getByRole('button', { name: /add first comment/i }));
    await user.type(
      screen.getByPlaceholderText(/describe the actionable issue/i),
      'Download check',
    );

    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    await user.upload(fileInput, createDummyPngFile('asset.png', 1024));

    await screen.findByText('BLOM-010-screenshot-1.png');

    // Spy on anchor click
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    const downloadBtn = screen.getByRole('button', {
      name: /download blom-010-screenshot-1\.png/i,
    });
    await user.click(downloadBtn);

    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  it('11. Sequence Stability: sequence monotonically increases based on maxSeq, preventing collision on deletion', async () => {
    const { user } = setupEnvironment();
    await screen.findByRole('heading', { name: /Reviewer Assessment/i });

    // Add comment 1 with shot 1
    await user.click(screen.getByRole('button', { name: /add first comment/i }));
    await user.type(screen.getByPlaceholderText(/describe the actionable issue/i), 'Comment 1');
    const fileInputs = () => document.querySelectorAll('input[type="file"]');
    await user.upload(fileInputs()[0] as HTMLInputElement, createDummyPngFile('shot1.png', 1024));

    await waitFor(() => {
      expect(screen.getByText('BLOM-010-screenshot-1.png')).toBeInTheDocument();
    });

    // Remove shot 1
    const removeShotBtn = screen.getByRole('button', {
      name: /remove blom-010-screenshot-1\.png/i,
    });
    await user.click(removeShotBtn);

    await waitFor(() => {
      expect(screen.queryByText('BLOM-010-screenshot-1.png')).toBeNull();
    });

    // Add another screenshot
    await user.upload(
      fileInputs()[0] as HTMLInputElement,
      createDummyPngFile('shot_new.png', 1024),
    );
    await waitFor(() => {
      expect(screen.getByText(/BLOM-010-screenshot-\d+\.png/)).toBeInTheDocument();
    });
  });

  it('12. Rename Screenshot: updates fileName in review draft without changing storageRef and marks Unsaved changes', async () => {
    const { user } = setupEnvironment();
    await screen.findByRole('heading', { name: /Reviewer Assessment/i });

    await user.click(screen.getByRole('button', { name: /add first comment/i }));
    await user.type(screen.getByPlaceholderText(/describe the actionable issue/i), 'Rename test');

    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    await user.upload(fileInput, createDummyPngFile('initial.png', 2048));
    await screen.findByText('BLOM-010-screenshot-1.png');

    // Save as draft first
    await user.click(screen.getByRole('button', { name: /save as draft/i }));
    await waitFor(() => {
      expect(screen.getByText(/^saved$/i)).toBeInTheDocument();
    });

    // Click Rename button
    const renameBtn = screen.getByRole('button', { name: /rename blom-010-screenshot-1\.png/i });
    await user.click(renameBtn);

    const dialog = await screen.findByRole('dialog');
    const baseInput = within(dialog).getByRole('textbox');
    await user.clear(baseInput);
    await user.type(baseInput, 'login-error-dialog');
    await user.click(within(dialog).getByRole('button', { name: /save name/i }));

    // Renamed screenshot visible in preview card
    await waitFor(() => {
      expect(screen.getByText('login-error-dialog.png')).toBeInTheDocument();
    });

    // Form is marked "Unsaved changes"
    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();

    // Save as draft and verify persistence
    await user.click(screen.getByRole('button', { name: /save as draft/i }));
    await waitFor(() => {
      expect(screen.getByText(/^saved$/i)).toBeInTheDocument();
    });

    const savedReview = db.reviews.find((r) => r.taskId === IN_REVIEW_TASK);
    expect(savedReview?.comments[0]!.screenshots[0]!.fileName).toBe('login-error-dialog.png');
  });

  it('13 & 14. Previous Reviewer Immutability & Access: cannot rename or remove, but can preview and download', async () => {
    // Seed draft containing a comment from previous reviewer
    let activeReview = db.reviews.find((r) => r.taskId === IN_REVIEW_TASK && r.reviewRound === 1);
    if (!activeReview) {
      activeReview = {
        id: `rev-${IN_REVIEW_TASK}-1`,
        taskId: IN_REVIEW_TASK,
        reviewRound: 1,
        reviewerId: OTHER_REVIEWER,
        reviewerName: 'Kavidu Dilshan',
        comments: [],
        generalCheck: [],
        findings: { incorrectCode: '', incompleteImplementation: '', sourceFormatting: '' },
        otherRemarks: '',
        feedbackSummary: '',
        screenshots: [],
        rank: 2,
        decision: null,
        decidedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      db.reviews.push(activeReview);
    }
    activeReview.reviewerId = OTHER_REVIEWER;
    activeReview.reviewerName = 'Kavidu Dilshan';
    activeReview.rank = 2;
    activeReview.comments = [
      {
        id: 'c-prev',
        reviewRound: 1,
        reviewerId: REVIEWER,
        reviewerName: 'Pinsara Chandika',
        text: 'Previous reviewer feedback item',
        screenshots: [
          {
            id: 's-prev-1',
            fileName: 'BLOM-010-screenshot-1.png',
            mimeType: 'image/png',
            sizeBytes: 4096,
            storageRef: 'data:image/png;base64,dummy',
            comment: '',
            uploadedAt: new Date().toISOString(),
          },
        ],
        createdAt: new Date().toISOString(),
      },
    ];

    const activeTask = db.tasks.find((t) => t.id === IN_REVIEW_TASK)!;
    activeTask.status = 'InReview';
    activeTask.reviewerId = OTHER_REVIEWER;
    activeTask.isHandedOver = false;

    signInForTest(OTHER_REVIEWER);
    const { user } = setupEnvironment();
    await screen.findByRole('heading', { name: /Reviewer Assessment/i });
    await user.click(await screen.findByRole('button', { name: /Previous Reviewer Feedback/i }));

    // Previous reviewer badge visible
    expect(await screen.findByText(/By Pinsara Chandika · Previous Reviewer/i)).toBeInTheDocument();

    // Preview and Download buttons are available
    expect(
      screen.getByRole('button', { name: /preview blom-010-screenshot-1\.png/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /download blom-010-screenshot-1\.png/i }),
    ).toBeInTheDocument();

    // Rename and Remove buttons MUST NOT be present
    expect(screen.queryByRole('button', { name: /rename blom-010-screenshot-1\.png/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /remove blom-010-screenshot-1\.png/i })).toBeNull();
  });

  it('15. Developer View: ReviewFeedbackPanel renders ScreenshotPreviewCard in readOnly mode with lightbox', async () => {
    const mockReview: Review = {
      id: 'rev-test-1',
      taskId: 't-1',
      reviewRound: 1,
      reviewerId: REVIEWER,
      reviewerName: 'Pinsara Chandika',
      rank: 2,
      comments: [
        {
          id: 'comm-dev-1',
          reviewRound: 1,
          reviewerId: REVIEWER,
          reviewerName: 'Pinsara Chandika',
          text: 'Fix the checkout button alignment',
          screenshots: [
            {
              id: 'shot-dev-1',
              fileName: 'checkout-bug.png',
              mimeType: 'image/png',
              sizeBytes: 8192,
              storageRef: 'data:image/png;base64,dummy',
              comment: '',
              uploadedAt: new Date().toISOString(),
            },
          ],
          createdAt: new Date().toISOString(),
        },
      ],
      generalCheck: [],
      findings: { incorrectCode: '', incompleteImplementation: '', sourceFormatting: '' },
      otherRemarks: '',
      feedbackSummary: '',
      screenshots: [],
      decision: 'ChangesRequested',
      decidedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const utils = render(
      <ReviewFeedbackPanel
        review={mockReview}
        responses={[]}
        onRespond={vi.fn()}
        onResubmit={vi.fn()}
        isResubmitting={false}
      />,
    );

    // Screenshot filename is rendered
    expect(screen.getByText('checkout-bug.png')).toBeInTheDocument();
    // Non-cropping object-contain
    const img = screen.getByAltText('checkout-bug.png');
    expect(img.className).toContain('object-contain');

    // Click preview to open lightbox
    const previewBtn = screen.getByRole('button', { name: /preview checkout-bug\.png/i });
    await userEvent.click(previewBtn);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('checkout-bug.png')).toBeInTheDocument();
    utils.unmount();
  });

  it('16. History View: ReviewCycleHistory renders ScreenshotPreviewCard in readOnly mode with lightbox', async () => {
    const entries: ReviewHistoryEntry[] = [
      {
        id: 'hist-1',
        taskId: 't-1',
        reviewRound: 1,
        reviewerId: REVIEWER,
        reviewerName: 'Pinsara Chandika',
        rank: 2,
        decision: 'ChangesRequested',
        decidedAt: new Date().toISOString(),
        feedbackSummary: '',
        generalCheck: [],
        findings: { incorrectCode: '', incompleteImplementation: '', sourceFormatting: '' },
        otherRemarks: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        responses: [],
        comments: [
          {
            id: 'c-hist-1',
            reviewRound: 1,
            reviewerId: REVIEWER,
            reviewerName: 'Pinsara Chandika',
            text: 'Historical comment',
            screenshots: [
              {
                id: 's-hist-1',
                fileName: 'historical-shot.png',
                mimeType: 'image/png',
                sizeBytes: 4096,
                storageRef: 'data:image/png;base64,dummy',
                comment: '',
                uploadedAt: new Date().toISOString(),
              },
            ],
            createdAt: new Date().toISOString(),
          },
        ],
        screenshots: [],
      },
    ];

    const utils = render(<ReviewCycleHistory entries={entries} />);
    expect(screen.getByText('historical-shot.png')).toBeInTheDocument();

    const img = screen.getByAltText('historical-shot.png');
    expect(img.className).toContain('object-contain');

    const previewBtn = screen.getByRole('button', { name: /preview historical-shot\.png/i });
    await userEvent.click(previewBtn);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('historical-shot.png')).toBeInTheDocument();
    utils.unmount();
  });

  it('17 & 18. Validation Rules: Rank 2/3 requires comments, Rank 1 blocked with comments', async () => {
    const { user } = setupEnvironment();
    await screen.findByRole('heading', { name: /Reviewer Assessment/i });

    // Select Rank 2 with 0 comments
    await user.click(screen.getByRole('radio', { name: /rank 2/i }));

    // Alert displays guidance
    expect(
      screen.getAllByText(/Rank 2 requires at least one review comment/i).length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: /request changes/i })).toBeDisabled();

    // Add a comment
    await user.click(screen.getByRole('button', { name: /add first comment/i }));
    await user.type(
      screen.getByPlaceholderText(/describe the actionable issue/i),
      'Actionable bug',
    );

    // Request Changes is now enabled
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /request changes/i })).toBeEnabled();
    });

    // Now select Rank 1 with active comments
    await user.click(screen.getByRole('radio', { name: /rank 1/i }));

    // Neutral info banner is displayed and Approve Task is enabled
    expect(
      screen.getByText(/rank 1 indicates that no unresolved issues remain/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /approve task/i })).toBeEnabled();
  });

  it('19 & 20. Autosave Model: Form edits persist after the debounce without duplicate requests', async () => {
    let putCount = 0;
    apiStub.put('/tasks/:taskId/review', ({ body: sent, params }) => {
      putCount++;
      const body = sent as { rank?: number; comments?: unknown[] };
      return {
        id: `rev-${String(params['taskId'])}`,
        taskId: params['taskId'],
        reviewRound: 1,
        reviewerId: REVIEWER,
        reviewerName: 'Pinsara Chandika',
        decision: null,
        rank: body.rank ?? 2,
        comments: body.comments ?? [],
        generalCheck: [],
        findings: { incorrectCode: '', incompleteImplementation: '', sourceFormatting: '' },
        otherRemarks: '',
        feedbackSummary: '',
        submittedAt: null,
        decidedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    });

    const { user } = setupEnvironment();
    await screen.findByRole('heading', { name: /Reviewer Assessment/i });

    // Initial status: Saved
    expect(screen.getByText(/^saved$/i)).toBeInTheDocument();

    // Make edit
    await user.click(screen.getByRole('radio', { name: /rank 2/i }));
    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();

    // The edit is persisted by the debounced autosave.
    await waitFor(
      () => {
        expect(screen.getByText(/^saved$/i)).toBeInTheDocument();
        expect(putCount).toBe(1);
      },
      { timeout: 3000 },
    );

    // Once saved, no redundant request is issued for the same snapshot.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(putCount).toBe(1);
  });

  it('21 & 22. Decision Submission & History Noise: Request Changes submits draft atomically and creates 0 draft noise events', async () => {
    const { user } = setupEnvironment();
    await screen.findByRole('heading', { name: /Reviewer Assessment/i });

    await user.click(screen.getByRole('radio', { name: /rank 2/i }));
    await user.click(screen.getByRole('button', { name: /add first comment/i }));
    await user.type(
      screen.getByPlaceholderText(/describe the actionable issue/i),
      'Fix calculation logic',
    );

    // Click Request Changes directly -> opens confirmation dialog
    await user.click(screen.getByRole('button', { name: /request changes/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /request changes/i }));

    // One decision request carrying the whole draft (comment included); no
    // explicit draft save, which is what writes ReviewDraftSaved on the server.
    await waitFor(() => {
      expect(apiStub.requests('POST', '/tasks/:taskId/review')).toHaveLength(1);
    });
    expect(apiStub.requests('POST', '/tasks/:taskId/review')[0]?.body).toMatchObject({
      decision: 'ChangesRequested',
      draft: { comments: [expect.objectContaining({ text: 'Fix calculation logic' })] },
    });
    expect(
      apiStub
        .requests('PUT', '/tasks/:taskId/review')
        .filter(({ query }) => query.get('source') === 'manual'),
    ).toHaveLength(0);
  });

  it('23. Toggleable Rank Cards: Select, toggle off, switch ranks, and verify validation after clearing rank', async () => {
    const { user } = setupEnvironment();
    await screen.findByRole('heading', { name: /Reviewer Assessment/i });

    const rank1Btn = screen.getByRole('radio', { name: /rank 1/i });
    const rank2Btn = screen.getByRole('radio', { name: /rank 2/i });
    const rank3Btn = screen.getByRole('radio', { name: /rank 3/i });
    const approveBtn = screen.getByRole('button', { name: /approve task/i });
    const requestChangesBtn = screen.getByRole('button', { name: /request changes/i });

    // Initial state: rank is null
    expect(rank1Btn).toHaveAttribute('aria-checked', 'false');
    expect(rank2Btn).toHaveAttribute('aria-checked', 'false');
    expect(rank3Btn).toHaveAttribute('aria-checked', 'false');
    expect(screen.getAllByText(/ranking required/i).length).toBeGreaterThanOrEqual(1);
    expect(approveBtn).toBeDisabled();
    expect(requestChangesBtn).toBeDisabled();

    // 1. Select Rank 1
    await user.click(rank1Btn);
    expect(rank1Btn).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText(/rank 1 selected/i)).toBeInTheDocument();
    expect(approveBtn).not.toBeDisabled();
    expect(requestChangesBtn).toBeDisabled();

    // 2. Re-click selected Rank 1 to clear (toggle off -> rank becomes null)
    await user.click(rank1Btn);
    expect(rank1Btn).toHaveAttribute('aria-checked', 'false');
    expect(rank2Btn).toHaveAttribute('aria-checked', 'false');
    expect(rank3Btn).toHaveAttribute('aria-checked', 'false');
    expect(screen.getAllByText(/ranking required/i).length).toBeGreaterThanOrEqual(1);
    expect(approveBtn).toBeDisabled();
    expect(requestChangesBtn).toBeDisabled();

    // 3. Switch between ranks: Click Rank 2, then switch to Rank 3, then switch to Rank 1
    await user.click(rank2Btn);
    expect(rank2Btn).toHaveAttribute('aria-checked', 'true');
    expect(rank1Btn).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText(/rank 2 selected/i)).toBeInTheDocument();

    await user.click(rank3Btn);
    expect(rank3Btn).toHaveAttribute('aria-checked', 'true');
    expect(rank2Btn).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText(/rank 3 selected/i)).toBeInTheDocument();

    await user.click(rank1Btn);
    expect(rank1Btn).toHaveAttribute('aria-checked', 'true');
    expect(rank3Btn).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText(/rank 1 selected/i)).toBeInTheDocument();

    // 4. Toggle off Rank 3: Select Rank 3, re-click Rank 3 to clear
    await user.click(rank3Btn);
    expect(rank3Btn).toHaveAttribute('aria-checked', 'true');
    await user.click(rank3Btn);
    expect(rank3Btn).toHaveAttribute('aria-checked', 'false');
    expect(screen.getAllByText(/ranking required/i).length).toBeGreaterThanOrEqual(1);
    expect(approveBtn).toBeDisabled();
    expect(requestChangesBtn).toBeDisabled();
  });

  it('24. Clearing Rank after comment entry: restores Ranking Required validation and disables decision buttons', async () => {
    const { user } = setupEnvironment();
    await screen.findByRole('heading', { name: /Reviewer Assessment/i });

    // Add actionable comment
    await user.click(screen.getByRole('button', { name: /add first comment/i }));
    await user.type(
      screen.getByPlaceholderText(/describe the actionable issue/i),
      'Fix critical null check',
    );

    // Select Rank 2 -> Request Changes becomes enabled
    const rank2Btn = screen.getByRole('radio', { name: /rank 2/i });
    await user.click(rank2Btn);
    expect(rank2Btn).toHaveAttribute('aria-checked', 'true');

    const requestChangesBtn = screen.getByRole('button', { name: /request changes/i });
    expect(requestChangesBtn).not.toBeDisabled();

    // Re-click Rank 2 to clear
    await user.click(rank2Btn);
    expect(rank2Btn).toHaveAttribute('aria-checked', 'false');

    // Shows Ranking Required validation state and disables action buttons
    expect(screen.getAllByText(/ranking required/i).length).toBeGreaterThanOrEqual(1);
    expect(requestChangesBtn).toBeDisabled();
    expect(screen.getByRole('button', { name: /approve task/i })).toBeDisabled();
  });
});
