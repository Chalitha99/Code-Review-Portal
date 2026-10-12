import type { Role } from '@sdp/contracts';
import { WORKSPACE_ACCESS, WORKSPACE_ORDER, type WorkspaceKey } from '@/config/routes.ts';

export const CAPABILITIES = [
  'admin.access',
  'tasks.manage',
  'handovers.resolve',
  'users.manage.standard',
  'users.manage.privileged',
  'records.purge',
  'records.restore',
  'audit.system.view',
  'workflow.recover',
] as const;
export type Capability = (typeof CAPABILITIES)[number];

const ADMIN_CAPABILITIES: readonly Capability[] = [
  'admin.access',
  'tasks.manage',
  'handovers.resolve',
  'users.manage.standard',
];

const SUPER_ADMIN_CAPABILITIES: readonly Capability[] = [
  'users.manage.privileged',
  'records.purge',
  'records.restore',
  'audit.system.view',
  'workflow.recover',
];

/** Small capability seam for UI affordances; NestJS enforces the same capabilities. */
export function hasCapability(roles: readonly Role[], capability: Capability): boolean {
  if (
    roles.includes('SuperAdmin') &&
    (ADMIN_CAPABILITIES.includes(capability) || SUPER_ADMIN_CAPABILITIES.includes(capability))
  )
    return true;
  return roles.includes('Admin') && ADMIN_CAPABILITIES.includes(capability);
}

export function isPrivilegedRoleSet(roles: readonly Role[]): boolean {
  return roles.includes('Admin') || roles.includes('SuperAdmin');
}

/**
 * Workspace access rules — spec FL 2.1-02.
 *
 * Lives in `lib/` rather than inside the auth feature because three separate
 * layers need it: the route guard (app), the workspace chooser (home feature)
 * and the header. Putting it in one feature would force the others to reach
 * across a boundary; putting it here keeps the dependency graph acyclic.
 *
 * Pure functions with no React import, so the same rules can be unit-tested
 * directly and ported to the NestJS `PolicyGuard` in Phase 2.
 *
 * Roles are ADDITIVE and explicit. Each role grants only its matching
 * workspace, so Admin + Developer grants those two workspaces but does not
 * silently grant Reviewer access.
 */

export function canAccessWorkspace(roles: readonly Role[], workspace: WorkspaceKey): boolean {
  const allowed: readonly Role[] = WORKSPACE_ACCESS[workspace];
  return roles.some((role) => allowed.includes(role));
}

/** Workspaces the user may enter, in the order the home page lists them. */
export function accessibleWorkspaces(roles: readonly Role[]): WorkspaceKey[] {
  return WORKSPACE_ORDER.filter((workspace) => canAccessWorkspace(roles, workspace));
}

/**
 * True when the user has no workspace at all.
 *
 * Spec FL 2.1-01 treats "authenticated but no role configured" as an error
 * state rather than an empty dashboard, because it means the account was never
 * finished being set up.
 */
export function hasNoWorkspaceAccess(roles: readonly Role[]): boolean {
  return accessibleWorkspaces(roles).length === 0;
}
