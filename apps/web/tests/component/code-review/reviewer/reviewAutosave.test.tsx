import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { settleRequests } from '@tests/support/settleRequests.ts';
import { apiError, apiStub } from '@tests/support/apiStub.ts';
import { buildDataset, type Dataset } from '@tests/support/fixtures/dataset.ts';
import { serveReviewDraftWrites, serveReviewerWorkspace } from '@tests/support/serveReview.ts';
import { renderApp, USERS } from '@tests/support/renderApp.tsx';

const TASK = 't-blom-010';
let db: Dataset;

function draftSavedEvents(): number {
  return db.events.filter((e) => e.taskId === TASK && e.kind === 'ReviewDraftSaved').length;
}

async function openReview() {
  const utils = renderApp(`/crp/reviewer/tasks/${TASK}`, USERS.reviewer);
  await screen.findByRole('heading', { name: /reviewer assessment/i });
  expect(await screen.findByText('Saved')).toBeInTheDocument();
  return utils;
}

beforeEach(() => {
  db = buildDataset();
  const task = db.tasks.find((t) => t.id === TASK)!;
  Object.assign(task, {
    status: 'InReview',
    reviewerId: USERS.reviewer,
    reviewCycle: 1,
    historicalCycle: 1,
    adjustedCycles: [],
  });
  db.reviews = db.reviews.filter((r) => r.taskId !== TASK);
  serveReviewerWorkspace(db, { assigned: [task] });
  serveReviewDraftWrites(db);
});

afterEach(settleRequests);

describe('reviewer draft autosave', () => {
  it('moves Saved → Unsaved → Saved on an edit, without writing task history', async () => {
    const { user } = await openReview();
    const before = draftSavedEvents();

    await user.click(screen.getByRole('radio', { name: /rank 1/i }));
    expect(await screen.findByText('Unsaved changes')).toBeInTheDocument();

    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(db.reviews.find((r) => r.taskId === TASK && r.decision === null)?.rank).toBe(1);
    expect(draftSavedEvents()).toBe(before);
  });

  it('records exactly one history event for an explicit Save as Draft', async () => {
    const { user } = await openReview();
    const before = draftSavedEvents();

    await user.click(screen.getByRole('radio', { name: /rank 2/i }));
    await user.click(screen.getByRole('button', { name: /save as draft/i }));

    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(draftSavedEvents()).toBe(before + 1);
    expect(db.tasks.find((t) => t.id === TASK)?.status).toBe('InReview');
  });

  it('reports a failed save and recovers on a manual retry', async () => {
    const { user } = await openReview();
    // The server fails every save until it recovers.
    apiStub.put('/tasks/:taskId/review', () =>
      apiError(500, 'INTERNAL_ERROR', 'Save failed upstream'),
    );

    await user.click(screen.getByRole('radio', { name: /rank 1/i }));
    expect(await screen.findByText('Save failed')).toBeInTheDocument();
    expect(db.reviews.find((r) => r.taskId === TASK && r.decision === null)?.rank ?? null).not.toBe(
      1,
    );

    serveReviewDraftWrites(db);
    await user.click(screen.getByRole('button', { name: /save as draft/i }));
    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(db.reviews.find((r) => r.taskId === TASK && r.decision === null)?.rank).toBe(1);
  });
});
