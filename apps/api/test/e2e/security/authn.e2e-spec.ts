import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { E2E_PASSWORD, E2E_USERS } from '../../../prisma/e2e-fixtures.ts';
import { hasE2eDatabase, startHarness, type Harness, type Session } from './security-harness.ts';

/**
 * VAPT regression suite: authentication and session integrity, including the
 * SDP-VAPT-004 device-cookie lockout fix.
 */
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');

/** Reads a cookie's value out of a Set-Cookie list, or throws if absent. */
function cookieValue(cookies: string[], name: string): string {
  const entry = cookies.find((c) => c.startsWith(`${name}=`));
  if (!entry) throw new Error(`cookie ${name} not set`);
  return entry.slice(name.length + 1).split(';')[0] ?? '';
}

describe.skipIf(!hasE2eDatabase)('VAPT: authentication', () => {
  let h: Harness;
  let dev: Session;

  beforeAll(async () => {
    h = await startHarness();
    dev = await h.signIn(E2E_USERS.developer.email);
  });
  afterAll(async () => {
    await h.app.close();
  });

  it('issues HttpOnly SameSite=Lax session cookies and a JS-readable CSRF cookie', () => {
    const byName = (n: string) => dev.cookies.find((c) => c.startsWith(`${n}=`)) ?? '';
    expect(byName('sdp_access')).toMatch(/HttpOnly/i);
    expect(byName('sdp_access')).toMatch(/SameSite=Lax/i);
    expect(byName('sdp_refresh')).toMatch(/Path=\/api\/auth/i);
    expect(byName('sdp_csrf')).not.toMatch(/HttpOnly/i);
  });

  it('pins HS256 and rejects alg=none, HS512, tampered and test-fallback tokens', async () => {
    const [header = '', payload = '', sig = ''] = cookieValue(dev.cookies, 'sdp_access').split('.');
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Record<
      string,
      unknown
    >;
    const forgeHs = (alg: string, key: string) => {
      const data = `${b64({ alg, typ: 'JWT' })}.${b64(claims)}`;
      return `${data}.${createHmac(alg === 'HS512' ? 'sha512' : 'sha256', key)
        .update(data)
        .digest('base64url')}`;
    };
    const tokens = {
      none: `${b64({ alg: 'none', typ: 'JWT' })}.${payload}.`,
      tampered: `${header}.${b64({ ...claims, exp: Number(claims['exp']) + 3600 })}.${sig}`,
      hs512: forgeHs('HS512', 'x'.repeat(40)),
      testSecret: forgeHs('HS256', 'jwt_access_secret-test-only-secret-32-chars'),
    };
    for (const token of Object.values(tokens)) {
      await request(h.server).get('/api/auth/me').set('Cookie', `sdp_access=${token}`).expect(401);
    }
  });

  it('rejects a refresh token presented as an access token', async () => {
    const refresh = cookieValue(dev.cookies, 'sdp_refresh');
    await request(h.server).get('/api/auth/me').set('Cookie', `sdp_access=${refresh}`).expect(401);
  });

  it('rotates the refresh token and detects replay of a spent one', async () => {
    const s = await h.signIn(E2E_USERS.reviewer.email);
    const refresh = cookieValue(s.cookies, 'sdp_refresh');
    const csrf = s.csrf;
    const cookie = `sdp_refresh=${refresh}; sdp_csrf=${csrf}`;
    // Raw cookies (not the auto-rotating agent jar) so we can replay the exact
    // spent token. First rotates; the replay of the same token is rejected.
    const first = await request(h.server)
      .post('/api/auth/refresh')
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrf);
    expect(first.status).toBe(200);
    const replay = await request(h.server)
      .post('/api/auth/refresh')
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrf);
    expect(replay.status).toBe(401);
  });

  it('requires the CSRF token on refresh and logout', async () => {
    await request(h.server).post('/api/auth/refresh').set('Cookie', 'sdp_refresh=x').expect(403);
  });

  it('returns one generic 401 for wrong password and unknown account alike', async () => {
    const wrong = await request(h.server)
      .post('/api/auth/login')
      .send({ email: E2E_USERS.admin.email, password: 'Definitely-Wrong-1!' });
    const unknown = await request(h.server)
      .post('/api/auth/login')
      .send({ email: 'ghost@example.com', password: 'Definitely-Wrong-1!' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect((wrong.body as { code: string }).code).toBe((unknown.body as { code: string }).code);
  });

  it('blocks login-CSRF: a cross-site form/text-plain POST is refused', async () => {
    await request(h.server)
      .post('/api/auth/login')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .set('Origin', 'https://evil.example')
      .send(`email=${E2E_USERS.developer.email}&password=${E2E_PASSWORD}`)
      .expect(403);
  });

  it('stops honouring the access token immediately after logout', async () => {
    const s = await h.signIn(E2E_USERS.reviewer2.email);
    const access = cookieValue(s.cookies, 'sdp_access');
    await h.as(s).post('/api/auth/logout').expect(204);
    await request(h.server).get('/api/auth/me').set('Cookie', `sdp_access=${access}`).expect(401);
  });

  it('issues an HttpOnly, SameSite=Strict device cookie scoped to the login route', () => {
    const device = dev.cookies.find((c) => c.startsWith('sdp_device=')) ?? '';
    expect(device).toMatch(/HttpOnly/i);
    expect(device).toMatch(/SameSite=Strict/i);
    expect(device).toMatch(/Path=\/api\/auth\/login/i);
  });

  // SDP-VAPT-004 (remediated): failures from an attacker still lock the account
  // for unknown browsers, but not for a browser that signed in to it before.
  it('SDP-VAPT-004: a known account cannot be locked out by an attacker', async () => {
    const victim = E2E_USERS.adminReviewer.email;
    const first = await h.signIn(victim);
    const device = cookieValue(first.cookies, 'sdp_device');
    const login = (cookie?: string) => {
      const req = request(h.server).post('/api/auth/login');
      if (cookie) req.set('Cookie', `sdp_device=${cookie}`);
      return req.send({ email: victim, password: E2E_PASSWORD });
    };
    for (let i = 0; i < 6; i += 1) {
      await request(h.server)
        .post('/api/auth/login')
        .send({ email: victim, password: `Wrong-${String(i)}!xZ` });
    }
    expect((await login()).status).toBe(429);
    expect((await login(`${device}x`)).status).toBe(429);
    expect((await login(cookieValue(dev.cookies, 'sdp_device'))).status).toBe(429);
    expect((await login(device)).status).toBe(200);
  });
});
