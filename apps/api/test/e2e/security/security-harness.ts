// Must stay the first import: it points Prisma at the e2e database.
import { hasE2eDatabase } from '../db-env.js';
import 'reflect-metadata';
import type { Server } from 'node:http';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { argon2id, hash } from 'argon2';
import { AppModule } from '../../../src/app.module.ts';
import { configureApp } from '../../../src/app.setup.ts';
import { PrismaService } from '../../../src/prisma/prisma.service.ts';
import { E2E_PASSWORD } from '../../../prisma/e2e-fixtures.ts';

/**
 * Shared bootstrap for the VAPT regression suites. Boots the real Nest app
 * against the disposable e2e database, exactly as production runs it
 * (`configureApp`), and gives each role a cookie-jar agent that attaches the
 * double-submit CSRF token on writes. Suites skip when E2E_DATABASE_URL is
 * unset, like the other e2e specs (see docs/security/vapt/retest-instructions.md).
 */
export { hasE2eDatabase };

export interface Session {
  agent: ReturnType<typeof request.agent>;
  csrf: string;
  cookies: string[];
  user: { id: string; email: string; roles: string[] };
}

export interface Harness {
  app: NestExpressApplication;
  server: Server;
  signIn: (email: string, password?: string) => Promise<Session>;
  as: (session: Session) => {
    get: (path: string) => request.Test;
    post: (path: string, body?: object) => request.Test;
    put: (path: string, body: object) => request.Test;
    patch: (path: string, body: object) => request.Test;
    delete: (path: string, body?: object) => request.Test;
  };
}

export async function startHarness(): Promise<Harness> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
  configureApp(app);
  await app.init();
  const server: Server = app.getHttpServer();

  const signIn = async (email: string, password: string = E2E_PASSWORD): Promise<Session> => {
    const agent = request.agent(server);
    const response = await agent.post('/api/auth/login').send({ email, password }).expect(200);
    const cookies = ([] as string[]).concat(response.headers['set-cookie'] ?? []);
    const csrf = /sdp_csrf=([^;]+)/.exec(cookies.join(';'))?.[1] ?? '';
    const body = response.body as { id: string; email: string; roles: string[] };
    return { agent, csrf, cookies, user: body };
  };

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

  return { app, server, signIn, as };
}

/**
 * An ACTIVE developer owned by these suites only, so other e2e files that edit
 * the shared seed accounts (e.g. workflow changes `e2e.devrev`'s email) cannot
 * break them when the suites run in sequence on one database.
 */
export async function ensureSecurityDeveloper(h: Harness): Promise<string> {
  const email = 'e2e.vapt.devb@example.com';
  const prisma = h.app.get(PrismaService);
  const passwordHash = await hash(E2E_PASSWORD, {
    type: argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, status: 'ACTIVE', deletedAt: null },
    create: { email, fullName: 'E2E VAPT Developer B', passwordHash, status: 'ACTIVE' },
  });
  const role = await prisma.role.findUniqueOrThrow({ where: { code: 'DEVELOPER' } });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    update: {},
    create: { userId: user.id, roleId: role.id },
  });
  return email;
}

const CHECKLIST_ANSWERS = [
  { questionId: '00000000-0000-4000-8000-0000000e2e11', answer: 'Yes' },
  { questionId: '00000000-0000-4000-8000-0000000e2e12', answer: 'Yes' },
];

let crimCounter = 0;

/** Creates a DRAFT task owned by `session`'s developer and returns its id. */
export async function createDraft(h: Harness, session: Session): Promise<string> {
  const customers = (await h.as(session).get('/api/customers').expect(200)).body as {
    id: string;
    name: string;
  }[];
  const types = (await h.as(session).get('/api/task-types').expect(200)).body as { id: string }[];
  const customerId = (customers.find((c) => c.name === 'E2E Customer') ?? customers[0])?.id;
  crimCounter += 1;
  const created = await h
    .as(session)
    .post('/api/tasks', {
      customerId,
      crimId: `CRIM-SEC-${String(Date.now()).slice(-5)}-${String(crimCounter)}`,
      priority: 'Medium',
      taskTypeIds: [Number(types[0]?.id)],
      checklistAnswers: CHECKLIST_ANSWERS,
    })
    .expect(201);
  return (created.body as { id: string }).id;
}

/** Creates a task and submits it, leaving it in the open review pool. */
export async function createSubmitted(h: Harness, session: Session): Promise<string> {
  const id = await createDraft(h, session);
  await h.as(session).post(`/api/tasks/${id}/submit`).expect(200);
  return id;
}
