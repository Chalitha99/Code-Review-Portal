import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import {
  CSRF_COOKIE,
  PUBLIC_ROUTE,
  REQUIRED_ROLES,
} from '../auth.constants.js';
import { CsrfGuard } from './csrf.guard.js';
import { RolesGuard } from './roles.guard.js';

function httpContext(request: object): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () =>
      function handler() {
        return undefined;
      },
    getClass: () => class Controller {},
  } as unknown as ExecutionContext;
}

describe('CsrfGuard', () => {
  const guard = new CsrfGuard();

  it('allows safe requests without a token', () => {
    expect(guard.canActivate(httpContext({ method: 'GET', path: '/api/users' }))).toBe(true);
  });

  it('accepts matching double-submit tokens', () => {
    const request = {
      method: 'PATCH',
      path: '/api/users/1',
      cookies: { [CSRF_COOKIE]: 'matching-token' },
      headers: { 'x-csrf-token': 'matching-token' },
    };
    expect(guard.canActivate(httpContext(request))).toBe(true);
  });

  it('rejects unsafe requests without a matching token', () => {
    const request = {
      method: 'POST',
      path: '/api/customers',
      cookies: { [CSRF_COOKIE]: 'expected' },
      headers: { 'x-csrf-token': 'wrong' },
    };
    expect(() => guard.canActivate(httpContext(request))).toThrow(ForbiddenException);
  });
});

describe('RolesGuard', () => {
  function reflectorFor(required: string[]): Reflector {
    return {
      getAllAndOverride: vi.fn((key: unknown) => {
        if (key === PUBLIC_ROUTE) return false;
        if (key === REQUIRED_ROLES) return required;
        return undefined;
      }),
    } as unknown as Reflector;
  }

  it('allows a principal holding one of the required roles', () => {
    const guard = new RolesGuard(reflectorFor(['ADMIN']));
    expect(guard.canActivate(httpContext({ user: { roles: ['DEVELOPER', 'ADMIN'] } }))).toBe(true);
  });

  it('rejects a principal without a required role', () => {
    const guard = new RolesGuard(reflectorFor(['ADMIN']));
    expect(() => guard.canActivate(httpContext({ user: { roles: ['DEVELOPER'] } }))).toThrow(
      ForbiddenException,
    );
  });

  it('allows a Super Admin endpoint for a Super Admin principal', () => {
    const guard = new RolesGuard(reflectorFor(['SUPER_ADMIN']));
    expect(guard.canActivate(httpContext({ user: { roles: ['SUPER_ADMIN'] } }))).toBe(true);
  });

  it('lets Super Admin inherit Admin-protected API access', () => {
    const guard = new RolesGuard(reflectorFor(['ADMIN']));
    expect(guard.canActivate(httpContext({ user: { roles: ['SUPER_ADMIN'] } }))).toBe(true);
  });

  it('allows Super Admin to use shared authenticated APIs', () => {
    const guard = new RolesGuard(reflectorFor([]));
    expect(guard.canActivate(httpContext({ user: { roles: ['SUPER_ADMIN'] } }))).toBe(true);
  });

  it('does not let Admin call a Super-Admin-only API', () => {
    const guard = new RolesGuard(reflectorFor(['SUPER_ADMIN']));
    expect(() => guard.canActivate(httpContext({ user: { roles: ['ADMIN'] } }))).toThrow(
      ForbiddenException,
    );
  });
});
