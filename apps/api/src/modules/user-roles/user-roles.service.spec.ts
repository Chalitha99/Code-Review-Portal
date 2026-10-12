import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import type { ReviewerWorkloadService } from '../reviewer-workload/reviewer-workload.service.js';
import { ApiException } from '../../common/api-error.js';
import { UserRolesService } from './user-roles.service.js';

const actor: AuthenticatedUser = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'current@example.com',
  name: 'Current Super Admin',
  roles: ['SUPER_ADMIN'],
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  sessionId: 'session',
};

const adminRole = {
  id: 3,
  code: 'ADMIN',
  name: 'Administrator',
  description: null,
  deletedAt: null,
};
const superAdminRole = {
  id: 4,
  code: 'SUPER_ADMIN',
  name: 'Super Administrator',
  description: null,
  deletedAt: null,
};

function user(id: string, roles: (typeof adminRole)[]) {
  return {
    id,
    email: `${id}@example.com`,
    fullName: id === actor.id ? actor.name : 'Target Admin',
    status: 'ACTIVE' as const,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    userRoles: roles.map((role) => ({ role })),
  };
}

function harness(targetRoles: (typeof adminRole)[]) {
  const targetId = '00000000-0000-0000-0000-000000000002';
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    role: { findMany: vi.fn().mockResolvedValue([adminRole, superAdminRole]) },
    userRole: {
      findMany: vi
        .fn()
        .mockResolvedValue([{ userId: actor.id, user: user(actor.id, [superAdminRole]) }]),
      upsert: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn().mockResolvedValue(undefined),
    },
    user: {
      findFirst: vi.fn().mockResolvedValue(user(targetId, targetRoles)),
      findUniqueOrThrow: vi.fn().mockResolvedValue(user(targetId, [superAdminRole])),
    },
    auditLog: { create: vi.fn().mockResolvedValue(undefined) },
  };
  const prisma = {
    // The pre-transaction pending-work lookup of the transfer target.
    user: { findFirst: vi.fn().mockResolvedValue(user(targetId, targetRoles)) },
    $transaction: vi.fn((callback: (client: typeof tx) => unknown) =>
      Promise.resolve(callback(tx)),
    ),
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const workload = {
    assertCanRemoveReviewer: vi.fn().mockResolvedValue(undefined),
    assertNoPendingWork: vi.fn().mockResolvedValue(undefined),
  };
  const service = new UserRolesService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
    workload as unknown as ReviewerWorkloadService,
  );
  return { audit, service, targetId, tx, workload };
}

describe('UserRolesService.transferSuperAdmin', () => {
  it('atomically moves Super Admin to an existing Admin and keeps the previous owner Admin', async () => {
    const { audit, service, targetId, tx } = harness([adminRole]);

    await expect(service.transferSuperAdmin(targetId, actor)).resolves.toMatchObject({
      id: targetId,
      roles: ['Super Admin'],
    });
    expect(tx.userRole.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_roleId: { userId: actor.id, roleId: adminRole.id } },
      }),
    );
    expect(tx.userRole.delete).toHaveBeenCalledWith({
      where: { userId_roleId: { userId: actor.id, roleId: superAdminRole.id } },
    });
    expect(tx.userRole.create).toHaveBeenCalledWith({
      data: { userId: targetId, roleId: superAdminRole.id, grantedBy: actor.id },
    });
    expect(tx.userRole.deleteMany).toHaveBeenCalledWith({
      where: { userId: targetId, roleId: { not: superAdminRole.id } },
    });
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      actor,
      expect.objectContaining({ actionType: 'SUPER_ADMIN_TRANSFERRED', targetUserId: targetId }),
    );
  });

  it('rejects a target who does not already hold Admin', async () => {
    const { service, targetId, tx } = harness([]);

    await expect(service.transferSuperAdmin(targetId, actor)).rejects.toMatchObject({
      code: 'RULE_VIOLATION',
      status: 422,
    });
    expect(tx.userRole.delete).not.toHaveBeenCalled();
    expect(tx.userRole.create).not.toHaveBeenCalled();
  });
});

describe('UserRolesService.transferSuperAdmin with review work', () => {
  const reviewer = {
    id: 9,
    code: 'REVIEWER',
    name: 'Reviewer',
    description: null,
    deletedAt: null,
  };

  it('is refused while the target Admin+Reviewer still has pending review work', async () => {
    const { service, targetId, tx, workload } = harness([adminRole, reviewer]);
    const blocked = new ApiException('REVIEWER_HAS_PENDING_TASKS', 'Hand over first', {
      tasks: [],
    });
    workload.assertCanRemoveReviewer.mockRejectedValue(blocked);

    await expect(service.transferSuperAdmin(targetId, actor)).rejects.toBe(blocked);
    expect(workload.assertCanRemoveReviewer).toHaveBeenCalledWith(
      expect.objectContaining({ id: targetId }),
      actor,
      'TRANSFER_SUPER_ADMIN',
    );
    expect(tx.userRole.create).not.toHaveBeenCalled();
  });

  it('re-checks inside the transaction, so work picked up meanwhile still blocks it', async () => {
    const { service, targetId, tx, workload } = harness([adminRole, reviewer]);
    workload.assertNoPendingWork.mockRejectedValue(
      new ApiException('REVIEWER_HAS_PENDING_TASKS', 'Hand over first', { tasks: [] }),
    );

    await expect(service.transferSuperAdmin(targetId, actor)).rejects.toMatchObject({
      code: 'REVIEWER_HAS_PENDING_TASKS',
      status: 409,
    });
    expect(workload.assertNoPendingWork).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ id: targetId }),
    );
    expect(tx.userRole.create).not.toHaveBeenCalled();
  });

  it('skips the reviewer check for an Admin who is not a Reviewer', async () => {
    const { service, targetId, workload } = harness([adminRole]);
    await service.transferSuperAdmin(targetId, actor);
    expect(workload.assertCanRemoveReviewer).not.toHaveBeenCalled();
    expect(workload.assertNoPendingWork).not.toHaveBeenCalled();
  });
});

