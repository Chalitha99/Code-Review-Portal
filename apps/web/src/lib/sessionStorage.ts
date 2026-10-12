/**
 * The persisted session envelope, and the only module that touches storage.
 *
 * Framework-free on purpose: both `lib/apiClient.ts` (which needs the caller's
 * identity on every request) and `hooks/useSession.ts` (which needs it for React)
 * read from here. Putting it in one place keeps the dependency direction
 * one-way — nothing here imports either of them — and, more importantly, means
 * the identity is never *copied* into module state that a reset could lose.
 *
 * That copy is what caused a real bug: `apiClient` held `let mockUserId`, Vite
 * HMR re-evaluated the module and reset it to `null` while React state survived,
 * and every subsequent request went out unauthenticated while the UI still
 * believed it was signed in.
 *
 * Phase 2 replaces the body of this file with OIDC token handling. The envelope
 * shape — an id plus an expiry — is already the shape a token has, so callers do
 * not change.
 */

const STORAGE_KEY = 'sdp.session';

/**
 * How long a session survives without activity.
 *
 * Two hours, sliding: every successful API response pushes the deadline out, so
 * somebody actively working is never interrupted, and only genuine inactivity
 * signs them out.
 */
export const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

/**
 * Minimum gap between renewal writes.
 *
 * Renewal fires on every successful response, and a `localStorage` write is
 * synchronous and hits the main thread. Throttling to once a minute keeps the
 * sliding window accurate to well within its two-hour scale while turning
 * hundreds of writes into a handful.
 */
const RENEWAL_THROTTLE_MS = 60 * 1000;

export interface StoredSession {
  userId: string;
  /** Epoch milliseconds. The session is dead at or after this instant. */
  expiresAt: number;
  /** Which backing store it lives in — localStorage survives a browser restart. */
  remember: boolean;
}

function storageFor(remember: boolean): Storage | null {
  try {
    return remember ? window.localStorage : window.sessionStorage;
  } catch {
    // Private browsing can throw on access. A session that cannot be persisted
    // is not fatal; the user signs in again.
    return null;
  }
}

/** Reads the raw envelope without applying the expiry rule. */
function readEnvelope(): StoredSession | null {
  if (typeof window === 'undefined') return null;

  for (const remember of [true, false]) {
    const store = storageFor(remember);
    const raw = store?.getItem(STORAGE_KEY);
    if (raw === null || raw === undefined) continue;

    try {
      const parsed: unknown = JSON.parse(raw);
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'userId' in parsed &&
        typeof parsed.userId === 'string' &&
        'expiresAt' in parsed &&
        typeof parsed.expiresAt === 'number'
      ) {
        return { userId: parsed.userId, expiresAt: parsed.expiresAt, remember };
      }
    } catch {
      /* Fall through — a malformed envelope is treated as no session. */
    }

    // Anything else in this key is from before the envelope existed, or is
    // corrupt. Drop it rather than trying to interpret it: a session with no
    // expiry is exactly what this change exists to remove.
    store?.removeItem(STORAGE_KEY);
  }

  return null;
}

/**
 * The live session, or `null`.
 *
 * Expiry is enforced HERE rather than by a timer, so a session cannot outlive
 * its deadline just because the tab was closed while the timer was pending. An
 * expired envelope is cleared as a side effect — reading is the moment we know.
 */
export function readSession(): StoredSession | null {
  const envelope = readEnvelope();
  if (envelope === null) return null;

  if (Date.now() >= envelope.expiresAt) {
    clearSession();
    return null;
  }

  return envelope;
}

/** The signed-in user id, or `null`. The hot path — called on every request. */
export function readSessionUserId(): string | null {
  return readSession()?.userId ?? null;
}

export function writeSession(userId: string, remember: boolean): void {
  // Clear both first: toggling Remember me must not leave a stale copy in the
  // other store that would silently win on the next visit.
  clearSession();

  const store = storageFor(remember);
  if (store === null) return;

  const envelope: StoredSession = {
    userId,
    expiresAt: Date.now() + SESSION_TTL_MS,
    remember,
  };
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(envelope));
  } catch {
    /* Session simply will not survive a reload. */
  }
  lastRenewalAt = Date.now();
}

/**
 * Everything this application persists is namespaced `sdp.`.
 *
 * Purging by PREFIX rather than from a list of known keys is deliberate. The
 * session envelope was the only key `clearSession` removed, so the wizard draft
 * (`sdp.taskDraft`) survived a sign-out — and the next person to sign in on a
 * shared browser inherited a stranger's half-written task. A list would have to
 * be updated every time a new store is persisted, which is exactly the kind of
 * step that gets forgotten; a prefix covers keys that do not exist yet.
 *
 * A registry the feature stores could register into would also work, and is
 * worse: `lib/` may not import a feature, so the registration would have to
 * happen as a side effect of module load, which is load-order dependent.
 */
const STORAGE_PREFIX = 'sdp.';

/**
 * Removes every value this app has stored for the signed-in user, from both
 * backing stores.
 *
 * Both, unconditionally, and not just the one the session chose: `remember`
 * decides where the ENVELOPE lives, while other stores pick their own backing
 * (the draft uses `sessionStorage` so a refresh keeps it but a new tab does
 * not). Signing out has to clear all of it either way.
 */
export function clearUserStorage(): void {
  for (const store of [window.localStorage, window.sessionStorage]) {
    try {
      // Collected first, then removed: removing while iterating `key(i)`
      // reindexes the store and skips entries.
      const doomed: string[] = [];
      for (let index = 0; index < store.length; index += 1) {
        const key = store.key(index);
        if (key?.startsWith(STORAGE_PREFIX) === true) doomed.push(key);
      }
      for (const key of doomed) store.removeItem(key);
    } catch {
      /* Private browsing can throw on access. Nothing more we can do. */
    }
  }
}

// Left in browsers by the removed mock API; nothing reads them now.
const LEGACY_KEYS = ['sdp-mock-database-v1', 'sdp:mock-db'] as const;

export function purgeLegacyStorage(): void {
  for (const store of [window.localStorage, window.sessionStorage]) {
    try {
      for (const key of LEGACY_KEYS) store.removeItem(key);
    } catch {
      /* Private browsing can throw on access. */
    }
  }
}

export function clearSession(): void {
  clearUserStorage();
}

let lastRenewalAt = 0;

/**
 * Pushes the expiry deadline out — the sliding half of the window.
 *
 * Called from `apiClient` after every successful response, which is the closest
 * thing the app has to "the user is doing something". Deliberately a no-op when
 * there is no live session, so it can never resurrect an expired one.
 *
 * Returns the new deadline when it wrote, `null` when it was throttled or there
 * was nothing to renew — the caller uses that to re-arm its expiry timer.
 */
export function renewSession(): number | null {
  const now = Date.now();
  if (now - lastRenewalAt < RENEWAL_THROTTLE_MS) return null;

  const session = readSession();
  if (session === null) return null;

  const store = storageFor(session.remember);
  if (store === null) return null;

  const expiresAt = now + SESSION_TTL_MS;
  try {
    store.setItem(
      STORAGE_KEY,
      JSON.stringify({
        userId: session.userId,
        expiresAt,
        remember: session.remember,
      }),
    );
  } catch {
    return null;
  }

  lastRenewalAt = now;
  return expiresAt;
}

/** Test seam: lets a test drive the throttle without waiting a real minute. */
export function resetRenewalThrottleForTest(): void {
  lastRenewalAt = 0;
}

/** The storage key, exported so a `storage` event listener can filter on it. */
export const SESSION_STORAGE_KEY = STORAGE_KEY;
