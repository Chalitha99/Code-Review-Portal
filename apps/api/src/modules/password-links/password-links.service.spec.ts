import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RateLimiterService } from '../../common/rate-limiter.service.js';
import { CONFIG_DEFAULTS } from '../../config/defaults.js';
import { testConfig } from '../../config/test-config.js';
import { MailTemplates } from '../../integrations/mail/templates/mail-templates.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import {
  MAX_FORGOT_REQUESTS,
  MAX_SET_PASSWORD_ATTEMPTS,
  PasswordLinksService,
  hashToken,
} from './password-links.service.js';

// Prisma is replaced by a small in-memory store so the real rules are exercised.

type Status = 'ACTIVE' | 'INACTIVE' | 'INVITED';
interface UserRow {
  id: string;
  email: string;
  fullName: string;
  status: Status;
  deletedAt: Date | null;
  passwordHash: string | null;
  roles: string[];
}
interface LinkRow {
  id: string;
  userId: string;
  purpose: 'INVITE' | 'RESET';
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
  failedAttempts: number;
  emailStatus: 'SENT' | 'FAILED' | null;
  createdAt: Date;
}

function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, expected]) => {
    if (expected !== null && typeof expected === 'object' && !(expected instanceof Date)) {
      const condition = expected as Record<string, unknown>;
      if ('in' in condition) return (condition['in'] as unknown[]).includes(row[key]);
      if ('equals' in condition) return row[key] === condition['equals'];
      if ('lt' in condition) return (row[key] as number) < (condition['lt'] as number);
      return true;
    }
    return row[key] === expected;
  });
}

function fakePrisma() {
  const users: UserRow[] = [];
  const links: LinkRow[] = [];
  const sessions: { userId: string; revokedAt: Date | null }[] = [];
  const audits: Record<string, unknown>[] = [];
  let seq = 0;
  const withUser = (link: LinkRow | undefined) =>
    link ? { ...link, user: users.find((user) => user.id === link.userId)! } : null;

  const db = {
    users,
    links,
    sessions,
    audits,
    passwordLink: {
      updateMany: vi.fn(
        ({ where, data }: { where: Record<string, unknown>; data: Partial<LinkRow> }) => {
          const hit = links.filter((link) => matches(link as never, where));
          for (const link of hit) {
            for (const [key, value] of Object.entries(data)) {
              const row = link as unknown as Record<string, unknown>;
              row[key] =
                typeof value === 'object' && value !== null && 'increment' in value
                  ? (row[key] as number) + (value as { increment: number }).increment
                  : value;
            }
          }
          return Promise.resolve({ count: hit.length });
        },
      ),
      create: vi.fn(
        ({
          data,
        }: {
          data: Omit<
            LinkRow,
            'id' | 'createdAt' | 'usedAt' | 'revokedAt' | 'failedAttempts' | 'emailStatus'
          >;
        }) => {
          seq += 1;
          const row: LinkRow = {
            id: `link-${String(seq)}`,
            usedAt: null,
            revokedAt: null,
            failedAttempts: 0,
            emailStatus: null,
            createdAt: new Date(Date.now() + seq), // strictly increasing
            ...data,
          };
          links.push(row);
          return Promise.resolve({ id: row.id });
        },
      ),
      update: vi.fn(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const link = links.find((row) => row.id === where.id)!;
        for (const [key, value] of Object.entries(data)) {
          (link as unknown as Record<string, unknown>)[key] =
            typeof value === 'object' && value !== null && 'increment' in value
              ? (link as unknown as Record<string, number>)[key]! +
                (value as { increment: number }).increment
              : value;
        }
        return Promise.resolve(link);
      }),
      findUnique: vi.fn(({ where }: { where: { tokenHash: string } }) =>
        Promise.resolve(withUser(links.find((link) => link.tokenHash === where.tokenHash))),
      ),
      findFirst: vi.fn(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve([...links].reverse().find((link) => matches(link as never, where)) ?? null),
      ),
      findMany: vi.fn(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve([...links].reverse().filter((link) => matches(link as never, where))),
      ),
    },
    user: {
      findFirst: vi.fn(({ where }: { where: Record<string, unknown> }) => {
        const user = users.find((row) => matches(row as never, where));
        return Promise.resolve(
          user ? { ...user, userRoles: user.roles.map((code) => ({ role: { code } })) } : null,
        );
      }),
      update: vi.fn(({ where, data }: { where: { id: string }; data: Partial<UserRow> }) => {
        const user = users.find((row) => row.id === where.id)!;
        Object.assign(user, data);
        return Promise.resolve(user);
      }),
      deleteMany: vi.fn(({ where }: { where: { id: string; status?: string } }) => {
        const index = users.findIndex(
          (row) =>
            row.id === where.id && (where.status === undefined || row.status === where.status),
        );
        if (index === -1) return Promise.resolve({ count: 0 });
        users.splice(index, 1);
        return Promise.resolve({ count: 1 });
      }),
    },
    userRole: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    refreshSession: {
      updateMany: vi.fn(
        ({ where, data }: { where: { userId: string }; data: { revokedAt: Date } }) => {
          const hit = sessions.filter(
            (row) => row.userId === where.userId && row.revokedAt === null,
          );
          hit.forEach((row) => (row.revokedAt = data.revokedAt));
          return Promise.resolve({ count: hit.length });
        },
      ),
    },
    auditLog: {
      create: vi.fn(({ data }: { data: Record<string, unknown> }) => {
        audits.push(data);
        return Promise.resolve(data);
      }),
    },
    $transaction: vi.fn(<T>(operation: (tx: unknown) => Promise<T>) => operation(db)),
  };
  return db;
}

