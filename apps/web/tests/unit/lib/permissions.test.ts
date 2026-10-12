import { describe, expect, it } from 'vitest';
import type { Role } from '@sdp/contracts';
import {
  accessibleWorkspaces,
  canAccessWorkspace,
  hasNoWorkspaceAccess,
} from '@/lib/permissions.ts';

const DEVELOPER: Role[] = ['Developer'];
const REVIEWER: Role[] = ['Reviewer'];
const ADMIN: Role[] = ['Admin'];
const MULTI: Role[] = ['Developer', 'Reviewer', 'Admin'];
const SUPER_ADMIN: Role[] = ['SuperAdmin'];

describe('canAccessWorkspace', () => {
  it('grants a developer only the developer workspace', () => {
    expect(canAccessWorkspace(DEVELOPER, 'developer')).toBe(true);
    expect(canAccessWorkspace(DEVELOPER, 'reviewer')).toBe(false);
    expect(canAccessWorkspace(DEVELOPER, 'admin')).toBe(false);
  });

  it('grants a reviewer only the reviewer workspace', () => {
    expect(canAccessWorkspace(REVIEWER, 'reviewer')).toBe(true);
    expect(canAccessWorkspace(REVIEWER, 'developer')).toBe(false);
    expect(canAccessWorkspace(REVIEWER, 'admin')).toBe(false);
  });

  it('grants an admin only the explicitly assigned admin workspace', () => {
    expect(canAccessWorkspace(ADMIN, 'admin')).toBe(true);
    expect(canAccessWorkspace(ADMIN, 'developer')).toBe(false);
    expect(canAccessWorkspace(ADMIN, 'reviewer')).toBe(false);
  });

  it('grants a Super Admin the existing Admin workspace', () => {
    expect(canAccessWorkspace(SUPER_ADMIN, 'developer')).toBe(false);
    expect(canAccessWorkspace(SUPER_ADMIN, 'reviewer')).toBe(false);
    expect(canAccessWorkspace(SUPER_ADMIN, 'admin')).toBe(true);
  });
});

describe('accessibleWorkspaces', () => {
  it('returns workspaces in home-page order', () => {
    expect(accessibleWorkspaces(MULTI)).toEqual(['developer', 'reviewer', 'admin']);
  });

  it('unions the roles rather than picking a single highest one', () => {
    expect(accessibleWorkspaces(['Developer', 'Reviewer'])).toEqual(['developer', 'reviewer']);
  });

  it('does not infer Reviewer access for an Admin + Developer account', () => {
    expect(accessibleWorkspaces(['Developer', 'Admin'])).toEqual(['developer', 'admin']);
  });

  it('returns nothing for a user with no roles', () => {
    expect(accessibleWorkspaces([])).toEqual([]);
  });

  it('includes the Admin workspace for Super Admin', () => {
    expect(accessibleWorkspaces(['SuperAdmin'])).toEqual(['admin']);
  });
});

describe('hasNoWorkspaceAccess', () => {
  it('flags an account with no roles configured', () => {
    expect(hasNoWorkspaceAccess([])).toBe(true);
  });

  it('does not flag an account with any role', () => {
    expect(hasNoWorkspaceAccess(DEVELOPER)).toBe(false);
  });
});
