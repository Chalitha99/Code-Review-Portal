/**
 * The password rules, in one place.
 *
 * Codes and wording match the API contract (`failedRules` in a 422). The server
 * is the authority; this file only gives the user the same answer before they
 * submit.
 */

import {
  PASSWORD_MIN_LENGTH,
  RULE_CODES,
  evaluatePassword,
  passwordLength,
  type RuleCode,
} from '@sdp/contracts';

/*
 * The rules themselves (lengths, codes, evaluation) live in @sdp/contracts
 * (passwordPolicy.ts) so NestJS enforces exactly what this checklist shows.
 * Re-exported here so the screens keep one import path.
 */
export {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  RULE_CODES,
  evaluatePassword,
  passwordLength,
  type RuleCode,
} from '@sdp/contracts';

/** The checklist row for "both passwords match" has no server code. */
export type ChecklistRuleId = Exclude<RuleCode, 'MAX_LENGTH'> | 'MATCH';

export const CHECKLIST_RULES: readonly { id: ChecklistRuleId; label: string }[] = [
  { id: 'MIN_LENGTH', label: '12+ characters' },
  { id: 'UPPERCASE', label: 'Uppercase letter' },
  { id: 'LOWERCASE', label: 'Lowercase letter' },
  { id: 'NUMBER', label: 'A number' },
  { id: 'SPECIAL', label: 'A symbol (! @ # $ %)' },
  { id: 'MATCH', label: 'Passwords match' },
];

export function passwordsMatch(password: string, confirm: string): boolean {
  return password !== '' && password === confirm;
}

/** Every rule passes and the two entries agree. Gates the submit button. */
export function isPasswordAcceptable(password: string, confirm: string): boolean {
  const results = evaluatePassword(password);
  return RULE_CODES.every((code) => results[code]) && passwordsMatch(password, confirm);
}

export function checklistStatus(
  password: string,
  confirm: string,
): Record<ChecklistRuleId, boolean> {
  const results = evaluatePassword(password);
  return {
    MIN_LENGTH: results.MIN_LENGTH,
    UPPERCASE: results.UPPERCASE,
    LOWERCASE: results.LOWERCASE,
    NUMBER: results.NUMBER,
    SPECIAL: results.SPECIAL,
    MATCH: passwordsMatch(password, confirm),
  };
}

export type StrengthLevel = 0 | 1 | 2 | 3 | 4;
export const STRENGTH_LABELS: Record<StrengthLevel, string> = {
  0: '',
  1: 'Weak',
  2: 'Fair',
  3: 'Good',
  4: 'Strong',
};

/**
 * Four-segment hint. Never gates anything — the rules do that.
 *
 * Under the minimum length it is capped at 1. Past it, one segment each for
 * having all four character kinds, and for 16 and 20+ characters.
 */
export function passwordStrength(password: string): StrengthLevel {
  if (password === '') return 0;
  const length = passwordLength(password);
  if (length < PASSWORD_MIN_LENGTH) return 1;

  const results = evaluatePassword(password);
  const level =
    2 +
    (results.UPPERCASE && results.LOWERCASE && results.NUMBER && results.SPECIAL ? 1 : 0) +
    (length >= 16 ? 1 : 0);
  return Math.min(4, level) as StrengthLevel;
}
