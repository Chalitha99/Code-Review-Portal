import { z } from 'zod';
import { RULE_CODES, type RuleCode } from '../domain/passwordRules.ts';

/** What a link is for. It picks the wording of the password screen. */
export const linkPurposeSchema = z.enum(['INVITE', 'RESET']);
export type LinkPurpose = z.infer<typeof linkPurposeSchema>;

export const validateResultSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('valid'),
    purpose: linkPurposeSchema,
    emailHint: z.string(),
    expiresAt: z.string(),
  }),
  z.object({ status: z.literal('expired'), purpose: linkPurposeSchema }),
  z.object({ status: z.literal('invalid') }),
]);
export type ValidateResult = z.infer<typeof validateResultSchema>;

export const okSchema = z.object({ ok: z.literal(true) });

/** Link lifetimes and resend cooldown, as the API is configured. */
export const linkPolicySchema = z.object({
  inviteTtlMinutes: z.number().positive(),
  resetTtlMinutes: z.number().positive(),
  resendCooldownSeconds: z.number().nonnegative(),
});
export type LinkPolicy = z.infer<typeof linkPolicySchema>;

export const authErrorBodySchema = z.object({
  code: z.string(),
  message: z.string().optional(),
  failedRules: z.array(z.enum(RULE_CODES)).optional(),
});

/** Error codes the public endpoints return, plus the two the client adds. */
export type AuthErrorCode =
  | 'TOKEN_EXPIRED'
  | 'TOKEN_INVALID'
  | 'PASSWORD_POLICY'
  | 'PASSWORD_PERSONAL'
  | 'RATE_LIMITED'
  | 'NETWORK'
  | 'SERVER';

export class LocalAuthError extends Error {
  readonly code: AuthErrorCode;
  readonly failedRules: readonly RuleCode[];

  constructor(code: AuthErrorCode, failedRules: readonly RuleCode[] = []) {
    super(code);
    this.name = 'LocalAuthError';
    this.code = code;
    this.failedRules = failedRules;
  }
}

/* ------------------------------ admin invites ----------------------------- */

export const inviteEmailStatusSchema = z.enum(['SENT', 'FAILED']);
export type InviteEmailStatus = z.infer<typeof inviteEmailStatusSchema>;

export const inviteSchema = z.object({
  expiresAt: z.string(),
  emailStatus: inviteEmailStatusSchema,
});
export type Invite = z.infer<typeof inviteSchema>;

export const resendInviteResponseSchema = z.object({ invite: inviteSchema });
export const resetLinkResponseSchema = z.object({ reset: inviteSchema });
