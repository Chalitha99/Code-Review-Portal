// Must stay the first import: it points Prisma at the e2e database.
import { hasE2eDatabase } from './db-env.js';
import 'reflect-metadata';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module.ts';
import { configureApp } from '../../src/app.setup.ts';
import { PrismaService } from '../../src/prisma/prisma.service.ts';
import { EmailDispatcher } from '../../src/modules/notifications/email-dispatcher.service.ts';
import { PasswordLinksService } from '../../src/modules/password-links/password-links.service.ts';
import { E2E_PASSWORD, E2E_USERS } from '../../prisma/e2e-fixtures.ts';

/*
 * Invite, set-password, forgot-password, task-event email and injection
 * resistance, end to end on the disposable e2e database (never Neon):
 *
 *   npm run e2e:db:up -w @sdp/api && npm run e2e:db:reset -w @sdp/api
 *   E2E_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/sdp_e2e npm run test:e2e -w @sdp/api
 */
interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

const outbox = path.join(mkdtempSync(path.join(tmpdir(), 'sdp-mail-')), 'outbox.jsonl');
process.env['E2E_MAIL_OUTBOX'] = outbox;

const mails = (): Mail[] =>
  readFileSync(outbox, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Mail);
const linkTokenFor = (email: string) => {
  const mail = mails()
    .filter((entry) => entry.to === email && entry.text.includes('#token='))
    .at(-1);
  return /#token=([A-Za-z0-9_-]+)/.exec(mail?.text ?? '')?.[1] ?? '';
};

