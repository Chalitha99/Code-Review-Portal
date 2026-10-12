import { describe, expect, it } from 'vitest';
import { emailAddressSchema } from '@sdp/contracts';
import { describeInvite, userStatus } from '@/features/local-auth/admin/inviteDisplay.ts';

const NOW = Date.parse('2026-10-06T12:00:00.000Z');
const inHours = (hours: number) => new Date(NOW + hours * 3_600_000).toISOString();

describe('userStatus', () => {
  it('uses the status the server sent', () => {
    expect(userStatus({ status: 'INVITED', isActive: false })).toBe('INVITED');
  });

  it('falls back to isActive for rows without one', () => {
    expect(userStatus({ isActive: true })).toBe('ACTIVE');
    expect(userStatus({ isActive: false })).toBe('DEACTIVATED');
  });
});

describe('describeInvite', () => {
  const invited = { status: 'INVITED', isActive: false } as const;

  it('is null for rows that are not invited', () => {
    expect(describeInvite({ status: 'ACTIVE', isActive: true }, NOW)).toBeNull();
  });

  it('counts whole hours remaining', () => {
    expect(describeInvite({ ...invited, inviteExpiresAt: inHours(23.5) }, NOW)).toEqual({
      text: 'Expires in 23 h',
      tone: 'neutral',
    });
  });

  it('says under 1 h in the last hour', () => {
    expect(describeInvite({ ...invited, inviteExpiresAt: inHours(0.4) }, NOW)?.text).toBe(
      'Expires in under 1 h',
    );
  });

  it('says Expired once the time has passed', () => {
    expect(describeInvite({ ...invited, inviteExpiresAt: inHours(-1) }, NOW)).toEqual({
      text: 'Expired',
      tone: 'warning',
    });
  });

  it('warns when the email failed on a live invite', () => {
    expect(
      describeInvite({ ...invited, inviteExpiresAt: inHours(5), inviteEmailStatus: 'FAILED' }, NOW),
    ).toEqual({ text: 'Email failed', tone: 'warning' });
  });

  it('prefers Expired over Email failed', () => {
    expect(
      describeInvite({ ...invited, inviteExpiresAt: inHours(-2), inviteEmailStatus: 'FAILED' }, NOW)
        ?.text,
    ).toBe('Expired');
  });

  it('has nothing to say without an expiry or a failure', () => {
    expect(describeInvite({ ...invited, inviteExpiresAt: null }, NOW)).toBeNull();
  });
});

describe('Add user email validation (shared with the server)', () => {
  const MESSAGE = 'Enter a valid email address, for example name@company.com';
  const check = (email: string) => emailAddressSchema.safeParse(email);

  it('trims and lowercases', () => {
    expect(emailAddressSchema.parse('  Name@Company.COM ')).toBe('name@company.com');
  });

  it.each([
    'name@company.com',
    ' Name@Company.com ',
    'a.b+c@sub.company.co.uk',
    'j.doe2@sebsaworld.com',
  ])('accepts %s', (email) => {
    expect(check(email).success).toBe(true);
  });

  it.each([
    '',
    '   ',
    'name',
    'name@',
    '@company.com',
    'name@company',
    'a b@company.com',
    'name@@company.com',
    'name@company.c',
    '.name@company.com',
    'na..me@company.com',
  ])('rejects %j with the format message', (email) => {
    const result = check(email);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(MESSAGE);
  });

  it('allows 254 characters and rejects 255', () => {
    const at254 = `${'a'.repeat(254 - '@company.com'.length)}@company.com`;
    expect(at254).toHaveLength(254);
    expect(check(at254).success).toBe(true);
    expect(check(`a${at254}`).success).toBe(false);
  });
});
