import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { userSchema } from '@sdp/contracts';
import { E2E_USERS } from '../../../prisma/e2e-fixtures.ts';
import {
  createDraft,
  createSubmitted,
  ensureSecurityDeveloper,
  hasE2eDatabase,
  startHarness,
  type Harness,
  type Session,
} from './security-harness.ts';

/**
 * VAPT regression suite: object- and function-level authorization (BOLA/BFLA).
 * Two developers, two reviewers, admin and super admin exercise the matrix in
 * docs/security/vapt/coverage-matrix.md. All of these currently PASS.
 */
describe.skipIf(!hasE2eDatabase)('VAPT: authorization', () => {
  let h: Harness;
  let devA: Session;
  let devB: Session;
  let rev: Session;
  let rev2: Session;
  let admin: Session;

  beforeAll(async () => {
    h = await startHarness();
    devA = await h.signIn(E2E_USERS.developer.email);
    devB = await h.signIn(await ensureSecurityDeveloper(h));
    rev = await h.signIn(E2E_USERS.reviewer.email);
    rev2 = await h.signIn(E2E_USERS.reviewer2.email);
    admin = await h.signIn(E2E_USERS.admin.email);
  });
  afterAll(async () => {
    await h.app.close();
  });

  it('hides developer A’s draft from developer B and from reviewers', async () => {
    const draft = await createDraft(h, devA);
    await h.as(devB).get(`/api/tasks/${draft}`).expect(404);
    await h.as(devB).patch(`/api/tasks/${draft}`, { priority: 'High' }).expect(403);
    await h.as(devB).post(`/api/tasks/${draft}/submit`).expect(403);
    await h.as(devB).delete(`/api/tasks/${draft}`).expect(403);
    await h.as(devB).get(`/api/tasks/${draft}/checklist`).expect(404);
    await h.as(devB).get(`/api/tasks/${draft}/events`).expect(404);
    await h.as(rev).get(`/api/tasks/${draft}`).expect(404);
    await h.as(admin).get(`/api/tasks/${draft}`).expect(404);
  });

  it('enforces function-level roles on admin and super-admin routes', async () => {
    await h
      .as(devA)
      .post('/api/users', { email: 'x@y.z', name: 'X', roles: ['DEVELOPER'] })
      .expect(403);
    await h.as(devA).get('/api/users').expect(403);
    await h.as(devA).get('/api/audit-logs').expect(403);
    await h.as(rev).post('/api/checklist-sections', { name: 'X' }).expect(403);
    // DELETE user and transfer-super-admin are Super-Admin only.
    const users = (await h.as(admin).get('/api/users').expect(200)).body as {
      id: string;
      email: string;
    }[];
    const targetId = users.find((u) => u.email === E2E_USERS.reviewer2.email)?.id ?? '';
    await h.as(admin).delete(`/api/users/${targetId}`).expect(403);
    await h.as(devA).get('/api/system-audit-events').expect(403);
    await h.as(admin).get('/api/system-audit-events').expect(403);
  });

  it('serves the Users tab to Admin and Super Admin in the shape the web parses', async () => {
    const superAdmin = await h.signIn(E2E_USERS.superAdmin.email);
    for (const session of [admin, superAdmin]) {
      const response = await h.as(session).get('/api/users').expect(200);
      const parsed = z.array(userSchema).safeParse(response.body as unknown);
      expect(parsed.success).toBe(true);
      expect(parsed.data?.some((u) => u.email === E2E_USERS.superAdmin.email)).toBe(true);
    }
  });

  it('lets only the assigned reviewer act on a picked review', async () => {
    const task = await createSubmitted(h, devA);
    await h.as(rev).post(`/api/tasks/${task}/pick`).expect(200);
    await h.as(rev2).post(`/api/tasks/${task}/pick`).expect(409);
    await h.as(rev2).put(`/api/tasks/${task}/review`, { rank: 1, comments: [] }).expect(403);
    await h
      .as(rev2)
      .post(`/api/tasks/${task}/review`, { decision: 'Approved', draft: { rank: 1, comments: [] } })
      .expect(403);
    await h.as(admin).post(`/api/tasks/${task}/cancel`, { reason: 'test cleanup' }).expect(200);
  });

  it('scopes notifications to their recipient', async () => {
    await h
      .as(devA)
      .post('/api/notifications/00000000-0000-4000-8000-0000000000ff/read')
      .expect(404);
  });

  it('refuses mass assignment of privileged task fields', async () => {
    const customers = (await h.as(devA).get('/api/customers').expect(200)).body as {
      id: string;
      name: string;
    }[];
    const types = (await h.as(devA).get('/api/task-types').expect(200)).body as { id: string }[];
    await h
      .as(devA)
      .post('/api/tasks', {
        customerId: (customers.find((c) => c.name === 'E2E Customer') ?? customers[0])?.id,
        crimId: `CRIM-MA-${String(Date.now()).slice(-5)}`,
        priority: 'Medium',
        taskTypeIds: [Number(types[0]?.id)],
        checklistAnswers: [
          { questionId: '00000000-0000-4000-8000-0000000e2e11', answer: 'Yes' },
          { questionId: '00000000-0000-4000-8000-0000000e2e12', answer: 'Yes' },
        ],
        status: 'APPROVED',
        developerId: '00000000-0000-4000-8000-000000000001',
        currentReviewCycle: 9,
      })
      .expect(400);
  });
});
