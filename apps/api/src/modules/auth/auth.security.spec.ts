import { describe, expect, it, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { argon2id, hash, verify } from 'argon2';
import { RateLimiterService } from '../../common/rate-limiter.service.js';
import { AuthService, LOGIN_ATTEMPTS_PER_EMAIL } from './auth.service.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';

// Wraps the real argon2 `verify` so a test can count the hash work done.
vi.mock('argon2', async (importOriginal) => {
  const actual = await importOriginal<typeof import('argon2')>();
  return { ...actual, verify: vi.fn(actual.verify) };
});

const config = { get: vi.fn((key: string) => (key === 'nodeEnv' ? 'test' : undefined)) };
const jwt = { signAsync: vi.fn().mockResolvedValue('signed-token') };

async function activeUser(password: string) {
  return {
    id: 'u1',
    email: 'dev@example.com',
    fullName: 'Dev',
    status: 'ACTIVE',
    passwordHash: await hash(password, {
      type: argon2id,
      memoryCost: 1024,
      timeCost: 1,
      parallelism: 1,
    }),
    createdAt: new Date('2026-01-01T00:00:00Z'),
    userRoles: [{ role: { code: 'DEVELOPER' } }],
  };
}

function service(user: unknown) {
  const prisma = {
    user: { findFirst: vi.fn().mockResolvedValue(user), update: vi.fn().mockResolvedValue({}) },
    refreshSession: { create: vi.fn().mockResolvedValue({}) },
  };
  return {
    prisma,
    auth: new AuthService(prisma as never, jwt as never, config as never, new RateLimiterService()),
  };
}

describe('AuthService sign-in hardening', () => {
  it('normalises the email and signs in with the right password', async () => {
    const { auth, prisma } = service(await activeUser('correct horse'));
    await expect(
      auth.login(
        { email: 'dev@example.com', password: 'correct horse' },
        { ipAddress: '10.0.0.1' },
      ),
    ).resolves.toMatchObject({ user: { email: 'dev@example.com' } });
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'dev@example.com', deletedAt: null } }),
    );
  });

  it(`locks an account out after ${String(LOGIN_ATTEMPTS_PER_EMAIL)} attempts, even with the right password`, async () => {
    const { auth } = service(await activeUser('correct horse'));
    for (let attempt = 0; attempt < LOGIN_ATTEMPTS_PER_EMAIL; attempt += 1) {
      await expect(
        auth.login(
          { email: 'dev@example.com', password: 'wrong' },
          { ipAddress: `10.0.0.${String(attempt)}` },
        ),
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', status: 401 });
    }
    await expect(
      auth.login(
        { email: 'dev@example.com', password: 'correct horse' },
        { ipAddress: '10.9.9.9' },
      ),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED', status: 429 });
  });

  it('keeps a previously signed-in device usable while the account is locked for others', async () => {
    const { auth } = service(await activeUser('correct horse'));
    const { deviceToken } = await auth.login(
      { email: 'dev@example.com', password: 'correct horse' },
      { ipAddress: '10.1.1.1' },
    );
    for (let attempt = 0; attempt < LOGIN_ATTEMPTS_PER_EMAIL; attempt += 1) {
      await expect(
        auth.login({ email: 'dev@example.com', password: 'wrong' }, { ipAddress: '10.0.0.9' }),
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    }
    await expect(
      auth.login(
        { email: 'dev@example.com', password: 'correct horse' },
        { ipAddress: '10.0.0.9' },
      ),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED', status: 429 });
    await expect(
      auth.login(
        { email: 'dev@example.com', password: 'correct horse' },
        { ipAddress: '10.1.1.1', deviceToken },
      ),
    ).resolves.toMatchObject({ user: { email: 'dev@example.com' } });
  });

  it('ignores a device token issued to another account or tampered with', async () => {
    const other = service({ ...(await activeUser('other pass')), email: 'other@example.com' });
    const { deviceToken } = await other.auth.login(
      { email: 'other@example.com', password: 'other pass' },
      {},
    );
    const { auth } = service(await activeUser('correct horse'));
    for (let attempt = 0; attempt < LOGIN_ATTEMPTS_PER_EMAIL; attempt += 1) {
      await expect(
        auth.login({ email: 'dev@example.com', password: 'wrong' }, {}),
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    }
    for (const token of [deviceToken, `${deviceToken}x`, 'a.b']) {
      await expect(
        auth.login({ email: 'dev@example.com', password: 'correct horse' }, { deviceToken: token }),
      ).rejects.toMatchObject({ code: 'RATE_LIMITED', status: 429 });
    }
  });

  it('does the same argon2 work for an unknown email as for a wrong password', async () => {
    vi.mocked(verify).mockClear();
    const { auth } = service(null);
    await expect(
      auth.login({ email: 'nobody@example.com', password: 'guess' }, {}),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(verify).toHaveBeenCalledTimes(1);
  });

  it('gives an invited account (no password yet) the same generic failure', async () => {
    const { auth } = service({ ...(await activeUser('x')), status: 'INVITED', passwordHash: null });
    await expect(
      auth.login({ email: 'dev@example.com', password: 'anything' }, {}),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', status: 401 });
  });
});

describe('JwtStrategy session binding', () => {
  function strategy(session: unknown) {
    const prisma = { refreshSession: { findFirst: vi.fn().mockResolvedValue(session) } };
    const configWithSecret = {
      get: vi.fn((key: string) => (key === 'JWT_ACCESS_SECRET' ? 's'.repeat(32) : undefined)),
    };
    return { prisma, jwtStrategy: new JwtStrategy(configWithSecret as never, prisma as never) };
  }
  const payload = { sub: 'u1', sid: 's1', typ: 'access' as const, jti: 'j', iss: 'i', aud: 'a' };

  it('rejects an access token whose session was revoked (logout, password reset, email change)', async () => {
    const { jwtStrategy, prisma } = strategy(null);
    await expect(jwtStrategy.validate(payload)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.refreshSession.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 's1', userId: 'u1', revokedAt: null }),
      }),
    );
  });

  it('accepts a live session of an active user', async () => {
    const { jwtStrategy } = strategy({
      user: {
        id: 'u1',
        email: 'dev@example.com',
        fullName: 'Dev',
        status: 'ACTIVE',
        createdAt: new Date(),
        userRoles: [{ role: { code: 'DEVELOPER' } }],
      },
    });
    await expect(jwtStrategy.validate(payload)).resolves.toMatchObject({
      id: 'u1',
      sessionId: 's1',
    });
  });
});
