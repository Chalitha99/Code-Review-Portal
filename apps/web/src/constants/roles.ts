import type { Role } from '@sdp/contracts';

/**
 * Role display labels and their canonical order.
 */

export const ROLE_ORDER: readonly Role[] = ['Developer', 'Reviewer', 'Admin', 'SuperAdmin'];

export const ROLE_LABELS: Record<Role, string> = {
  Developer: 'Developer',
  Reviewer: 'Reviewer',
  Admin: 'Admin',
  SuperAdmin: 'SuperAdmin',
};

export function roleLabel(role: Role): string {
  return ROLE_LABELS[role];
}

/** The user's roles as labels, in canonical order. */
export function orderedRoleLabels(roles: readonly Role[]): string[] {
  return ROLE_ORDER.filter((role) => roles.includes(role)).map(roleLabel);
}
