/**
 * The password policy for the temporary local sign-in, shared by the browser
 * (instant checklist) and NestJS (the authority, `POST /auth/set-password`).
 *
 * One definition, so the rule a user sees ticked is the rule the server
 * enforces. Codes match the `failedRules` array of a 422 `PASSWORD_POLICY`.
 *
 * Passwords are never trimmed here — a leading space is part of the password.
 */

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export const RULE_CODES = [
  'MIN_LENGTH',
  'MAX_LENGTH',
  'UPPERCASE',
  'LOWERCASE',
  'NUMBER',
  'SPECIAL',
] as const;
export type RuleCode = (typeof RULE_CODES)[number];

/**
 * Length in characters as a person counts them: one emoji is one character, not
 * two UTF-16 units. Both sides count code points.
 */
export function passwordLength(password: string): number {
  let count = 0;
  for (const _ of password) count += 1;
  return count;
}

const UPPER = /\p{Lu}/u;
const LOWER = /\p{Ll}/u;
const DIGIT = /\p{Nd}/u;
/** Printable, and neither a letter, a digit, nor whitespace. A space is not "special". */
const SPECIAL = /[^\p{L}\p{Nd}\p{White_Space}\p{C}]/u;

/** Which rules the password satisfies. Pure, and safe on any input including ''. */
export function evaluatePassword(password: string): Record<RuleCode, boolean> {
  const length = passwordLength(password);
  return {
    MIN_LENGTH: length >= PASSWORD_MIN_LENGTH,
    MAX_LENGTH: length <= PASSWORD_MAX_LENGTH,
    UPPERCASE: UPPER.test(password),
    LOWERCASE: LOWER.test(password),
    NUMBER: DIGIT.test(password),
    SPECIAL: SPECIAL.test(password),
  };
}

/** The rule codes the password fails, in contract order. */
export function failedPasswordRules(password: string): RuleCode[] {
  const results = evaluatePassword(password);
  return RULE_CODES.filter((code) => !results[code]);
}

/** Short, very common choices the policy rules alone would let through. */
const COMMON_PASSWORDS = ['password', 'qwerty', 'letmein', 'welcome', 'admin', '123456', 'sebsa'];

/**
 * Server-only check (422 `PASSWORD_PERSONAL`): the password contains part of the
 * user's name or email address, or a well-known password.
 */
export function isPersonalPassword(
  password: string,
  person: { readonly name: string; readonly email: string },
): boolean {
  const lower = password.toLowerCase();
  const local = person.email.split('@')[0]?.toLowerCase() ?? '';
  const parts = [
    ...local.split(/[^a-z0-9]+/),
    ...person.name.toLowerCase().split(/\s+/),
    ...COMMON_PASSWORDS,
  ].filter((part) => part.length >= 3);
  return parts.some((part) => lower.includes(part));
}
