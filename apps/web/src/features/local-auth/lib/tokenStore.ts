/**
 * Holds the one-time link token in memory only — never localStorage,
 * sessionStorage, a cookie, a log line or a query string.
 *
 * The `#token=` fragment stays in the address bar until the server has saved the
 * password, so a reload keeps working; fragments are never sent to a server or
 * in Referer. `scrubTokenFromUrl` removes it once the link is spent or unusable.
 */

let current: string | null = null;

export function getToken(): string | null {
  return current;
}

export function setToken(token: string | null): void {
  current = token;
}

export function clearToken(): void {
  current = null;
}

/** Pulls `token` out of a location hash such as `#token=abc`. */
export function parseTokenFromHash(hash: string): string | null {
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const token = params.get('token');
  return token !== null && token !== '' ? token : null;
}

/** The address bar is the only source, so a token left from an earlier link is never reused. */
export function captureTokenFromLocation(): string | null {
  current = parseTokenFromHash(window.location.hash);
  return current;
}

export function scrubTokenFromUrl(): void {
  if (parseTokenFromHash(window.location.hash) === null) return;
  window.history.replaceState(
    window.history.state,
    '',
    `${window.location.pathname}${window.location.search}`,
  );
}

/**
 * Router state survives in the browser's session history — and so across a
 * reload — which would defeat "memory only". Moves a token out of the current
 * history entry's state into the store and rewrites the entry without it.
 */
export function adoptTokenFromHistoryState(token: string | undefined): string | null {
  if (token !== undefined && token !== '') current = token;

  const state = window.history.state as { usr?: Record<string, unknown> } | null;
  if (state?.usr && 'token' in state.usr) {
    const { token: _removed, ...rest } = state.usr;
    window.history.replaceState({ ...state, usr: rest }, '');
  }
  return current;
}
