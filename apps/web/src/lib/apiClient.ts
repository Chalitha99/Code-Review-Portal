import type { z } from 'zod';
import { apiErrorSchema } from '@sdp/contracts';
import { logger } from './logger.ts';

/**
 * The single HTTP seam between the application and its data.
 *
 * This layer issues real `fetch` calls to relative URLs. In development the
 * Vite proxy forwards them to NestJS; production serves the same `/api` URLs.
 *
 * Responses are parsed through the Zod schema the caller supplies. That costs
 * microseconds against a network round-trip and buys the thing most likely to
 * bite us: a backend that quietly returns a differently-shaped payload than the
 * shared contract promises. Better a loud error here than `undefined` surfacing
 * three components away.
 */

const API_BASE = '/api';

export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly fieldErrors: Record<string, string[]> | undefined;
  readonly correlationId: string | undefined;
  readonly details: unknown;

  constructor(init: {
    statusCode: number;
    code: string;
    message: string;
    fieldErrors?: Record<string, string[]> | undefined;
    correlationId?: string | undefined;
    details?: unknown;
  }) {
    super(init.message);
    this.name = 'ApiError';
    this.statusCode = init.statusCode;
    this.code = init.code;
    this.fieldErrors = init.fieldErrors;
    this.correlationId = init.correlationId;
    this.details = init.details;
  }

  /** 4xx responses are the user's problem to fix; retrying will not help. */
  get isClientError(): boolean {
    return this.statusCode >= 400 && this.statusCode < 500;
  }
}

/**
 * Thrown when a response parses as JSON but does not match the expected schema.
 * Distinct from ApiError because the cause is a broken contract, not a failed
 * request — it should reach an engineer, not be shown to a user as-is.
 */
export class ApiContractError extends Error {
  readonly issues: z.ZodError['issues'];

  constructor(path: string, issues: z.ZodError['issues']) {
    super(`Response from ${path} did not match its schema`);
    this.name = 'ApiContractError';
    this.issues = issues;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  searchParams?: Record<string, string | number | boolean | undefined | null>;
}

function buildUrl(path: string, searchParams?: RequestOptions['searchParams']): string {
  const url = `${API_BASE}${path}`;
  if (!searchParams) return url;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value !== undefined && value !== null && value !== '') {
      params.append(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

async function toApiError(response: Response, path: string): Promise<ApiError> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const parsed = apiErrorSchema.safeParse(payload);
  if (parsed.success) {
    return new ApiError(parsed.data);
  }

  // The server failed in a way it did not describe (proxy error, 502, HTML page).
  return new ApiError({
    statusCode: response.status,
    code: 'UNKNOWN',
    message: `Request to ${path} failed with status ${response.status}`,
  });
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  const { method = 'GET', body, signal, searchParams } = options;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (!['GET'].includes(method)) {
    const csrf = readCookie('sdp_csrf');
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }

  try {
    return await fetch(buildUrl(path, searchParams), {
      method,
      headers,
      credentials: 'include',
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...(signal ? { signal } : {}),
    });
  } catch (cause) {
    // fetch only rejects on a genuine transport failure, never on 4xx/5xx.
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new ApiError({
      statusCode: 0,
      code: 'NETWORK',
      message: 'Could not reach the server. Check your connection and try again.',
    });
  }
}

async function request<TSchema extends z.ZodTypeAny>(
  path: string,
  schema: TSchema,
  options: RequestOptions = {},
): Promise<z.infer<TSchema>> {
  let response = await send(path, options);

  if (response.status === 401 && shouldRefresh(path)) {
    if (await refreshAuthentication()) response = await send(path, options);
    if (response.status === 401) window.dispatchEvent(new Event('sdp:unauthorized'));
  }

  if (!response.ok) {
    throw await toApiError(response, path);
  }

  if (response.status === 204) {
    return schema.parse(undefined);
  }

  const json: unknown = await response.json();
  const result = schema.safeParse(json);
  if (!result.success) {
    logger.error(`Response from ${path} did not match its schema`, {
      issues: result.error.issues.slice(0, 10),
    });
    throw new ApiContractError(path, result.error.issues);
  }
  return result.data;
}

function shouldRefresh(path: string): boolean {
  return !['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'].includes(path);
}

let refreshInFlight: Promise<boolean> | null = null;

function refreshAuthentication(): Promise<boolean> {
  const csrf = readCookie('sdp_csrf');
  refreshInFlight ??= fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { Accept: 'application/json', ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
    credentials: 'include',
  })
    .then((response) => response.ok)
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const prefix = `${name}=`;
  const pair = document.cookie.split('; ').find((entry) => entry.startsWith(prefix));
  return pair ? decodeURIComponent(pair.slice(prefix.length)) : undefined;
}

/**
 * Wraps a schema so a 204 becomes `null` rather than `undefined`.
 *
 * Several endpoints answer 204 for "this exists but has nothing yet" — a task
 * with no checklist, a review not started. `schema.nullish()` alone parses the
 * 204's `undefined` straight through, and TanStack Query REJECTS `undefined` as
 * query data: the query lands in an error state and the screen renders its empty
 * branch, which looks exactly like the correct result. That is how this went
 * unnoticed until a browser console showed "Query data cannot be undefined".
 *
 * Use this for any endpoint that can answer 204 with a body-shaped absence.
 */
export function absentAsNull<TOutput>(schema: z.ZodType<TOutput>): z.ZodType<TOutput | null> {
  return schema.nullish().transform((value) => value ?? null);
}

export const api = {
  get: <TSchema extends z.ZodTypeAny>(
    path: string,
    schema: TSchema,
    options?: Omit<RequestOptions, 'method' | 'body'>,
  ) => request(path, schema, { ...options, method: 'GET' }),

  post: <TSchema extends z.ZodTypeAny>(
    path: string,
    schema: TSchema,
    body?: unknown,
    options?: Omit<RequestOptions, 'method' | 'body'>,
  ) => request(path, schema, { ...options, method: 'POST', body }),

  patch: <TSchema extends z.ZodTypeAny>(
    path: string,
    schema: TSchema,
    body?: unknown,
    options?: Omit<RequestOptions, 'method' | 'body'>,
  ) => request(path, schema, { ...options, method: 'PATCH', body }),

  /**
   * PUT, for resources the client replaces wholesale — the task checklist is
   * saved as one document rather than patched question by question, so a partial
   * save cannot leave answers from a task type the developer has deselected.
   */
  put: <TSchema extends z.ZodTypeAny>(
    path: string,
    schema: TSchema,
    body?: unknown,
    options?: Omit<RequestOptions, 'method' | 'body'>,
  ) => request(path, schema, { ...options, method: 'PUT', body }),

  delete: <TSchema extends z.ZodTypeAny>(
    path: string,
    schema: TSchema,
    options?: Omit<RequestOptions, 'method'>,
  ) => request(path, schema, { ...options, method: 'DELETE' }),
};
