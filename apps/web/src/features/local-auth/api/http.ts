import { authErrorBodySchema, LocalAuthError } from './types.ts';

/**
 * Transport for the four public auth endpoints.
 *
 * Deliberately not the shared `api` client: that one sends cookies and a CSRF
 * header and retries through a session refresh, and none of that belongs on a
 * request made before anyone is signed in. These calls carry no credentials,
 * are never cached, and put nothing in the URL — the token and the password
 * travel only in the JSON body.
 */
export function postPublic(path: string, body: unknown): Promise<unknown> {
  return requestPublic(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
}

export function getPublic(path: string): Promise<unknown> {
  return requestPublic(path, { method: 'GET', headers: { Accept: 'application/json' } });
}

async function requestPublic(path: string, init: RequestInit): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`/api/auth${path}`, {
      ...init,
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
  } catch {
    throw new LocalAuthError('NETWORK');
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // An empty or non-JSON body is only a problem if the status was an error.
  }

  if (response.ok) return payload;

  const parsed = authErrorBodySchema.safeParse(payload);
  if (response.status >= 500 || !parsed.success) throw new LocalAuthError('SERVER');

  switch (parsed.data.code) {
    case 'TOKEN_EXPIRED':
    case 'TOKEN_INVALID':
    case 'PASSWORD_PERSONAL':
    case 'RATE_LIMITED':
      throw new LocalAuthError(parsed.data.code);
    case 'PASSWORD_POLICY':
      throw new LocalAuthError('PASSWORD_POLICY', parsed.data.failedRules ?? []);
    default:
      throw new LocalAuthError('SERVER');
  }
}
