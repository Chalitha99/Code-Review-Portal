/**
 * The in-app path to return to after signing in, or null when there is none or
 * it is not safe to follow.
 *
 * `RequireAuth` stores the attempted location in router state, and router state
 * is browser history: anything that can write history (another script, a crafted
 * `history.pushState`) can put a value there. Following it blindly is an open
 * redirect, so only a same-origin absolute PATH is accepted:
 *
 *   /crp/admin/users       accepted
 *   //evil.example         rejected (protocol-relative URL: another host)
 *   /\evil.example         rejected (browsers normalise `\` to `/`)
 *   https://evil.example   rejected (not a path)
 *
 * Control characters are rejected too: browsers strip tab and newline from URLs,
 * which would turn `/\t/evil.example` back into `//evil.example`.
 */
export function safeRedirectPath(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  if (!value.startsWith('/')) return null;
  if (value.startsWith('//') || value.startsWith('/\\')) return null;
  // eslint-disable-next-line no-control-regex -- matching control characters is the point.
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;
  return value;
}

/** Reads `from` out of router state — see `RequireAuth` — and validates it. */
export function redirectFromState(state: unknown): string | null {
  if (typeof state !== 'object' || state === null || !('from' in state)) return null;
  return safeRedirectPath(state.from);
}
