import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { RoleCode } from '../auth/auth.constants.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { assertCanGrantRoles, assertCanManageUser } from './role-policy.js';

function actor(roles: RoleCode[]): AuthenticatedUser {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'actor@example.com',
    name: 'Actor',
    roles,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    sessionId: 'session',
  };
}

describe('user and role management policy', () => {
  it('allows Admin to assign Developer and Reviewer together', () => {
    expect(() =>
      assertCanGrantRoles(actor(['ADMIN']), ['DEVELOPER'], ['DEVELOPER', 'REVIEWER']),
    ).not.toThrow();
  });

  it('prevents Admin from granting Admin or Super Admin', () => {
    expect(() =>
      assertCanGrantRoles(actor(['ADMIN']), ['DEVELOPER'], ['DEVELOPER', 'ADMIN']),
    ).toThrow(ForbiddenException);
    expect(() => assertCanGrantRoles(actor(['ADMIN']), ['DEVELOPER'], ['SUPER_ADMIN'])).toThrow(
      ForbiddenException,
    );
  });

  it('prevents Admin from modifying privileged accounts', () => {
    expect(() => assertCanManageUser(actor(['ADMIN']), ['ADMIN'])).toThrow(ForbiddenException);
    expect(() => assertCanManageUser(actor(['ADMIN']), ['SUPER_ADMIN'])).toThrow(
      ForbiddenException,
    );
  });

  it('allows Admin to manage only existing Developer and Reviewer accounts', () => {
    expect(() => assertCanManageUser(actor(['ADMIN']), ['DEVELOPER', 'REVIEWER'])).not.toThrow();
    expect(() => assertCanManageUser(actor(['ADMIN']), [])).toThrow(ForbiddenException);
  });

  it('allows Admin to create an account with Developer and Reviewer roles', () => {
    expect(() =>
      assertCanGrantRoles(actor(['ADMIN']), [], ['DEVELOPER', 'REVIEWER']),
    ).not.toThrow();
  });

  it('allows Super Admin to grant Developer, Reviewer, and Admin roles', () => {
    expect(() =>
      assertCanGrantRoles(
        actor(['SUPER_ADMIN']),
        ['DEVELOPER'],
        ['DEVELOPER', 'REVIEWER', 'ADMIN'],
      ),
    ).not.toThrow();
  });

  it('prevents Super Admin from granting or revoking the Super Admin role', () => {
    expect(() =>
      assertCanGrantRoles(actor(['SUPER_ADMIN']), ['DEVELOPER'], ['DEVELOPER', 'SUPER_ADMIN']),
    ).toThrow(ForbiddenException);
    expect(() => assertCanGrantRoles(actor(['SUPER_ADMIN']), ['SUPER_ADMIN'], ['ADMIN'])).toThrow(
      ForbiddenException,
    );
  });

  it('requires the dedicated transfer action for every Super Admin role update', () => {
    expect(() =>
      assertCanGrantRoles(actor(['SUPER_ADMIN']), ['SUPER_ADMIN'], ['SUPER_ADMIN', 'ADMIN']),
    ).toThrow(ForbiddenException);
  });
});
