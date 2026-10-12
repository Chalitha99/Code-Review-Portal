import { describe, expect, it } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import { CsrfGuard } from './csrf.guard.js';

function context(method: string, path: string, cookie?: string, header?: string): ExecutionContext {
  const request = {
    method,
    path,
    cookies: cookie === undefined ? {} : { sdp_csrf: cookie },
    headers: header === undefined ? {} : { 'x-csrf-token': header },
  };
  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

describe('CsrfGuard', () => {
  const guard = new CsrfGuard();

  it('exempts the token-bootstrap endpoints by their exact path', () => {
    expect(guard.canActivate(context('POST', '/api/auth/login'))).toBe(true);
    expect(guard.canActivate(context('POST', '/api/auth/login/'))).toBe(true);
    expect(guard.canActivate(context('POST', '/api/auth/set-password'))).toBe(true);
  });

  it('does not exempt a different route that merely ends like one', () => {
    expect(() => guard.canActivate(context('POST', '/api/tasks/x/auth/login'))).toThrow();
    expect(() => guard.canActivate(context('POST', '/api/users/u1/auth/set-password'))).toThrow();
  });

  it('requires the double-submit token on other writes', () => {
    expect(() => guard.canActivate(context('PATCH', '/api/tasks/1'))).toThrow();
    expect(() => guard.canActivate(context('PATCH', '/api/tasks/1', 'abc', 'abd'))).toThrow();
    expect(guard.canActivate(context('PATCH', '/api/tasks/1', 'abc', 'abc'))).toBe(true);
    expect(guard.canActivate(context('GET', '/api/tasks'))).toBe(true);
  });
});
