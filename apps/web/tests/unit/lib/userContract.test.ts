import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createUserInputSchema, userSchema } from '@sdp/contracts';

/** Read rules stay lenient so one odd row cannot reject the whole user list. */
const row = {
  id: 'u-1',
  name: 'Mid Cleanup',
  email: 'odd!address@sebsaworld.com',
  roles: [] as string[],
  isActive: false,
  createdAt: '2026-10-01T09:00:00.000Z',
  status: 'DEACTIVATED',
  inviteExpiresAt: null,
  inviteEmailStatus: null,
};

describe('user contract', () => {
  it('parses a list that contains a role-less row and an unusual email', () => {
    const list = [row, { ...row, id: 'u-2', roles: ['Super Admin'], email: 'sa@sebsaworld.com' }];

    const parsed = z.array(userSchema).parse(list);

    expect(parsed[0]?.roles).toEqual([]);
    expect(parsed[1]?.roles).toEqual(['SuperAdmin']);
  });

  it('still enforces the write-side rules on create', () => {
    expect(
      createUserInputSchema.safeParse({ name: 'X', email: 'x@sebsaworld.com', roles: [] }).success,
    ).toBe(false);
    expect(
      createUserInputSchema.safeParse({
        name: 'X',
        email: 'x@sebsaworld.com',
        roles: ['SuperAdmin', 'Admin'],
      }).success,
    ).toBe(false);
    expect(
      createUserInputSchema.safeParse({ name: 'X', email: 'not-an-email', roles: ['Developer'] })
        .success,
    ).toBe(false);
  });
});
