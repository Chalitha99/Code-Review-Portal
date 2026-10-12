import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import type { RoleCode } from '../auth/auth.constants.js';

const ADMIN_ASSIGNABLE_ROLES: readonly RoleCode[] = ['DEVELOPER', 'REVIEWER'];
const SUPER_ADMIN_ASSIGNABLE_ROLES: readonly RoleCode[] = ['DEVELOPER', 'REVIEWER', 'ADMIN'];

export function assertCanManageUser(
  actor: AuthenticatedUser,
  targetRoles: readonly RoleCode[],
): void {
  if (actor.roles.includes('SUPER_ADMIN')) return;

  if (!actor.roles.includes('ADMIN')) {
    throw new ForbiddenException('Only an administrator may manage users');
  }

  if (
    targetRoles.length === 0 ||
    targetRoles.some((role) => !ADMIN_ASSIGNABLE_ROLES.includes(role))
  ) {
    throw new ForbiddenException('Admins may only manage Developer and Reviewer accounts');
  }
}

export function assertCanGrantRoles(
  actor: AuthenticatedUser,
  targetRoles: readonly RoleCode[],
  requestedRoles: readonly RoleCode[],
): void {
  if (actor.roles.includes('SUPER_ADMIN')) {
    if (
      targetRoles.includes('SUPER_ADMIN') ||
      requestedRoles.includes('SUPER_ADMIN') ||
      requestedRoles.some((role) => !SUPER_ADMIN_ASSIGNABLE_ROLES.includes(role))
    ) {
      throw new ForbiddenException(
        'Use the Super Admin transfer action to change Super Admin ownership',
      );
    }
    return;
  }

  if (!actor.roles.includes('ADMIN')) {
    throw new ForbiddenException('Only an administrator may manage users');
  }

  // An empty target is the create-user path. Existing accounts must already be
  // limited to Admin-manageable operational roles.
  if (
    targetRoles.length > 0 &&
    targetRoles.some((role) => !ADMIN_ASSIGNABLE_ROLES.includes(role))
  ) {
    throw new ForbiddenException('Admins may only manage Developer and Reviewer accounts');
  }

  if (requestedRoles.some((role) => !ADMIN_ASSIGNABLE_ROLES.includes(role))) {
    throw new ForbiddenException('Admins may only assign Developer and Reviewer roles');
  }
}
