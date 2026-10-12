import type { LinkPurpose } from '../api/types.ts';

/**
 * What the link-expired screen is told, through router state and never the URL.
 * The token is only included for an expired link, the one case where resending
 * needs it.
 */
export interface LinkExpiredState {
  reason: 'expired' | 'invalid';
  purpose?: LinkPurpose;
  token?: string;
}

export function expiredState(input: {
  reason: 'expired' | 'invalid';
  purpose: LinkPurpose | undefined;
  token: string | null;
}): LinkExpiredState {
  return {
    reason: input.reason,
    ...(input.purpose === undefined ? {} : { purpose: input.purpose }),
    ...(input.reason === 'expired' && input.token !== null ? { token: input.token } : {}),
  };
}
