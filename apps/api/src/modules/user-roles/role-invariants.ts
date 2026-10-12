import type { Prisma } from '@prisma/client';
import { ApiException } from '../../common/api-error.js';
import type { RoleCode } from '../auth/auth.constants.js';
import type { UserWithRoleRecords } from '../users/user-response.js';

export async function lockPrivilegedRoleInvariants(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('sdp-privileged-role-invariant'))`;
}

export async function assertNotLastActiveRoleHolder(
  tx: Prisma.TransactionClient,
  user: UserWithRoleRecords,
  removedRoles: readonly RoleCode[],
  action: 'demoted' | 'deactivated or deleted',
): Promise<void> {
  if (user.status !== 'ACTIVE') return;

  for (const role of ['ADMIN', 'SUPER_ADMIN'] as const) {
    if (!removedRoles.includes(role)) continue;
    const count = await tx.user.count({
      where: {
        status: 'ACTIVE',
        deletedAt: null,
        userRoles: { some: { role: { code: role, deletedAt: null } } },
      },
    });
    if (count <= 1) {
      const label = role === 'SUPER_ADMIN' ? 'Super Admin' : 'administrator';
      throw new ApiException(
        'INVALID_STATE_TRANSITION',
        `The last active ${label} cannot be ${action}`,
      );
    }
  }
}
