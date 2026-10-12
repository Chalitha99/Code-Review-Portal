import { describe, expect, it } from 'vitest';
import { redirectFromState, safeRedirectPath } from '@/lib/safeRedirect.ts';

describe('safeRedirectPath', () => {
  it.each(['/crp', '/crp/admin/users', '/crp/reviewer/tasks/t-1?tab=review'])(
    'accepts the in-app path %s',
    (path) => {
      expect(safeRedirectPath(path)).toBe(path);
    },
  );

  it.each([
    ['protocol-relative URL', '//evil.example/crp'],
    ['backslash host', '/\\evil.example'],
    ['absolute URL', 'https://evil.example'],
    ['javascript URL', 'javascript:alert(1)'],
    ['relative path', 'crp/admin'],
    ['tab that browsers strip', '/\t/evil.example'],
    ['newline', '/crp\n'],
    ['empty string', ''],
  ])('rejects a %s', (_label, value) => {
    expect(safeRedirectPath(value)).toBeNull();
  });

  it.each([undefined, null, 42, { from: '/crp' }])('rejects the non-string %j', (value) => {
    expect(safeRedirectPath(value)).toBeNull();
  });
});

describe('redirectFromState', () => {
  it('reads a safe `from`', () => {
    expect(redirectFromState({ from: '/crp/admin' })).toBe('/crp/admin');
  });

  it('ignores an unsafe or missing `from`', () => {
    expect(redirectFromState({ from: '//evil.example' })).toBeNull();
    expect(redirectFromState({})).toBeNull();
    expect(redirectFromState(null)).toBeNull();
    expect(redirectFromState('/crp')).toBeNull();
  });
});
