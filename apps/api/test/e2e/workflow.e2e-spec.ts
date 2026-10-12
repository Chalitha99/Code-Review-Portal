// Must stay the first import: it points Prisma at the e2e database.
import { hasE2eDatabase } from './db-env.js';
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module.ts';
import { configureApp } from '../../src/app.setup.ts';
import { PrismaService } from '../../src/prisma/prisma.service.ts';
import { E2E_PASSWORD, E2E_USERS } from '../../prisma/e2e-fixtures.ts';

/**
 * The ported mock-server rules and the security hardening, end to end against
 * a real (disposable) PostgreSQL database:
 *
 *   node scripts/e2e-db.mjs up && node scripts/e2e-db.mjs reset
 *   E2E_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/sdp_e2e npm run test:e2e
 *
 * Skipped when E2E_DATABASE_URL is not set. The tests share one seeded
 * database and run in order: each step builds on the task the previous made.
 */
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const pngDataUrl = `data:image/png;base64,${PNG.toString('base64')}`;

type Agent = ReturnType<typeof request.agent>;
interface Session {
  agent: Agent;
  csrf: string;
  cookies: string[];
}

describe.skipIf(!hasE2eDatabase)('workflow rules and security (real database)', () => {
  let app: NestExpressApplication;
  let server: Server;

  async function signIn(email: string): Promise<Session> {
    const agent = request.agent(server);
    const response = await agent
      .post('/api/auth/login')
      .send({ email, password: E2E_PASSWORD })
      .expect(200);
    const cookies = ([] as string[]).concat(response.headers['set-cookie'] ?? []);
    const csrf = /sdp_csrf=([^;]+)/.exec(cookies.join(';'))?.[1] ?? '';
    return { agent, csrf, cookies };
  }

  const as = (session: Session) => ({
    get: (path: string) => session.agent.get(path),
    post: (path: string, body?: object) =>
      session.agent
        .post(path)
        .set('X-CSRF-Token', session.csrf)
        .send(body ?? {}),
    put: (path: string, body: object) =>
      session.agent.put(path).set('X-CSRF-Token', session.csrf).send(body),
    patch: (path: string, body: object) =>
      session.agent.patch(path).set('X-CSRF-Token', session.csrf).send(body),
    delete: (path: string, body?: object) =>
      session.agent
        .delete(path)
        .set('X-CSRF-Token', session.csrf)
        .send(body ?? {}),
  });

  let dev: Session;
  let admin: Session;
  let superAdmin: Session;
  let adminReviewer: Session;
  let reviewer2: Session;
  let taskId = '';
  let userIds: Record<string, string> = {};

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
    configureApp(app);
    await app.init();
    server = app.getHttpServer();

    dev = await signIn(E2E_USERS.developer.email);
    admin = await signIn(E2E_USERS.admin.email);
    superAdmin = await signIn(E2E_USERS.superAdmin.email);
    adminReviewer = await signIn(E2E_USERS.adminReviewer.email);
    reviewer2 = await signIn(E2E_USERS.reviewer2.email);
    const users = (await as(admin).get('/api/users').expect(200)).body as {
      id: string;
      email: string;
    }[];
    userIds = Object.fromEntries(users.map((user) => [user.email, user.id]));
  });

  afterAll(async () => {
    await app.close();
  });

  describe('transport security', () => {
    it('sends the standard security headers and hides the framework', async () => {
      const response = await request(server).get('/api/health');
      expect(response.headers['x-powered-by']).toBeUndefined();
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'");
      expect(response.headers['x-frame-options']).toBe('DENY');
    });

    it('refuses a state-changing request without the CSRF token (403)', async () => {
      await dev.agent.post('/api/notifications/read-all').expect(403);
    });

    it('rate-limits repeated failed sign-ins for one account (401 x5, then 429)', async () => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await request(server)
          .post('/api/auth/login')
          .send({ email: 'nobody@example.com', password: 'wrong-password' })
          .expect(401);
      }
      const limited = await request(server)
        .post('/api/auth/login')
        .send({ email: 'nobody@example.com', password: 'wrong-password' })
        .expect(429);
      expect(limited.body).toMatchObject({ code: 'RATE_LIMITED' });
    });

    it('rejects a sign-in from a foreign Origin', async () => {
      await request(server)
        .post('/api/auth/login')
        .set('Origin', 'https://evil.example')
        .send({ email: E2E_USERS.developer.email, password: E2E_PASSWORD })
        .expect(403);
    });

    it('stops honouring the access token as soon as its session is logged out', async () => {
      const session = await signIn(E2E_USERS.reviewer.email);
      const accessCookie = session.cookies.find((cookie) => cookie.startsWith('sdp_access='));
      expect(accessCookie).toBeDefined();
      await as(session).get('/api/auth/me').expect(200);
      await as(session).post('/api/auth/logout').expect(204);
      await request(server)
        .get('/api/auth/me')
        .set('Cookie', (accessCookie ?? '').split(';')[0] ?? '')
        .expect(401);
    });

    it('answers an oversized JSON body with 413 in the API error envelope', async () => {
      const response = await as(dev)
        .post('/api/notifications/read-all', { padding: 'x'.repeat(1_100_000) })
        .expect(413);
      expect(response.body).toMatchObject({ statusCode: 413, code: 'PAYLOAD_TOO_LARGE' });
    });
  });

  describe('catalog rules', () => {
    it('keeps the full (retired) checklist template for administrators', async () => {
      await as(dev).get('/api/checklist-template?scope=all').expect(403);
      await as(admin).get('/api/checklist-template?scope=all').expect(200);
      await as(dev).get('/api/checklist-template').expect(200);
      await as(dev).get('/api/checklist-questions').expect(403);
    });

    it('never accepts a customer code from the client, and needs a 6-digit colour', async () => {
      await as(admin)
        .post('/api/customers', { name: 'Code Clash', color: '#2563eb', code: 'X' })
        .expect(400);
      await as(admin).post('/api/customers', { name: 'Short Colour', color: '#abc' }).expect(400);
      const created = await as(admin)
        .post('/api/customers', { name: 'E2E Purge Me', color: '#16a34a' })
        .expect(201);
      const customerId = (created.body as { id: string; code: string }).id;
      expect((created.body as { code: string }).code).toBe('E2EPUR');
      await as(admin).patch(`/api/customers/${customerId}`, { code: 'NEW' }).expect(400);

      const missingReason = await as(superAdmin).delete(`/api/customers/${customerId}`).expect(422);
      expect(missingReason.body).toMatchObject({ code: 'REASON_REQUIRED' });
      await as(superAdmin)
        .delete(`/api/customers/${customerId}`, { reason: 'Created by the e2e suite' })
        .expect(204);
    });
  });

  describe('task workflow', () => {
    it('lets a developer create a task with a complete checklist', async () => {
      const customers = (await as(dev).get('/api/customers').expect(200)).body as {
        id: string;
        name: string;
      }[];
      const customer = customers.find(({ name }) => name === 'E2E Customer');
      const types = (await as(dev).get('/api/task-types').expect(200)).body as { id: string }[];
      const created = await as(dev)
        .post('/api/tasks', {
          customerId: customer?.id,
          crimId: 'CRIM-E2E-1',
          priority: 'Medium',
          taskTypeIds: [Number(types[0]?.id)],
          checklistAnswers: [
            { questionId: '00000000-0000-4000-8000-0000000e2e11', answer: 'Yes' },
            { questionId: '00000000-0000-4000-8000-0000000e2e12', answer: 'Yes' },
          ],
        })
        .expect(201);
      taskId = (created.body as { id: string }).id;
      expect(taskId).toMatch(/[0-9a-f-]{36}/);
    });

    it('validates attachments on their real bytes', async () => {
      const ok = await as(dev)
        .post(`/api/tasks/${taskId}/attachments`, {
          fileName: 'shot.png',
          mimeType: 'image/png',
          sizeBytes: 999_999,
          dataUrl: pngDataUrl,
        })
        .expect(201);
      // The stored size is the decoded size, not what the client claimed.
      expect((ok.body as { sizeBytes: number }[])[0]?.sizeBytes).toBe(PNG.length);

      const svg = await as(dev)
        .post(`/api/tasks/${taskId}/attachments`, {
          fileName: 'x.svg',
          mimeType: 'image/svg+xml',
          sizeBytes: 10,
          dataUrl: `data:image/svg+xml;base64,${Buffer.from('<svg/>').toString('base64')}`,
        })
        .expect(415);
      expect(svg.body).toMatchObject({ code: 'UNSUPPORTED_MEDIA_TYPE' });

      await as(dev)
        .post(`/api/tasks/${taskId}/attachments`, {
          fileName: 'x.png',
          mimeType: 'image/png',
          sizeBytes: 10,
          dataUrl: 'javascript:alert(1)',
        })
        .expect(422);
    });

    it('accepts an attachment over 1 MB on the upload route (route-scoped body limit)', async () => {
      const big = Buffer.concat([PNG, Buffer.alloc(1_500_000)]);
      await as(dev)
        .post(`/api/tasks/${taskId}/attachments`, {
          fileName: 'big.png',
          mimeType: 'image/png',
          sizeBytes: big.length,
          dataUrl: `data:image/png;base64,${big.toString('base64')}`,
        })
        .expect(201);
    });

    it('submits, and a reviewer picks it up', async () => {
      await as(dev).post(`/api/tasks/${taskId}/submit`).expect(200);
      await as(adminReviewer).post(`/api/tasks/${taskId}/pick`).expect(200);
      const second = await as(reviewer2).post(`/api/tasks/${taskId}/pick`).expect(409);
      expect(second.body).toMatchObject({ code: 'ALREADY_PICKED' });
    });

    it('blocks a Super Admin transfer to a reviewer who holds review work (409 with the tasks)', async () => {
      const targetId = userIds[E2E_USERS.adminReviewer.email];
      const response = await as(superAdmin)
        .post(`/api/users/${targetId ?? ''}/roles/transfer-super-admin`)
        .expect(409);
      expect(response.body).toMatchObject({ code: 'REVIEWER_HAS_PENDING_TASKS' });
      expect((response.body as { details: { tasks: { id: string }[] } }).details.tasks).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: taskId })]),
      );
    });

    it('validates review screenshots server-side', async () => {
      const comment = (screenshotUrl: string) => ({
        rank: null,
        comments: [
          {
            id: 'c-first',
            text: 'Rename the handler',
            createdAt: new Date().toISOString(),
            screenshots: [
              {
                id: 's1',
                fileName: 's1.png',
                sizeBytes: 1,
                mimeType: 'image/png',
                storageRef: screenshotUrl,
                comment: '',
                uploadedAt: new Date().toISOString(),
              },
            ],
          },
        ],
      });
      await as(adminReviewer)
        .put(`/api/tasks/${taskId}/review`, comment('javascript:alert(1)'))
        .expect(422);
      await as(adminReviewer).put(`/api/tasks/${taskId}/review`, comment(pngDataUrl)).expect(200);
    });

    it('protects a previous reviewer’s comments after a handover (403 on edit)', async () => {
      const draft = (await as(adminReviewer).get(`/api/tasks/${taskId}/review`).expect(200))
        .body as {
        comments: { id: string; text: string }[];
      };
      await as(adminReviewer)
        .post(`/api/tasks/${taskId}/handover`, {
          reason: 'Going on leave',
          draft: { ...draft, rank: null },
        })
        .expect(201);
      await as(reviewer2).post(`/api/tasks/${taskId}/pick`).expect(200);

      const current = (await as(reviewer2).get(`/api/tasks/${taskId}/review`).expect(200)).body as {
        comments: { id: string; text: string }[];
      };
      const edited = {
        ...current,
        rank: null,
        comments: current.comments.map((entry) => ({
          ...entry,
          text: 'Rewritten by someone else',
        })),
      };
      const refused = await as(reviewer2).put(`/api/tasks/${taskId}/review`, edited).expect(403);
      expect(refused.body).toMatchObject({ code: 'FORBIDDEN' });
      // Sending it back unchanged is fine.
      await as(reviewer2)
        .put(`/api/tasks/${taskId}/review`, { ...current, rank: null })
        .expect(200);
    });
  });

  describe('reviewer assignment and decisions', () => {
    let prisma: PrismaService;
    let reviewer: Session;
    let devReviewer: Session;
    let pickedTaskId = '';
    const commentIds = Array.from({ length: 10 }, () => randomUUID());

    async function createSubmittedTask(session: Session, crimId: string): Promise<string> {
      const customers = (await as(session).get('/api/customers').expect(200)).body as {
        id: string;
        name: string;
      }[];
      const types = (await as(session).get('/api/task-types').expect(200)).body as { id: string }[];
      const created = await as(session)
        .post('/api/tasks', {
          customerId: customers.find(({ name }) => name === 'E2E Customer')?.id,
          crimId,
          priority: 'Medium',
          taskTypeIds: [Number(types[0]?.id)],
          checklistAnswers: [
            { questionId: '00000000-0000-4000-8000-0000000e2e11', answer: 'Yes' },
            { questionId: '00000000-0000-4000-8000-0000000e2e12', answer: 'Yes' },
          ],
        })
        .expect(201);
      const id = (created.body as { id: string }).id;
      await as(session).post(`/api/tasks/${id}/submit`).expect(200);
      return id;
    }

    const draftWith = (ids: string[], rank: number | null) => ({
      rank,
      comments: ids.map((id, index) => ({
        id,
        reviewRound: 1,
        text: `Finding ${String(index + 1)}`,
        createdAt: new Date().toISOString(),
        screenshots: [],
      })),
    });

    const taskIds = (response: { body: unknown }) =>
      (response.body as { items: { id: string }[] }).items.map(({ id }) => id);

    beforeAll(async () => {
      prisma = app.get(PrismaService);
      reviewer = await signIn(E2E_USERS.reviewer.email);
      devReviewer = await signIn(E2E_USERS.devReviewer.email);
    });

    it('never lets a developer pick or be assigned their own task, even as a reviewer', async () => {
      const ownTaskId = await createSubmittedTask(devReviewer, 'CRIM-E2E-OWN');
      await as(devReviewer).post(`/api/tasks/${ownTaskId}/pick`).expect(403);
      const assigned = await as(admin).post(`/api/tasks/${ownTaskId}/assign`, {
        reviewerId: userIds[E2E_USERS.devReviewer.email],
      });
      expect(assigned.status).toBeGreaterThanOrEqual(400);
      expect(assigned.body).toMatchObject({ code: 'SELF_REVIEW' });

      const stored = await prisma.task.findUniqueOrThrow({ where: { id: ownTaskId } });
      expect(stored).toMatchObject({ status: 'SUBMITTED', currentReviewerId: null });
      expect(await prisma.taskReviewerAssignment.count({ where: { taskId: ownTaskId } })).toBe(0);
    });

    it('lets a reviewer pick someone else’s task exactly once (SELF_PICKED)', async () => {
      pickedTaskId = await createSubmittedTask(dev, 'CRIM-E2E-PICK');
      const reviewerId = userIds[E2E_USERS.reviewer.email];
      await as(dev).post(`/api/tasks/${pickedTaskId}/pick`).expect(403);

      const picked = await as(reviewer).post(`/api/tasks/${pickedTaskId}/pick`).expect(200);
      expect(picked.body).toMatchObject({ status: 'InReview', reviewerId });
      const current = await prisma.taskReviewerAssignment.findMany({
        where: { taskId: pickedTaskId, isCurrent: true },
      });
      expect(current).toEqual([
        expect.objectContaining({ reviewerId, assignmentType: 'SELF_PICKED' }),
      ]);

      expect(
        taskIds(await as(reviewer2).get('/api/tasks?scope=available').expect(200)),
      ).not.toContain(pickedTaskId);
      expect(taskIds(await as(reviewer).get('/api/tasks?scope=assigned').expect(200))).toContain(
        pickedTaskId,
      );
      const second = await as(reviewer2).post(`/api/tasks/${pickedTaskId}/pick`).expect(409);
      expect(second.body).toMatchObject({ code: 'ALREADY_PICKED' });
    });

    it('keeps the assignment history when an admin reassigns the review', async () => {
      const newReviewerId = userIds[E2E_USERS.adminReviewer.email];
      await as(admin)
        .post(`/api/tasks/${pickedTaskId}/assign`, {
          reviewerId: newReviewerId,
          reason: 'Balancing workload',
        })
        .expect(200);

      const assignments = await prisma.taskReviewerAssignment.findMany({
        where: { taskId: pickedTaskId },
        orderBy: { assignedAt: 'asc' },
      });
      expect(assignments[0]?.unassignedAt).toBeInstanceOf(Date);
      expect(assignments).toEqual([
        expect.objectContaining({ assignmentType: 'SELF_PICKED', isCurrent: false }),
        expect.objectContaining({
          reviewerId: newReviewerId,
          assignmentType: 'ADMIN_REASSIGNED',
          isCurrent: true,
        }),
      ]);
      expect(
        await prisma.taskStatusHistory.count({
          where: { taskId: pickedTaskId, newStatus: 'IN_REVIEW' },
        }),
      ).toBe(2);
    });

    it('records a Changes Requested decision with many comments in one transaction', async () => {
      const saved = (
        await as(adminReviewer)
          .put(`/api/tasks/${pickedTaskId}/review`, draftWith(commentIds, null))
          .expect(200)
      ).body as { comments: { id: string }[] };
      const reorderedComments = [...saved.comments].reverse();
      const reordered = reorderedComments.map(({ id }) => id);
      await as(adminReviewer)
        .post(`/api/tasks/${pickedTaskId}/review`, {
          decision: 'ChangesRequested',
          draft: { rank: 2, comments: reorderedComments },
        })
        .expect(200);

      const forms = await prisma.codeReviewForm.findMany({
        where: { taskId: pickedTaskId },
        include: { findings: { orderBy: { findingNo: 'asc' } } },
      });
      expect(forms).toHaveLength(1);
      expect(forms[0]).toMatchObject({ status: 'COMPLETED', decision: 'CHANGES_REQUESTED' });
      expect(forms[0]?.findings.map(({ id, findingNo }) => [id, findingNo])).toEqual(
        reordered.map((id, index) => [id, index + 1]),
      );
      expect(
        await prisma.taskStatusHistory.count({
          where: { taskId: pickedTaskId, newStatus: 'CHANGES_REQUESTED' },
        }),
      ).toBe(1);
      expect(
        await prisma.auditLog.count({
          where: { taskId: pickedTaskId, action: 'CHANGES_REQUESTED' },
        }),
      ).toBe(1);
    });

    it('resubmits a task with no handover history back to the requesting reviewer', async () => {
      for (const commentId of commentIds) {
        await as(dev)
          .post(`/api/tasks/${pickedTaskId}/responses`, { commentId, kind: 'Resolved' })
          .expect(200);
      }
      const resubmitted = await as(dev).post(`/api/tasks/${pickedTaskId}/submit`).expect(200);
      expect(resubmitted.body).toMatchObject({
        status: 'InReview',
        reviewerId: userIds[E2E_USERS.adminReviewer.email],
        handedOverByName: null,
      });
    });

    it('allows interactive transactions longer than the 5 s Prisma default', async () => {
      await expect(
        prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT pg_sleep(5.5)`;
          return 'committed';
        }),
      ).resolves.toBe('committed');
    }, 30_000);
  });

  describe('account changes', () => {
    it('sends a user whose email changes back to Invited and ends their sessions', async () => {
      const session = await signIn(E2E_USERS.devReviewer.email);
      await as(session).get('/api/auth/me').expect(200);
      const targetId = userIds[E2E_USERS.devReviewer.email] ?? '';

      const updated = await as(admin)
        .patch(`/api/users/${targetId}`, { email: 'e2e.devrev.new@example.com' })
        .expect(200);
      expect(updated.body).toMatchObject({ email: 'e2e.devrev.new@example.com', isActive: false });
      expect((updated.body as { inviteExpiresAt: string | null }).inviteExpiresAt).not.toBeNull();

      await as(session).get('/api/auth/me').expect(401);
      await request(server)
        .post('/api/auth/login')
        .send({ email: 'e2e.devrev.new@example.com', password: E2E_PASSWORD })
        .expect(401);
    });
  });
});
