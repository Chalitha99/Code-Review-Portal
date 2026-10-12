import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { E2E_USERS } from '../../../prisma/e2e-fixtures.ts';
import { PrismaService } from '../../../src/prisma/prisma.service.ts';
import {
  createDraft,
  createSubmitted,
  hasE2eDatabase,
  startHarness,
  type Harness,
  type Session,
} from './security-harness.ts';

/**
 * VAPT regression suite: workflow state-machine integrity and concurrency.
 * SDP-VAPT-001 (double approve) is remediated and asserted with `it`.
 * SDP-VAPT-002 (double submit) and SDP-VAPT-003 (cross-task finding oracle) are
 * still open and encoded as `it.fails`; flip them to `it` once fixed.
 */
describe.skipIf(!hasE2eDatabase)('VAPT: workflow integrity', () => {
  let h: Harness;
  let dev: Session;
  let rev: Session;
  let rev2: Session;
  let admin: Session;
  let prisma: PrismaService;

  beforeAll(async () => {
    h = await startHarness();
    dev = await h.signIn(E2E_USERS.developer.email);
    rev = await h.signIn(E2E_USERS.reviewer.email);
    rev2 = await h.signIn(E2E_USERS.reviewer2.email);
    admin = await h.signIn(E2E_USERS.admin.email);
    prisma = h.app.get(PrismaService);
  });
  afterAll(async () => {
    await h.app.close();
  });

  it('rejects out-of-order transitions (decide/save before pick, resubmit of submitted)', async () => {
    const task = await createSubmitted(h, dev);
    await h
      .as(rev)
      .post(`/api/tasks/${task}/review`, { decision: 'Approved', draft: { rank: 1, comments: [] } })
      .expect(403);
    await h.as(rev).put(`/api/tasks/${task}/review`, { rank: 1, comments: [] }).expect(403);
    await h.as(dev).post(`/api/tasks/${task}/submit`).expect(409);
    await h.as(admin).post(`/api/tasks/${task}/cancel`, { reason: 'cleanup' }).expect(200);
  });

  // SDP-VAPT-002: two concurrent submits of one draft both commit, writing
  // duplicate TASK_SUBMITTED status-history rows. The pre-read status check sits
  // outside the transaction and the update is unconditional by id. The race is
  // timing-dependent, so several rounds run and any duplicate proves it. Make
  // the submit update conditional on the pre-read status, then flip to `it`.
  it.fails('SDP-VAPT-002: concurrent submit creates exactly one submission', async () => {
    let maxSubmittedRows = 1;
    for (let round = 0; round < 6; round += 1) {
      const id = await createDraft(h, dev);
      await Promise.all([
        h.as(dev).post(`/api/tasks/${id}/submit`),
        h.as(dev).post(`/api/tasks/${id}/submit`),
      ]);
      const rows = await prisma.taskStatusHistory.count({
        where: { taskId: id, newStatus: 'SUBMITTED' },
      });
      maxSubmittedRows = Math.max(maxSubmittedRows, rows);
    }
    expect(maxSubmittedRows).toBe(1);
  });

  // SDP-VAPT-001 (remediated): the decide transaction now updates the task only
  // while it is still IN_REVIEW for this reviewer, so a concurrent second
  // decision rolls back with 409 instead of writing a second approval.
  it('SDP-VAPT-001: concurrent approve creates exactly one approval form', async () => {
    let maxForms = 1;
    let maxAudits = 1;
    for (let round = 0; round < 4; round += 1) {
      const task = await createSubmitted(h, dev);
      await h.as(rev).post(`/api/tasks/${task}/pick`).expect(200);
      await h.as(rev).put(`/api/tasks/${task}/review`, { rank: 1, comments: [] }).expect(200);
      const results = await Promise.all([
        h
          .as(rev)
          .post(`/api/tasks/${task}/review`, {
            decision: 'Approved',
            draft: { rank: 1, comments: [] },
          }),
        h
          .as(rev)
          .post(`/api/tasks/${task}/review`, {
            decision: 'Approved',
            draft: { rank: 1, comments: [] },
          }),
      ]);
      const statuses = results.map(({ status }) => status);
      expect(statuses).toContain(200);
      expect(statuses.every((status) => status === 200 || status === 409)).toBe(true);
      const stored = await prisma.task.findUnique({ where: { id: task } });
      expect(stored?.status).toBe('APPROVED');
      maxForms = Math.max(
        maxForms,
        await prisma.codeReviewForm.count({ where: { taskId: task, decision: 'APPROVED' } }),
      );
      maxAudits = Math.max(
        maxAudits,
        await prisma.auditLog.count({ where: { taskId: task, action: 'TASK_APPROVED' } }),
      );
    }
    expect(maxForms).toBe(1);
    expect(maxAudits).toBe(1);
  });

  // SDP-VAPT-003: a reviewer can embed another task's finding UUID in their own
  // draft; a wrong guess at its text returns 403 while a correct one is accepted
  // (200), a cross-object text-confirmation oracle. The stored-finding lookup in
  // persistDraft should be scoped to the current form/task; then flip to `it`.
  it.fails('SDP-VAPT-003: a finding from another task is not a text oracle', async () => {
    const taskY = await createSubmitted(h, dev);
    await h.as(rev2).post(`/api/tasks/${taskY}/pick`).expect(200);
    await h.as(rev2).put(`/api/tasks/${taskY}/review`, {
      rank: 2,
      comments: [
        {
          id: 'y1',
          reviewRound: 1,
          text: 'SECRET FINDING',
          createdAt: new Date().toISOString(),
          screenshots: [],
        },
      ],
    });
    const yReview = (await h.as(rev2).get(`/api/tasks/${taskY}/review`)).body as {
      comments: { id: string }[];
    };
    const foreignId = yReview.comments[0]?.id;

    const taskX = await createSubmitted(h, dev);
    await h.as(rev).post(`/api/tasks/${taskX}/pick`).expect(200);
    const wrong = await h.as(rev).put(`/api/tasks/${taskX}/review`, {
      rank: 2,
      comments: [
        {
          id: foreignId,
          reviewRound: 1,
          text: 'WRONG GUESS',
          createdAt: new Date().toISOString(),
          screenshots: [],
        },
      ],
    });
    const right = await h.as(rev).put(`/api/tasks/${taskX}/review`, {
      rank: 2,
      comments: [
        {
          id: foreignId,
          reviewRound: 1,
          text: 'SECRET FINDING',
          createdAt: new Date().toISOString(),
          screenshots: [],
        },
      ],
    });
    // Oracle today: wrong=403, right=200. Secure behaviour: no status difference
    // that depends on another task's finding text.
    expect(wrong.status).toBe(right.status);
  });
});