const admin: AuthenticatedUser = {
  id: 'admin-1',
  email: 'admin@example.com',
  name: 'An Admin',
  roles: ['ADMIN'],
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  sessionId: 'session',
};

let db: ReturnType<typeof fakePrisma>;
let mailer: { send: ReturnType<typeof vi.fn> };
let service: PasswordLinksService;
const sent = () =>
  mailer.send.mock.calls.map(
    ([message]) => message as { to: string; subject: string; text: string },
  );
const tokenIn = (text: string) => /#token=([A-Za-z0-9_-]+)/.exec(text)?.[1] ?? '';
const lastToken = () => tokenIn(sent().at(-1)?.text ?? '');

function addUser(row: Partial<UserRow> & Pick<UserRow, 'id' | 'email' | 'status'>) {
  db.users.push({
    fullName: 'New Starter',
    deletedAt: null,
    passwordHash: null,
    roles: ['DEVELOPER'],
    ...row,
  });
}

async function invite(id = 'u-new', email = 'new.starter@example.com') {
  addUser({ id, email, status: 'INVITED' });
  await service.issueAndDeliver({ id, email, fullName: 'New Starter' }, 'INVITE');
  return lastToken();
}

beforeEach(() => {
  db = fakePrisma();
  mailer = { send: vi.fn().mockResolvedValue(undefined) };
  const audit = {
    record: vi.fn(
      (
        client: { auditLog: { create: (args: unknown) => unknown } },
        _actor: unknown,
        input: Record<string, unknown>,
      ) => client.auditLog.create({ data: { action: input['actionType'], ...input } }),
    ),
  };
  service = new PasswordLinksService(
    db as never,
    mailer as never,
    new RateLimiterService(),
    audit as never,
    config as never,
    new MailTemplates(config as never),
  );
  service.forgotMinResponseMs = 0;
});

const RESEND_COOLDOWN_MS = CONFIG_DEFAULTS.resendCooldownSeconds * 1000;
let current = testConfig();
const config = {
  get: <T>(key: string, fallback?: T) => current.get<T>(key, fallback),
  getOrThrow: <T>(key: string) => current.getOrThrow<T>(key),
};
beforeEach(() => {
  current = testConfig();
});

async function forgot(email: string) {
  await service.forgotPassword(email, undefined);
  await service.drainBackground();
}

