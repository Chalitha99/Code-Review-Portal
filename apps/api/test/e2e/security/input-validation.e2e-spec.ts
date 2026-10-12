import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { E2E_USERS } from '../../../prisma/e2e-fixtures.ts';
import {
  createDraft,
  hasE2eDatabase,
  startHarness,
  type Harness,
  type Session,
} from './security-harness.ts';

/**
 * VAPT regression suite: input handling, transport and upload validation.
 * SDP-VAPT-006 (NUL byte -> 500) is encoded as `it.fails`.
 */
const PNG_DATA_URL =
  'data:image/png;base64,' +
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]).toString('base64');

describe.skipIf(!hasE2eDatabase)('VAPT: input and transport', () => {
  let h: Harness;
  let dev: Session;

  beforeAll(async () => {
    h = await startHarness();
    dev = await h.signIn(E2E_USERS.developer.email);
  });
  afterAll(async () => {
    await h.app.close();
  });

  it('does not reflect Access-Control-Allow-Origin to a foreign origin', async () => {
    const res = await h.as(dev).get('/api/auth/me').set('Origin', 'https://evil.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('keeps Swagger and framework details off', async () => {
    await request(h.server).get('/api/docs').expect(404);
    await request(h.server).get('/api/docs-json').expect(404);
    const res = await request(h.server).get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('rejects malformed JSON and oversized bodies with a safe envelope', async () => {
    const bad = await h
      .as(dev)
      .post('/api/notifications/read-all')
      .set('Content-Type', 'application/json')
      .send('{"a":');
    expect(bad.status).toBe(400);
    expect(bad.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    // An anonymous caller cannot unlock the large body parser with a forged cookie.
    const big = Buffer.concat([
      Buffer.from('{"x":"'),
      Buffer.alloc(9 * 1024 * 1024, 0x61),
      Buffer.from('"}'),
    ]);
    await request(h.server)
      .post('/api/tasks/00000000-0000-4000-8000-000000000001/attachments')
      .set('Cookie', 'sdp_access=forged')
      .set('Content-Type', 'application/json')
      .send(big)
      .expect(413);
  });

  it('treats SQL/NoSQL-shaped login input as plain data', async () => {
    await request(h.server)
      .post('/api/auth/login')
      .send({ email: { $ne: null }, password: { $ne: null } })
      .expect(400);
    // The injection string is not a valid email, so the DTO rejects it (400)
    // before it reaches any query; a well-formed address with an injection
    // payload password fails as ordinary bad credentials (401), never a 500.
    await request(h.server)
      .post('/api/auth/login')
      .send({ email: "e2e.dev@example.com' OR '1'='1", password: "' OR '1'='1" })
      .expect(400);
    await request(h.server)
      .post('/api/auth/login')
      .send({ email: 'e2e.dev@example.com', password: "anything' OR '1'='1" })
      .expect(401);
  });

  it('validates uploaded images on decoded bytes, not the declared type', async () => {
    const task = await createDraft(h, dev);
    const reject = async (dataUrl: string) =>
      (await h.as(dev).post(`/api/tasks/${task}/attachments`, { fileName: 'x.png', dataUrl }))
        .status;
    expect(
      await reject(
        'data:image/svg+xml;base64,' + Buffer.from('<svg onload=alert(1)/>').toString('base64'),
      ),
    ).toBe(415);
    expect(await reject('javascript:alert(1)')).toBe(422);
    expect(await reject('https://evil.example/x.png')).toBe(422);
    expect(
      await reject(
        'data:image/png;base64,' +
          Buffer.from('<html><script>1</script></html>').toString('base64'),
      ),
    ).toBe(415);
    await h
      .as(dev)
      .post(`/api/tasks/${task}/attachments`, { fileName: 'ok.png', dataUrl: PNG_DATA_URL })
      .expect(201);
    await h.as(dev).delete(`/api/tasks/${task}`).expect(204);
  });

  // SDP-VAPT-006: a NUL byte in a free-text field reaches PostgreSQL and raises
  // a 500 instead of a clean 4xx. Strip/reject control characters at the DTO
  // boundary, then flip to `it` (expect 400/422).
  it.fails('SDP-VAPT-006: a NUL byte in a text field is a clean client error', async () => {
    const task = await createDraft(h, dev);
    const res = await h
      .as(dev)
      .post(`/api/tasks/${task}/attachments`, { fileName: 'a\u0000b.png', dataUrl: PNG_DATA_URL });
    expect(res.status).toBeLessThan(500);
    await h.as(dev).delete(`/api/tasks/${task}`);
  });
});
