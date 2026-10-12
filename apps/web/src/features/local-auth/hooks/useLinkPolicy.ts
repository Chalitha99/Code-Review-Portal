import { useEffect, useState } from 'react';
import { getLinkPolicy } from '../api/localAuthApi.ts';
import type { LinkPolicy } from '../api/types.ts';

let cached: Promise<LinkPolicy> | null = null;

/** The server's link policy, fetched once per page load; null until it arrives or if it fails. */
export function useLinkPolicy(): LinkPolicy | null {
  const [policy, setPolicy] = useState<LinkPolicy | null>(null);
  useEffect(() => {
    let active = true;
    cached ??= getLinkPolicy().catch((error: unknown) => {
      cached = null;
      throw error;
    });
    cached.then(
      (value) => {
        if (active) setPolicy(value);
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, []);
  return policy;
}

export function resetLinkPolicyCache(): void {
  cached = null;
}

/** "24 hours", "60 minutes", "1 hour 30 minutes". */
export function formatLinkDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  const parts = [
    hours > 0 ? `${String(hours)} ${hours === 1 ? 'hour' : 'hours'}` : '',
    rest > 0 ? `${String(rest)} ${rest === 1 ? 'minute' : 'minutes'}` : '',
  ].filter(Boolean);
  return parts.join(' ');
}