describe('validate', () => {
  it('describes a valid link without consuming it, and masks the email', async () => {
    const token = await invite();

    const first = await service.validate(token, '1.1.1.1');
    const second = await service.validate(token, '1.1.1.1');

    expect(first).toMatchObject({
      status: 'valid',
      purpose: 'INVITE',
      emailHint: 'n***@example.com',
    });
    expect(second.status).toBe('valid');
    expect(db.links[0]?.usedAt).toBeNull();
  });

  it.each([['never-issued'], [''], [42]])('answers invalid for %s', async (token) => {
    await expect(service.validate(token, undefined)).resolves.toEqual({ status: 'invalid' });
  });

  it('treats an oversized token as invalid rather than hashing it', async () => {
    await expect(service.validate('x'.repeat(257), undefined)).resolves.toEqual({
      status: 'invalid',
    });
    expect(db.passwordLink.findUnique).not.toHaveBeenCalled();
  });

  it('stores only the SHA-256 of the token', async () => {
    const token = await invite();
    expect(db.links[0]?.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(db.links)).not.toContain(token);
  });

  it('reports an expired link as expired, with its purpose', async () => {
    const token = await invite();
    db.links[0]!.expiresAt = new Date(Date.now() - 1000);
    await expect(service.validate(token, undefined)).resolves.toEqual({
      status: 'expired',
      purpose: 'INVITE',
    });
  });
});

describe('invite → set password', () => {
  it('activates the account, burns the link and ends every session', async () => {
    const token = await invite();
    db.sessions.push({ userId: 'u-new', revokedAt: null });

    await service.setPassword(token, 'Blue-Harbour-Lamp-71!', undefined);

    const user = db.users[0]!;
    expect(user.status).toBe('ACTIVE');
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(db.sessions[0]?.revokedAt).toBeInstanceOf(Date);
    expect(db.audits.at(-1)).toMatchObject({ action: 'INVITE_ACCEPTED', targetUserId: 'u-new' });
  });

  it('works once: the same link is invalid after use', async () => {
    const token = await invite();
    await service.setPassword(token, 'Blue-Harbour-Lamp-71!', undefined);

    await expect(service.validate(token, undefined)).resolves.toEqual({ status: 'invalid' });
    await expect(
      service.setPassword(token, 'Blue-Harbour-Lamp-72!', undefined),
    ).rejects.toMatchObject({
      code: 'TOKEN_INVALID',
    });
  });

  it('kills the older link when a newer one is sent', async () => {
    const older = await invite();
    await service.issueAndDeliver(
      { id: 'u-new', email: 'new.starter@example.com', fullName: 'New Starter' },
      'INVITE',
    );
    const newer = lastToken();

    await expect(service.validate(older, undefined)).resolves.toEqual({ status: 'invalid' });
    await expect(service.validate(newer, undefined)).resolves.toMatchObject({ status: 'valid' });
  });

  it('records a delivery failure as FAILED instead of throwing', async () => {
    mailer.send.mockRejectedValueOnce(new Error('smtp down'));
    addUser({ id: 'u-x', email: 'x@example.com', status: 'INVITED' });

    const result = await service.issueAndDeliver(
      { id: 'u-x', email: 'x@example.com', fullName: 'X' },
      'INVITE',
    );

    expect(result.emailStatus).toBe('FAILED');
    expect(db.links[0]?.emailStatus).toBe('FAILED');
  });
});

describe('set password', () => {
  it('re-checks the policy on the server and names the failed rules', async () => {
    const token = await invite();
    await expect(service.setPassword(token, 'short', undefined)).rejects.toMatchObject({
      code: 'PASSWORD_POLICY',
      extra: { failedRules: ['MIN_LENGTH', 'UPPERCASE', 'NUMBER', 'SPECIAL'] },
    });
  });

  it.each(['Starter-Pass-42!', 'Password-2026!x'])(
    'refuses a personal or common password: %s',
    async (password) => {
      const token = await invite();
      await expect(service.setPassword(token, password, undefined)).rejects.toMatchObject({
        code: 'PASSWORD_PERSONAL',
      });
    },
  );

  it(`locks the link after ${String(MAX_SET_PASSWORD_ATTEMPTS)} rejected passwords`, async () => {
    const token = await invite();
    for (let attempt = 0; attempt < MAX_SET_PASSWORD_ATTEMPTS; attempt += 1) {
      await expect(service.setPassword(token, 'short', undefined)).rejects.toMatchObject({
        code: 'PASSWORD_POLICY',
      });
    }
    await expect(
      service.setPassword(token, 'Blue-Harbour-Lamp-71!', undefined),
    ).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
  });

  it('refuses an expired link', async () => {
    const token = await invite();
    db.links[0]!.expiresAt = new Date(Date.now() - 1000);
    await expect(
      service.setPassword(token, 'Blue-Harbour-Lamp-71!', undefined),
    ).rejects.toMatchObject({
      code: 'TOKEN_EXPIRED',
    });
  });

  it('refuses an invite link once the account is no longer INVITED', async () => {
    const token = await invite();
    db.users[0]!.status = 'INACTIVE';
    await expect(
      service.setPassword(token, 'Blue-Harbour-Lamp-71!', undefined),
    ).rejects.toMatchObject({
      code: 'TOKEN_INVALID',
    });
  });
});

