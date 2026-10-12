import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { ApiException } from '../../common/api-error.js';
import { UsersService } from './users.service.js';

const actor: AuthenticatedUser = {
  id: '122f5c16-7522-4b2e-b9b4-a6ac68fbf713',
  email: 'super.admin@example.com',
  name: 'Super Admin',
  roles: ['SUPER_ADMIN'],
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  sessionId: 'session-id',
};

const USER_ID = 'cb17b073-8fb2-4abe-83b7-7f36f1af4682';
const LINK = {
  linkId: 'link-1',
  token: 'secret-token',
  expiresAt: new Date('2026-10-09T00:00:00Z'),
};

function existingUser(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    email: 'developer@example.com',
    fullName: 'Developer',
    status: 'ACTIVE',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    userRoles: [{ role: { code: 'DEVELOPER' } }],
    ...overrides,
  };
}

function harness(found: ReturnType<typeof existingUser> | null = existingUser()) {
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const passwordLinks = {
    createLink: vi.fn().mockResolvedValue(LINK),
    deliver: vi.fn().mockResolvedValue('SENT'),
    revokeAllFor: vi.fn().mockResolvedValue({ count: 0 }),
    inviteStates: vi.fn().mockResolvedValue(new Map()),
  };
  const workload = {
    assertCanRemoveReviewer: vi.fn().mockResolvedValue(undefined),
    assertNoPendingWork: vi.fn().mockResolvedValue(undefined),
  };
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    refreshSession: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    user: {
      create: vi.fn(),
      update: vi
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ ...(found ?? existingUser()), ...data }),
        ),
    },
    userRole: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const prisma = {
    role: {
      findMany: vi.fn().mockResolvedValue([
        { id: 1, code: 'DEVELOPER' },
        { id: 3, code: 'ADMIN' },
      ]),
    },
    user: {
      findFirst: vi
        .fn()
        // getUser, then the email-clash lookup (none).
        .mockResolvedValueOnce(found)
        .mockResolvedValue(null),
    },
    $transaction: vi.fn(async (operation: (client: typeof tx) => Promise<unknown>) =>
      operation(tx),
    ),
  };
  const service = new UsersService(
    prisma as never,
    audit as never,
    passwordLinks as never,
    workload as never,
  );
  return { audit, passwordLinks, prisma, service, tx, workload };
}

