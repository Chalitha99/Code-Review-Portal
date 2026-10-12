import { z } from 'zod';
import { api } from '@/lib/apiClient.ts';
import { getPublic, postPublic } from './http.ts';
import {
  LocalAuthError,
  linkPolicySchema,
  okSchema,
  resendInviteResponseSchema,
  resetLinkResponseSchema,
  validateResultSchema,
  type Invite,
  type LinkPolicy,
  type ValidateResult,
} from './types.ts';

/**
 * The only module the screens use to reach the backend. One function per
 * endpoint in the shared contract, so connecting the real API means changing
 * nothing outside this folder.
 *
 * They are served by NestJS (`apps/api` password-links module).
 */

/* --------------------------------- public --------------------------------- */

/** Never consumes the token. */
export async function validateToken(token: string): Promise<ValidateResult> {
  const payload = await postPublic('/token/validate', { token });
  const parsed = validateResultSchema.safeParse(payload);
  if (!parsed.success) throw new LocalAuthError('SERVER');
  return parsed.data;
}

/** Throws `LocalAuthError` — TOKEN_*, PASSWORD_*, RATE_LIMITED, NETWORK or SERVER. */
export async function setPassword(token: string, newPassword: string): Promise<void> {
  const parsed = okSchema.safeParse(await postPublic('/set-password', { token, newPassword }));
  if (!parsed.success) throw new LocalAuthError('SERVER');
}

/** Always 202 for any token; only a rate limit or a transport failure throws. */
export async function resendLink(token: string): Promise<void> {
  await postPublic('/resend-link', { token });
}

export async function getLinkPolicy(): Promise<LinkPolicy> {
  return linkPolicySchema.parse(await getPublic('/link-policy'));
}

/** Always 202 for any email; only a rate limit or a transport failure throws. */
export async function forgotPassword(email: string): Promise<void> {
  await postPublic('/forgot-password', { email });
}

/* ------------------------------ signed-in admin --------------------------- */
/* These ride the shared client: it already attaches the caller's session.
   Creating the user is the ordinary `POST /users`, which also sends the invite. */

export async function resendInvite(userId: string): Promise<Invite> {
  const { invite } = await api.post(
    `/users/${encodeURIComponent(userId)}/resend-invite`,
    resendInviteResponseSchema,
  );
  return invite;
}

export async function sendResetLink(userId: string): Promise<Invite> {
  const { reset } = await api.post(
    `/users/${encodeURIComponent(userId)}/reset-password-link`,
    resetLinkResponseSchema,
  );
  return reset;
}

export async function revokeInvite(userId: string): Promise<void> {
  await api.post(`/users/${encodeURIComponent(userId)}/revoke-invite`, z.undefined());
}
