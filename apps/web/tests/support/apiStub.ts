/**
 * Per-test canned HTTP answers for component tests — NOT a mock server.
 *
 * The browser app talks to NestJS; there is no fake backend any more. A
 * component test declares, for the screen under test, what the server answers:
 *
 *   apiStub.get('/tasks/:taskId', ({ params }) => aTaskListItem({ id: params.taskId }));
 *   apiStub.post('/tasks/:taskId/pick', () => picked);
 *   expect(apiStub.requests('POST', '/tasks/:taskId/pick')).toHaveLength(1);
 *
 * The real `apiClient` runs end to end (fetch, status handling, Zod contract
 * parsing), only `fetch` itself is replaced. Business rules live in NestJS and
 * are tested there (apps/api); a reply here is whatever the test says it is.
 *
 * Any request a test did not declare fails that test (see `setup.ts`), the same
 * strictness the old `onUnhandledRequest: 'error'` gave: a screen that starts
 * calling a new endpoint must say so in its tests.
 */

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface StubRequest {
  method: Method;
  /** Path below `/api`, without the query string, e.g. `/tasks/t-1`. */
  path: string;
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
}

/** Returned from a handler to control the status; anything else is a 200 JSON body. */
export class StubReply {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body?: unknown) {
    this.status = status;
    this.body = body;
  }
}

/** `reply(204)`, `reply(409, apiError('ALREADY_PICKED', '...'))`. */
export function reply(status: number, body?: unknown): StubReply {
  return new StubReply(status, body);
}

/** The NestJS public error envelope (`apiErrorSchema`). */
export function apiError(statusCode: number, code: string, message: string, details: unknown = []) {
  return reply(statusCode, {
    statusCode,
    code,
    message,
    details,
    timestamp: new Date(0).toISOString(),
  });
}

type Handler = (request: StubRequest) => unknown;
/** A handler, or the fixed answer itself. */
type Answer = Handler | object | string | number | boolean | null;

interface Route {
  method: Method;
  pattern: string;
  matcher: RegExp;
  keys: string[];
  handler: Handler;
}

function compile(pattern: string): { matcher: RegExp; keys: string[] } {
  const keys: string[] = [];
  const source = pattern
    .split('/')
    .map((segment) => {
      if (segment.startsWith(':')) {
        keys.push(segment.slice(1));
        return '([^/]+)';
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return { matcher: new RegExp(`^${source}/?$`), keys };
}

class ApiStub {
  private routes: Route[] = [];
  private log: (StubRequest & { pattern: string | null })[] = [];
  private missed: string[] = [];
  private latency = 0;
  private writesInFlight = 0;

  /** Registers (or replaces) the answer for one method + path pattern. */
  on(method: Method, pattern: string, handler: Answer): this {
    const resolved: Handler = typeof handler === 'function' ? (handler as Handler) : () => handler;
    this.routes = this.routes.filter(
      (route) => !(route.method === method && route.pattern === pattern),
    );
    this.routes.unshift({ method, pattern, handler: resolved, ...compile(pattern) });
    return this;
  }

  get(pattern: string, handler: Answer): this {
    return this.on('GET', pattern, handler);
  }
  post(pattern: string, handler: Answer): this {
    return this.on('POST', pattern, handler);
  }
  put(pattern: string, handler: Answer): this {
    return this.on('PUT', pattern, handler);
  }
  patch(pattern: string, handler: Answer): this {
    return this.on('PATCH', pattern, handler);
  }
  delete(pattern: string, handler: Answer): this {
    return this.on('DELETE', pattern, handler);
  }

  /** Every request that matched `pattern` (or every request, with no arguments). */
  requests(method?: Method, pattern?: string): StubRequest[] {
    return this.log.filter(
      (entry) =>
        (method === undefined || entry.method === method) &&
        (pattern === undefined || entry.pattern === pattern),
    );
  }

  /** Delays every answer, so loading and pending states are observable. */
  setLatency(ms: number): void {
    this.latency = ms;
  }

  /** Requests no route answered; `setup.ts` fails the test when non-empty. */
  unhandled(): readonly string[] {
    return this.missed;
  }

  /** Writes (non-GET requests) started but not yet answered. */
  pendingWrites(): number {
    return this.writesInFlight;
  }

  reset(): void {
    this.writesInFlight = 0;
    this.routes = [];
    this.log = [];
    this.missed = [];
    this.latency = 0;
  }

  readonly fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      'http://localhost',
    );
    const method = (init?.method ?? 'GET').toUpperCase() as Method;
    const path = url.pathname.replace(/^\/api/, '');
    let body: unknown;
    if (typeof init?.body === 'string' && init.body !== '') {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    const isWrite = method !== 'GET';
    if (isWrite) this.writesInFlight += 1;
    try {
      return await this.answer(method, path, url, body, init);
    } finally {
      if (isWrite) this.writesInFlight -= 1;
    }
  };

  private async answer(
    method: Method,
    path: string,
    url: URL,
    body: unknown,
    init: RequestInit | undefined,
  ): Promise<Response> {
    if (this.latency > 0) await new Promise((resolve) => setTimeout(resolve, this.latency));
    if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    for (const route of this.routes) {
      if (route.method !== method) continue;
      const match = route.matcher.exec(path);
      if (!match) continue;
      const params = Object.fromEntries(
        route.keys.map((key, index) => [key, decodeURIComponent(match[index + 1] ?? '')]),
      );
      const request: StubRequest = { method, path, params, query: url.searchParams, body };
      this.log.push({ ...request, pattern: route.pattern });
      const result = await route.handler(request);
      return toResponse(result);
    }

    this.log.push({ method, path, params: {}, query: url.searchParams, body, pattern: null });
    this.missed.push(`${method} ${url.pathname}${url.search}`);
    return toResponse(apiError(501, 'NOT_STUBBED', `No stubbed answer for ${method} ${path}`));
  }
}

function toResponse(result: unknown): Response {
  const replyValue = result instanceof StubReply ? result : new StubReply(200, result);
  if (replyValue.status === 204 || replyValue.body === undefined) {
    return new Response(null, { status: replyValue.status === 200 ? 204 : replyValue.status });
  }
  return new Response(JSON.stringify(replyValue.body), {
    status: replyValue.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const apiStub = new ApiStub();