describe('UsersService', () => {
  it('creates the account INVITED with every role, and emails the link only after commit', async () => {
    const createdAt = new Date('2026-09-21T00:00:00.000Z');
    const { passwordLinks, prisma, service, tx } = harness();
    prisma.user.findFirst = vi.fn().mockResolvedValue(null);
    tx.user.create.mockResolvedValue({
      id: USER_ID,
      email: 'new.user@example.com',
      fullName: 'New User',
      status: 'INVITED',
      createdAt,
      userRoles: [
        { role: { id: 1, code: 'DEVELOPER', name: 'Developer', description: null } },
        { role: { id: 3, code: 'ADMIN', name: 'Admin', description: null } },
      ],
    });

    const created = await service.create(
      { name: 'New User', email: 'NEW.USER@example.com', roles: ['DEVELOPER', 'ADMIN'] },
      actor,
    );

    expect(tx.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'new.user@example.com',
          status: 'INVITED',
          userRoles: {
            create: [
              { grantor: { connect: { id: actor.id } }, role: { connect: { id: 1 } } },
              { grantor: { connect: { id: actor.id } }, role: { connect: { id: 3 } } },
            ],
          },
        }),
      }),
    );
    // The admin never chooses a password.
    expect(tx.user.create.mock.calls[0]?.[0]).not.toHaveProperty('data.passwordHash');
    expect(passwordLinks.createLink).toHaveBeenCalledWith(tx, USER_ID, 'INVITE');
    expect(passwordLinks.deliver).toHaveBeenCalledWith(LINK, expect.anything(), 'INVITE');
    expect(passwordLinks.createLink.mock.invocationCallOrder[0]).toBeLessThan(
      passwordLinks.deliver.mock.invocationCallOrder[0] ?? 0,
    );
    expect(created).toMatchObject({
      status: 'INVITED',
      isActive: false,
      inviteExpiresAt: LINK.expiresAt.toISOString(),
      inviteEmailStatus: 'SENT',
    });
  });

  it('refuses a case-insensitive duplicate email with EMAIL_TAKEN', async () => {
    const { prisma, service } = harness();
    prisma.user.findFirst = vi.fn().mockResolvedValue({ id: 'someone-else' });

    await expect(
      service.create(
        { name: 'Dup', email: 'Developer@Example.com', roles: ['DEVELOPER', 'ADMIN'] },
        actor,
      ),
    ).rejects.toMatchObject({ code: 'EMAIL_TAKEN' });
  });

  it('records the admin reason in the audit metadata', async () => {
    const { audit, service } = harness(existingUser({ userRoles: [{ role: { code: 'ADMIN' } }] }));

    await service.update(USER_ID, { name: 'Renamed', reason: '  Team change  ' }, actor);

    expect(audit.record).toHaveBeenCalledWith(
      expect.anything(),
      actor,
      expect.objectContaining({
        actionType: 'USER_UPDATED',
        metadata: { targetLabel: 'Developer', reason: 'Team change' },
      }),
    );
  });

  it('refuses to activate or deactivate an INVITED user (INVITE_PENDING)', async () => {
    const { service } = harness(existingUser({ status: 'INVITED' }));

    await expect(service.update(USER_ID, { isActive: true }, actor)).rejects.toMatchObject({
      code: 'INVITE_PENDING',
    });
  });

  it('revokes outstanding links when an account is deactivated', async () => {
    const { passwordLinks, service, tx } = harness();

    await service.update(USER_ID, { isActive: false }, actor);

    expect(passwordLinks.revokeAllFor).toHaveBeenCalledWith(tx, USER_ID);
  });

  it('checks a reviewer for pending work before deactivating them', async () => {
    const reviewer = existingUser({ userRoles: [{ role: { code: 'REVIEWER' } }] });
    const { service, tx, workload } = harness(reviewer);
    const blocked = new ApiException('REVIEWER_HAS_PENDING_TASKS', 'blocked', { tasks: [] });
    workload.assertCanRemoveReviewer.mockRejectedValue(blocked);

    await expect(
      service.update(USER_ID, { isActive: false, reason: 'Leaving' }, actor),
    ).rejects.toBe(blocked);
    expect(workload.assertCanRemoveReviewer).toHaveBeenCalledWith(
      reviewer,
      actor,
      'DEACTIVATE',
      'Leaving',
    );
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('does not run the reviewer check for a non-reviewer', async () => {
    const { service, workload } = harness();

    await service.update(USER_ID, { isActive: false }, actor);

    expect(workload.assertCanRemoveReviewer).not.toHaveBeenCalled();
  });

  it('marks a user inactive and deleted without removing their record or role history', async () => {
    const { audit, service, tx } = harness();

    await service.remove(USER_ID, actor, 'Duplicate account');

    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { status: 'INACTIVE', deletedAt: expect.any(Date) },
    });
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      actor,
      expect.objectContaining({
        actionType: 'USER_DELETED',
        metadata: { targetLabel: 'Developer', reason: 'Duplicate account' },
      }),
    );
  });

  it('guards deleting a reviewer with pending work', async () => {
    const reviewer = existingUser({ userRoles: [{ role: { code: 'REVIEWER' } }] });
    const { service, workload } = harness(reviewer);

    await service.remove(USER_ID, actor);

    expect(workload.assertCanRemoveReviewer).toHaveBeenCalledWith(
      reviewer,
      actor,
      'DELETE',
      undefined,
    );
  });

  describe('changing a user email', () => {
    it('sends the account back to INVITED, ends every session and invites the new address', async () => {
      const { audit, passwordLinks, service, tx } = harness();

      const result = await service.update(USER_ID, { email: 'New.Address@example.com' }, actor);

      expect(tx.refreshSession.updateMany).toHaveBeenCalledWith({
        where: { userId: USER_ID, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(passwordLinks.revokeAllFor).toHaveBeenCalledWith(tx, USER_ID);
      expect(tx.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'new.address@example.com',
            status: 'INVITED',
            passwordHash: null,
          }),
        }),
      );
      expect(passwordLinks.createLink).toHaveBeenCalledWith(tx, USER_ID, 'INVITE');
      expect(passwordLinks.deliver).toHaveBeenCalledWith(LINK, expect.anything(), 'INVITE');
      expect(audit.record).toHaveBeenCalledWith(
        tx,
        actor,
        expect.objectContaining({
          actionType: 'USER_EMAIL_CHANGED',
          oldValue: { email: 'd***@example.com' },
        }),
      );
      expect(result).toMatchObject({ inviteExpiresAt: LINK.expiresAt.toISOString() });
    });

    it('leaves the password alone when only the letter case of the email differs', async () => {
      const { passwordLinks, service, tx } = harness();
      await service.update(USER_ID, { email: 'Developer@Example.com' }, actor);
      expect(tx.user.update.mock.calls[0]?.[0]).not.toHaveProperty('data.passwordHash');
      expect(passwordLinks.createLink).not.toHaveBeenCalled();
    });

    it('refuses to change your own email this way', async () => {
      const { service } = harness(existingUser({ id: actor.id }));
      await expect(
        service.update(actor.id, { email: 'other@example.com' }, actor),
      ).rejects.toMatchObject({ code: 'SELF_LOCKOUT' });
    });
  });
});
