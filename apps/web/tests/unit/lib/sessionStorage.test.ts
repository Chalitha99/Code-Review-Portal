import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearSession,
  purgeLegacyStorage,
  readSession,
  readSessionUserId,
  renewSession,
  resetRenewalThrottleForTest,
  writeSession,
  SESSION_TTL_MS,
} from '@/lib/sessionStorage.ts';

/**
 * The session envelope.
 *
 * This module exists because the identity used to be a bare user id in storage
 * with no expiry — a session that lived forever — and a *copy* of it in
 * `apiClient` module scope that Vite HMR could reset while React state survived.
 * The tests below pin both halves: the expiry rule, and the fact that reading is
 * what enforces it.
 */

const KEY = 'sdp.session';

/** Writes an envelope directly, so a test can place the deadline where it likes. */
function seed(userId: string, expiresAt: number, remember = true): void {
  const store = remember ? window.localStorage : window.sessionStorage;
  store.setItem(KEY, JSON.stringify({ userId, expiresAt, remember }));
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  resetRenewalThrottleForTest();
});

describe('reading', () => {
  it('returns the session while it is live', () => {
    seed('u-hiruni', Date.now() + 60_000);

    expect(readSession()?.userId).toBe('u-hiruni');
    expect(readSessionUserId()).toBe('u-hiruni');
  });

  /**
   * The negative control for the whole feature. One millisecond past the
   * deadline is expired — there is no grace period, because a grace period is
   * just a longer, undocumented session.
   */
  it('refuses a session that expired one millisecond ago', () => {
    seed('u-hiruni', Date.now() - 1);

    expect(readSession()).toBeNull();
    expect(readSessionUserId()).toBeNull();
  });

  it('clears an expired envelope as it reads it', () => {
    seed('u-hiruni', Date.now() - 1);
    readSession();

    // Left in place, the next read would keep paying to parse and reject it —
    // and a future bug that skipped the expiry check would resurrect the session.
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it('drops a pre-envelope value rather than trusting it', () => {
    // What the previous implementation wrote: a bare id, no expiry.
    window.localStorage.setItem(KEY, 'u-hiruni');

    expect(readSession()).toBeNull();
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it('survives a corrupt envelope', () => {
    window.localStorage.setItem(KEY, '{not json');
    expect(readSession()).toBeNull();
  });
});

describe('writing', () => {
  it('sets an expiry one TTL out', () => {
    const before = Date.now();
    writeSession('u-hiruni', true);

    const expiresAt = readSession()?.expiresAt ?? 0;
    expect(expiresAt).toBeGreaterThanOrEqual(before + SESSION_TTL_MS - 50);
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + SESSION_TTL_MS);
  });

  it('keeps exactly one copy when Remember me is toggled', () => {
    writeSession('u-hiruni', true);
    writeSession('u-hiruni', false);

    // A stale copy in the other store would silently win on the next visit,
    // because reading checks localStorage first.
    expect(window.localStorage.getItem(KEY)).toBeNull();
    expect(window.sessionStorage.getItem(KEY)).not.toBeNull();
  });

  it('clears both stores on sign-out', () => {
    writeSession('u-hiruni', true);
    clearSession();

    expect(readSession()).toBeNull();
    expect(window.localStorage.getItem(KEY)).toBeNull();
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
  });
});

describe('sliding renewal', () => {
  it('pushes the deadline out', () => {
    seed('u-hiruni', Date.now() + 60_000);

    const renewed = renewSession();

    expect(renewed).not.toBeNull();
    expect(renewed!).toBeGreaterThan(Date.now() + SESSION_TTL_MS - 1_000);
  });

  it('throttles repeat renewals', () => {
    seed('u-hiruni', Date.now() + 60_000);

    expect(renewSession()).not.toBeNull();
    // Renewal fires on every successful response; without the throttle that is
    // a synchronous storage write per request.
    expect(renewSession()).toBeNull();
  });

  /**
   * The second negative control: renewal must never resurrect a dead session.
   * Without the `readSession()` guard inside `renewSession`, an expired session
   * would be revived by the next background refetch and the two-hour limit
   * would mean nothing.
   */
  it('does not revive an expired session', () => {
    seed('u-hiruni', Date.now() - 1);

    expect(renewSession()).toBeNull();
    expect(readSession()).toBeNull();
  });

  it('does nothing when there is no session', () => {
    expect(renewSession()).toBeNull();
  });
});

describe('purgeLegacyStorage', () => {
  it('removes the old mock database keys and leaves the session alone', () => {
    window.localStorage.setItem('sdp-mock-database-v1', '{}');
    window.localStorage.setItem('sdp:mock-db', '{}');
    window.sessionStorage.setItem('sdp:mock-db', '{}');
    seed('u-hiruni', Date.now() + 60_000);

    purgeLegacyStorage();

    expect(window.localStorage.getItem('sdp-mock-database-v1')).toBeNull();
    expect(window.localStorage.getItem('sdp:mock-db')).toBeNull();
    expect(window.sessionStorage.getItem('sdp:mock-db')).toBeNull();
    expect(readSessionUserId()).toBe('u-hiruni');
  });
});