describe.skipIf(!hasE2eDatabase)('email delivery and password links (real database)', () => {
  let app: NestExpressApplication;
  let server: Server;
  let prisma: PrismaService;
  let admin: { agent: ReturnType<typeof request.agent>; csrf: string };
  const stamp = Date.now().toString(36);
  const invitee = `e2e.invitee.${stamp}@example.com`;
  const NEW_PASSWORD = 'Harbour-Lantern-Quiet-82!';

  async function signIn(email: string, password = E2E_PASSWORD) {
    const agent = request.agent(server);
    const response = await agent.post('/api/auth/login').send({ email, password }).expect(200);
    const cookies = ([] as string[]).concat(response.headers['set-cookie'] ?? []);
    return { agent, csrf: /sdp_csrf=([^;]+)/.exec(cookies.join(';'))?.[1] ?? '' };
  }
  const post = (session: typeof admin, url: string, body: object = {}) =>
    session.agent.post(url).set('X-CSRF-Token', session.csrf).send(body);

  async function counts() {
    const [row] = await prisma.$queryRaw<{ users: number; tasks: number; links: number }[]>`
      SELECT (SELECT count(*) FROM "users")::int AS users,
             (SELECT count(*) FROM "tasks")::int AS tasks,
             (SELECT count(*) FROM "password_links")::int AS links`;
    return row!;
  }

  beforeAll(async () => {
    writeFileSync(outbox, '');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
    configureApp(app);
    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
    app.get(PasswordLinksService).forgotMinResponseMs = 0;
    admin = await signIn(E2E_USERS.admin.email);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('invite → set password', () => {
    let token = '';

    it('creates the user and emails a #fragment link — never returning the token', async () => {
      const created = await post(admin, '/api/users', {
        name: 'E2E Invitee',
        email: invitee,
        roles: ['Developer'],
      }).expect(201);
      expect(created.body).toMatchObject({ status: 'INVITED', inviteEmailStatus: 'SENT' });

      token = linkTokenFor(invitee);
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(JSON.stringify(created.body)).not.toContain(token);
      const mail = mails().find((entry) => entry.to === invitee)!;
      expect(mail.html).toContain(`/set-password#token=${token}`);
      expect(mail.text).not.toMatch(/[?&]token=/);
    });

    it('validates without consuming the link', async () => {
      for (let i = 0; i < 2; i += 1) {
        const response = await request(server)
          .post('/api/auth/token/validate')
          .send({ token })
          .expect(200);
        expect(response.body).toMatchObject({ status: 'valid', purpose: 'INVITE' });
        expect(response.headers['cache-control']).toContain('no-store');
        expect(response.headers['referrer-policy']).toBe('no-referrer');
      }
    });

    it('rejects a weak password and keeps the link usable', async () => {
      const weak = await request(server)
        .post('/api/auth/set-password')
        .send({ token, newPassword: 'short' })
        .expect(422);
      expect(weak.body).toMatchObject({ code: 'PASSWORD_POLICY' });
      await request(server).post('/api/auth/token/validate').send({ token }).expect(200);
    });

    it('saves a valid password once, then the account signs in', async () => {
      await request(server)
        .post('/api/auth/set-password')
        .send({ token, newPassword: NEW_PASSWORD })
        .expect(200);
      await signIn(invitee, NEW_PASSWORD);
      const again = await request(server)
        .post('/api/auth/set-password')
        .send({ token, newPassword: NEW_PASSWORD })
        .expect(400);
      expect(again.body).toMatchObject({ code: 'TOKEN_INVALID' });
    });

    it('sends a "your account is ready" notice without the token', async () => {
      await app.get(PasswordLinksService).drainBackground();
      const notice = mails().find(
        (entry) => entry.to === invitee && entry.subject === 'Your account is ready',
      );
      expect(notice).toBeDefined();
      expect(notice?.text).not.toContain(token);
    });

    it('keeps the token out of the database and the audit trail', async () => {
      const leaks = await prisma.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM "audit_logs"
         WHERE coalesce("old_values"::text, '') || coalesce("new_values"::text, '') ||
               coalesce("metadata"::text, '') || coalesce("description", '') LIKE ${`%${token}%`}`;
      expect(leaks[0]?.n).toBe(0);
      const stored = await prisma.passwordLink.count({ where: { tokenHash: token } });
      expect(stored).toBe(0);
    });
  });

  describe('expiry and forgot password', () => {
    it('reports an expired link as expired and refuses it', async () => {
      const email = `e2e.expiring.${stamp}@example.com`;
      await post(admin, '/api/users', { name: 'E2E Expiring', email, roles: ['Developer'] }).expect(
        201,
      );
      const token = linkTokenFor(email);
      await prisma.$executeRaw`
        UPDATE "password_links" SET "expires_at" = now() - interval '1 minute'
         WHERE "user_id" = (SELECT "id" FROM "users" WHERE "email" = ${email})`;

      const validated = await request(server)
        .post('/api/auth/token/validate')
        .send({ token })
        .expect(200);
      expect(validated.body).toEqual({ status: 'expired', purpose: 'INVITE' });
      const refused = await request(server)
        .post('/api/auth/set-password')
        .send({ token, newPassword: NEW_PASSWORD })
        .expect(410);
      expect(refused.body).toMatchObject({ code: 'TOKEN_EXPIRED' });
    });

    it('answers a known and an unknown address identically', async () => {
      const known = await request(server)
        .post('/api/auth/forgot-password')
        .send({ email: invitee })
        .expect(202);
      const unknown = await request(server)
        .post('/api/auth/forgot-password')
        .send({ email: `nobody.${stamp}@example.com` })
        .expect(202);
      expect(known.body).toEqual(unknown.body);

      await app.get(PasswordLinksService).drainBackground();
      const reset = linkTokenFor(invitee);
      const validated = await request(server)
        .post('/api/auth/token/validate')
        .send({ token: reset })
        .expect(200);
      expect(validated.body).toMatchObject({ status: 'valid', purpose: 'RESET' });
    });
  });

  describe('task-event email', () => {
    it('queues the developer email with the pick and the dispatcher sends it', async () => {
      const dev = await signIn(E2E_USERS.developer.email);
      const reviewer = await signIn(E2E_USERS.reviewer.email);
      const customers = (await dev.agent.get('/api/customers').expect(200)).body as {
        id: string;
        name: string;
      }[];
      const types = (await dev.agent.get('/api/task-types').expect(200)).body as { id: string }[];
      const created = await post(dev, '/api/tasks', {
        customerId: customers.find(({ name }) => name === 'E2E Customer')?.id,
        crimId: `CRIM-MAIL-${stamp}`,
        priority: 'Medium',
        taskTypeIds: [Number(types[0]?.id)],
        checklistAnswers: [
          { questionId: '00000000-0000-4000-8000-0000000e2e11', answer: 'Yes' },
          { questionId: '00000000-0000-4000-8000-0000000e2e12', answer: 'Yes' },
        ],
      }).expect(201);
      const taskId = (created.body as { id: string }).id;
      await post(dev, `/api/tasks/${taskId}/submit`).expect(200);
      await post(reviewer, `/api/tasks/${taskId}/pick`).expect(200);

      const queued = await prisma.notification.findFirst({
        where: { taskId, emailStatus: { not: null } },
        select: { id: true, emailStatus: true, payload: true },
      });
      expect(queued?.emailStatus).toBe('PENDING');
      expect((queued?.payload as { event?: string } | null)?.event).toBe('TASK_PICKED');

      await app.get(EmailDispatcher).runOnce();
      const sent = await prisma.notification.findUnique({ where: { id: queued!.id } });
      expect(sent).toMatchObject({ emailStatus: 'SENT', emailSent: true });
      const mail = mails().find(
        (entry) =>
          entry.to === E2E_USERS.developer.email &&
          entry.subject.includes('picked up for review') &&
          entry.text.toUpperCase().includes(`CRIM-MAIL-${stamp}`.toUpperCase()),
      );
      expect(mail?.text).toContain(E2E_USERS.reviewer.name);
      expect(mail?.text).toContain('E2E Customer');
      expect(mail?.text).toMatch(/When: .*\(GMT[+-]/);

      const unrelated = await prisma.notification.count({
        where: { taskId, notificationType: 'TASK_SUBMITTED', emailStatus: { not: null } },
      });
      expect(unrelated).toBe(0);
    });
  });

  describe('injection resistance', () => {
    const payloads = [
      "' OR 1=1--",
      "'; DROP TABLE users;--",
      '" OR ""="',
      '1; SELECT pg_sleep(5)--',
      '\u0000',
      'x'.repeat(10_000),
    ];

    it('treats SQL-looking input on the public auth routes as plain data', async () => {
      const before = await counts();
      for (const value of payloads) {
        const validated = await request(server)
          .post('/api/auth/token/validate')
          .send({ token: value });
        expect(validated.status).toBeLessThan(500);
        if (validated.status === 200) expect(validated.body).toEqual({ status: 'invalid' });

        const set = await request(server)
          .post('/api/auth/set-password')
          .send({ token: value, newPassword: value });
        expect([400, 413, 422, 429]).toContain(set.status);

        const forgot = await request(server)
          .post('/api/auth/forgot-password')
          .send({ email: value });
        expect([202, 400, 413, 429]).toContain(forgot.status);
        await request(server).post('/api/auth/resend-link').send({ token: value });
      }
      for (const odd of [{ token: { $gt: '' } }, { token: ['a', 'b'] }, { token: 42 }]) {
        const response = await request(server).post('/api/auth/token/validate').send(odd);
        expect(response.status).toBeLessThan(500);
        if (response.status === 200) expect(response.body).toEqual({ status: 'invalid' });
      }
      await app.get(PasswordLinksService).drainBackground();
      expect(await counts()).toEqual(before);
    }, 60_000);

    it('stores a name containing SQL exactly as typed, and rejects a malformed email', async () => {
      const name = "Robert'); DROP TABLE users;-- <b>";
      const email = `e2e.bobby.${stamp}@example.com`;
      const created = await post(admin, '/api/users', { name, email, roles: ['Developer'] }).expect(
        201,
      );
      expect((created.body as { name: string }).name).toBe(name);
      const mail = mails().find((entry) => entry.to === email)!;
      expect(mail.html).toContain('Robert&#39;); DROP TABLE users;-- &lt;b&gt;');
      expect(mail.html).not.toContain('<b>');

      for (const bad of ["x' OR '1'='1@example.com", 'a@b.c\r\nBcc: x@y.z', '<script>@x.com']) {
        await post(admin, '/api/users', { name: 'Bad', email: bad, roles: ['Developer'] }).expect(
          400,
        );
      }
      expect(await prisma.user.count()).toBeGreaterThan(0);
    });
  });
});