describe('UserRolesService.replaceForUser', () => {
  const developerRole = {
    id: 1,
    code: 'DEVELOPER',
    name: 'Developer',
    description: null,
    deletedAt: null,
  };
  const reviewerRole = {
    id: 2,
    code: 'REVIEWER',
    name: 'Reviewer',
    description: null,
    deletedAt: null,
  };
  const targetId = '00000000-0000-0000-0000-000000000003';
  const adminActor: AuthenticatedUser = { ...actor, roles: ['ADMIN'], name: 'An Admin' };

  function replaceHarness(
    heldRoles: (typeof developerRole)[],
    grantedRoles: (typeof developerRole)[],
  ) {
    const target = {
      id: targetId,
      email: 'dev@example.com',
      fullName: 'Dev Person',
      status: 'ACTIVE' as const,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      userRoles: heldRoles.map((role) => ({ role })),
    };
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      userRole: {
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn().mockResolvedValue({ count: heldRoles.length }),
        createMany: vi.fn().mockResolvedValue({ count: grantedRoles.length }),
      },
      user: {
        findUniqueOrThrow: vi
          .fn()
          .mockResolvedValue({ ...target, userRoles: grantedRoles.map((role) => ({ role })) }),
      },
    };
    const prisma = {
      user: { findFirst: vi.fn().mockResolvedValue(target) },
      role: { findMany: vi.fn().mockResolvedValue(grantedRoles) },
      $transaction: vi.fn((callback: (client: typeof tx) => unknown) =>
        Promise.resolve(callback(tx)),
      ),
    };
    const audit = { record: vi.fn().mockResolvedValue(undefined) };
    const workload = {
      assertCanRemoveReviewer: vi.fn().mockResolvedValue(undefined),
      assertNoPendingWork: vi.fn().mockResolvedValue(undefined),
    };
    const service = new UserRolesService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      workload as unknown as ReviewerWorkloadService,
    );
    return { audit, service, tx, workload, target };
  }

  it('adds Reviewer to a Developer in one replace', async () => {
    const { audit, service, tx } = replaceHarness([developerRole], [developerRole, reviewerRole]);

    await expect(
      service.replaceForUser(targetId, ['DEVELOPER', 'REVIEWER'], adminActor),
    ).resolves.toMatchObject({ roles: ['Developer', 'Reviewer'] });
    expect(tx.userRole.createMany).toHaveBeenCalledWith({
      data: [
        { userId: targetId, roleId: 1, grantedBy: adminActor.id },
        { userId: targetId, roleId: 2, grantedBy: adminActor.id },
      ],
    });
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      adminActor,
      expect.objectContaining({
        actionType: 'ROLES_CHANGED',
        oldValue: ['DEVELOPER'],
        newValue: ['DEVELOPER', 'REVIEWER'],
      }),
    );
  });

  it('removes Reviewer from a Developer+Reviewer after the pending-work check', async () => {
    const { service, workload, target } = replaceHarness(
      [developerRole, reviewerRole],
      [developerRole],
    );

    await expect(
      service.replaceForUser(targetId, ['DEVELOPER'], adminActor, 'Moved team'),
    ).resolves.toMatchObject({ roles: ['Developer'] });
    expect(workload.assertCanRemoveReviewer).toHaveBeenCalledWith(
      target,
      adminActor,
      'REMOVE_REVIEWER_ROLE',
      'Moved team',
    );
  });

  it('keeps the roles when the reviewer still has pending work', async () => {
    const { service, tx, workload } = replaceHarness(
      [developerRole, reviewerRole],
      [developerRole],
    );
    workload.assertCanRemoveReviewer.mockRejectedValue(
      new ApiException('REVIEWER_HAS_PENDING_TASKS', 'blocked', { tasks: [] }),
    );

    await expect(service.replaceForUser(targetId, ['DEVELOPER'], adminActor)).rejects.toMatchObject(
      {
        code: 'REVIEWER_HAS_PENDING_TASKS',
      },
    );
    expect(tx.userRole.deleteMany).not.toHaveBeenCalled();
  });

  it('refuses an Admin removing Admin from someone', async () => {
    const { service } = replaceHarness([developerRole, adminRole], [developerRole]);

    await expect(service.replaceForUser(targetId, ['DEVELOPER'], adminActor)).rejects.toThrow(
      'Admins may only manage Developer and Reviewer accounts',
    );
  });
});