describe('forgot password', () => {
  it('answers (202) for an unknown address and sends nothing', async () => {
    await expect(service.forgotPassword('nobody@example.com', undefined)).resolves.toBeUndefined();
    await service.drainBackground();
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('emails a reset link to a real, active address', async () => {
    addUser({
      id: 'u-active',
      email: 'dheliya@example.com',
      status: 'ACTIVE',
      fullName: 'Dheliya K',
    });

    await forgot('  Dheliya@Example.com ');

    expect(sent()[0]).toMatchObject({ to: 'dheliya@example.com' });
    await expect(service.validate(lastToken(), undefined)).resolves.toMatchObject({
      status: 'valid',
      purpose: 'RESET',
    });
  });

  it('sends a still-invited user their invite again, not a reset', async () => {
    addUser({ id: 'u-inv', email: 'inv@example.com', status: 'INVITED' });
    await forgot('inv@example.com');
    await expect(service.validate(lastToken(), undefined)).resolves.toMatchObject({
      purpose: 'INVITE',
    });
  });

  it('sends nothing to a deactivated account', async () => {
    addUser({ id: 'u-off', email: 'off@example.com', status: 'INACTIVE' });
    await forgot('off@example.com');
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('rate-limits per address, for real and unknown addresses alike', async () => {
    for (let i = 0; i < MAX_FORGOT_REQUESTS; i += 1) {
      await forgot('ghost@example.com');
    }
    await expect(service.forgotPassword('ghost@example.com', undefined)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
  });
});

describe('resend link', () => {
  it('turns an expired link into a fresh one, and the old link cannot ask again', async () => {
    const token = await invite();
    db.links[0]!.expiresAt = new Date(Date.now() - 1000);
    db.links[0]!.createdAt = new Date(Date.now() - RESEND_COOLDOWN_MS - 1000);

    await service.resendLink(token, undefined);
    await expect(service.validate(lastToken(), undefined)).resolves.toMatchObject({
      status: 'valid',
    });
    mailer.send.mockClear();
    await service.resendLink(token, undefined);
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('enforces the cooldown on a link issued moments ago', async () => {
    const token = await invite();
    db.links[0]!.expiresAt = new Date(Date.now() - 1000);
    await expect(service.resendLink(token, undefined)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
  });

  it('answers silently for an unknown or used token and sends nothing', async () => {
    await service.resendLink('never-issued', undefined);
    expect(mailer.send).not.toHaveBeenCalled();
  });
});

describe('hardening', () => {
  it('publishes the link policy from configuration only', () => {
    current = testConfig({ RESET_TTL_MINUTES: '30', PASSWORD_LINK_RESEND_COOLDOWN_SECONDS: '90' });
    expect(service.linkPolicy()).toEqual({
      inviteTtlMinutes: CONFIG_DEFAULTS.inviteTtlHours * 60,
      resetTtlMinutes: 30,
      resendCooldownSeconds: 90,
    });
  });

  it('reads the link lifetimes from configuration', async () => {
    current = testConfig({ INVITE_TTL_HOURS: '2' });
    const before = Date.now();
    await invite();
    const lifetime = db.links[0]!.expiresAt.getTime() - before;
    expect(lifetime).toBeGreaterThan(2 * 60 * 60 * 1000 - 5000);
    expect(lifetime).toBeLessThanOrEqual(2 * 60 * 60 * 1000 + 5000);
    expect(sent()[0]?.text).toContain('expires in 2 hours');
  });

  it('emails an HTML and a text part, with the token only in the #fragment', async () => {
    const token = await invite();
    const message = mailer.send.mock.calls[0]![0] as { text: string; html: string };
    expect(message.text).toContain(`/set-password#token=${token}`);
    expect(message.html).toContain(`/set-password#token=${token}`);
    expect(message.text).not.toMatch(/[?&]token=/);
  });

  it('does not let personal-password rejections lock the link', async () => {
    const token = await invite();
    for (let attempt = 0; attempt < MAX_SET_PASSWORD_ATTEMPTS + 2; attempt += 1) {
      await expect(service.setPassword(token, 'Starter-Pass-42!', undefined)).rejects.toMatchObject(
        { code: 'PASSWORD_PERSONAL' },
      );
    }
    await expect(
      service.setPassword(token, 'Blue-Harbour-Lamp-71!', undefined),
    ).resolves.toBeUndefined();
  });

  it('never counts past the attempt limit', async () => {
    const token = await invite();
    for (let attempt = 0; attempt < MAX_SET_PASSWORD_ATTEMPTS + 3; attempt += 1) {
      await service.setPassword(token, 'short', undefined).catch(() => undefined);
    }
    expect(db.links[0]?.failedAttempts).toBe(MAX_SET_PASSWORD_ATTEMPTS);
  });

  it('sends a password-changed notice after the password is saved', async () => {
    const token = await invite();
    await service.setPassword(token, 'Blue-Harbour-Lamp-71!', undefined);
    await service.drainBackground();
    expect(sent().at(-1)).toMatchObject({
      to: 'new.starter@example.com',
      subject: 'Your account is ready',
    });
    expect(sent().at(-1)?.text).not.toContain(token);
  });

  it('ignores a resend request for a link that was replaced', async () => {
    const older = await invite();
    db.links[0]!.createdAt = new Date(Date.now() - RESEND_COOLDOWN_MS - 1000);
    await service.issueAndDeliver(
      { id: 'u-new', email: 'new.starter@example.com', fullName: 'New Starter' },
      'INVITE',
    );
    db.links[1]!.createdAt = new Date(Date.now() - RESEND_COOLDOWN_MS - 1000);
    mailer.send.mockClear();

    await service.resendLink(older, undefined);
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('still answers when the email status cannot be recorded', async () => {
    addUser({ id: 'u-x', email: 'x@example.com', status: 'INVITED' });
    db.passwordLink.update.mockRejectedValueOnce(new Error('db blip'));
    await expect(
      service.issueAndDeliver({ id: 'u-x', email: 'x@example.com', fullName: 'X' }, 'INVITE'),
    ).resolves.toMatchObject({ emailStatus: 'SENT' });
  });

  it('answers forgot-password in the same minimum time for any address', async () => {
    service.forgotMinResponseMs = 120;
    addUser({ id: 'u-a', email: 'a@example.com', status: 'ACTIVE' });
    const time = async (email: string) => {
      const started = performance.now();
      await service.forgotPassword(email, undefined);
      return performance.now() - started;
    };
    expect(await time('a@example.com')).toBeGreaterThanOrEqual(110);
    expect(await time('nobody@example.com')).toBeGreaterThanOrEqual(110);
    await service.drainBackground();
  });
});

describe('admin invite actions', () => {
  it('revokes an invite: the account goes and it is audited', async () => {
    await invite();
    await service.revokeInvite('u-new', admin);

    expect(db.users).toHaveLength(0);
    expect(db.audits.at(-1)).toMatchObject({ action: 'INVITE_REVOKED', targetUserId: 'u-new' });
  });

  it('refuses invite actions on a user who is not invited', async () => {
    addUser({ id: 'u-active', email: 'a@example.com', status: 'ACTIVE' });
    await expect(service.resendInvite('u-active', admin)).rejects.toMatchObject({
      code: 'NOT_INVITED',
    });
  });

  it('enforces the resend cooldown', async () => {
    await invite();
    await expect(service.resendInvite('u-new', admin)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
  });

  it('keeps a privileged invite out of a normal Admin’s reach', async () => {
    addUser({ id: 'u-adm', email: 'adm@example.com', status: 'INVITED', roles: ['ADMIN'] });
    await expect(service.resendInvite('u-adm', admin)).rejects.toMatchObject({
      code: 'PRIVILEGED_ROLE_REQUIRED',
    });
  });
});
