import { describe, expect, it } from 'vitest';
import {
  checklistStatus,
  evaluatePassword,
  isPasswordAcceptable,
  passwordLength,
  passwordStrength,
  passwordsMatch,
} from '@/features/local-auth/domain/passwordRules.ts';

const VALID = 'Abcdefgh1234!';

describe('evaluatePassword', () => {
  it('passes every rule for a good password', () => {
    expect(evaluatePassword(VALID)).toEqual({
      MIN_LENGTH: true,
      MAX_LENGTH: true,
      UPPERCASE: true,
      LOWERCASE: true,
      NUMBER: true,
      SPECIAL: true,
    });
  });

  it('fails the character rules and keeps MAX_LENGTH true for an empty string', () => {
    expect(evaluatePassword('')).toEqual({
      MIN_LENGTH: false,
      MAX_LENGTH: true,
      UPPERCASE: false,
      LOWERCASE: false,
      NUMBER: false,
      SPECIAL: false,
    });
  });

  it.each([
    ['MIN_LENGTH', 'Abcdefg1!'],
    ['UPPERCASE', 'abcdefgh1234!'],
    ['LOWERCASE', 'ABCDEFGH1234!'],
    ['NUMBER', 'Abcdefghijkl!'],
    ['SPECIAL', 'Abcdefgh12345'],
  ] as const)('flags %s when it is the only thing missing', (code, password) => {
    const result = evaluatePassword(password);
    expect(result[code]).toBe(false);
    expect(Object.entries(result).filter(([, ok]) => !ok)).toHaveLength(1);
  });

  describe('length boundaries', () => {
    const pad = (length: number) => `Aa1!${'x'.repeat(length - 4)}`;

    it('rejects 11 and accepts exactly 12 characters', () => {
      expect(evaluatePassword(pad(11)).MIN_LENGTH).toBe(false);
      expect(evaluatePassword(pad(12)).MIN_LENGTH).toBe(true);
    });

    it('accepts exactly 128 and rejects 129 characters', () => {
      expect(evaluatePassword(pad(128)).MAX_LENGTH).toBe(true);
      expect(evaluatePassword(pad(129)).MAX_LENGTH).toBe(false);
    });
  });

  describe('unicode', () => {
    it('counts an emoji as one character, not two', () => {
      expect(passwordLength('😀')).toBe(1);
      expect(evaluatePassword(`Aa1${'😀'.repeat(9)}`).MIN_LENGTH).toBe(true);
      expect(evaluatePassword(`Aa1${'😀'.repeat(8)}`).MIN_LENGTH).toBe(false);
    });

    it('recognises non-ASCII letters and digits', () => {
      const result = evaluatePassword('Ünïcödé٣ñ');
      expect(result.UPPERCASE).toBe(true);
      expect(result.LOWERCASE).toBe(true);
      expect(result.NUMBER).toBe(true);
    });

    it('treats an emoji or a symbol as special, but a letter as not special', () => {
      expect(evaluatePassword('😀').SPECIAL).toBe(true);
      expect(evaluatePassword('€').SPECIAL).toBe(true);
      expect(evaluatePassword('é').SPECIAL).toBe(false);
    });
  });

  describe('spaces', () => {
    it('counts spaces toward length but never as special', () => {
      expect(evaluatePassword(' '.repeat(12)).MIN_LENGTH).toBe(true);
      expect(evaluatePassword(' ').SPECIAL).toBe(false);
      expect(evaluatePassword('Abcdefgh1234 ').SPECIAL).toBe(false);
    });

    it('does not trim: padding changes the length', () => {
      expect(evaluatePassword('Aa1!aaaa  ').MIN_LENGTH).toBe(false);
      expect(evaluatePassword('  Aa1!aaaa  ').MIN_LENGTH).toBe(true);
    });

    it('does not treat control characters as special', () => {
      expect(evaluatePassword('\t\n').SPECIAL).toBe(false);
    });
  });
});

describe('passwordsMatch', () => {
  it('requires equal, non-empty values', () => {
    expect(passwordsMatch('a', 'a')).toBe(true);
    expect(passwordsMatch('a', 'b')).toBe(false);
    expect(passwordsMatch('', '')).toBe(false);
  });

  it('is case and whitespace sensitive', () => {
    expect(passwordsMatch('Abc', 'abc')).toBe(false);
    expect(passwordsMatch('abc', 'abc ')).toBe(false);
  });
});

describe('isPasswordAcceptable', () => {
  it('needs every rule and a matching confirmation', () => {
    expect(isPasswordAcceptable(VALID, VALID)).toBe(true);
    expect(isPasswordAcceptable(VALID, `${VALID}x`)).toBe(false);
    expect(isPasswordAcceptable('short1A!', 'short1A!')).toBe(false);
  });

  it('rejects a password over 128 characters even when the rest pass', () => {
    const long = `Aa1!${'x'.repeat(125)}`;
    expect(isPasswordAcceptable(long, long)).toBe(false);
  });
});

describe('checklistStatus', () => {
  it('reports the match row separately from the server rules', () => {
    expect(checklistStatus(VALID, 'other')).toMatchObject({ MIN_LENGTH: true, MATCH: false });
    expect(checklistStatus(VALID, VALID).MATCH).toBe(true);
  });
});

describe('passwordStrength', () => {
  it('is 0 when empty and capped at 1 under the minimum length', () => {
    expect(passwordStrength('')).toBe(0);
    expect(passwordStrength('Aa1!')).toBe(1);
  });

  it('rises with variety and length', () => {
    expect(passwordStrength('abcdefghijkl')).toBe(2);
    expect(passwordStrength('Abcdefgh1234!')).toBe(3);
    expect(passwordStrength('Abcdefgh1234!xyz')).toBe(4);
  });
});
