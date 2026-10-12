import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, beforeEach, expect, vi } from 'vitest';
import type { User } from '@sdp/contracts';
import { useSession } from '@/hooks/useSession.ts';
import { apiError, apiStub } from './apiStub.ts';
import { buildDataset } from './fixtures/dataset.ts';

/**
 * Testing Library's default 1000ms async timeout is too tight for screens that
 * mount the whole route table, lazy-load a chart chunk and then wait on several
 * queries — under `--coverage` the v8 instrumentation stretches each step. Kept
 * well below `testTimeout` in vitest.config.ts so a genuine miss reports the
 * element it could not find rather than "test timed out".
 */
configure({ asyncUtilTimeout: 10_000 });

/**
 * jsdom gaps that Radix primitives depend on.
 *
 * Radix Select, Dialog and Tabs use Pointer Events for their press handling and
 * `scrollIntoView` to keep the highlighted option visible. jsdom implements
 * neither, so without these a `userEvent.click` on a Select trigger throws
 * `hasPointerCapture is not a function` and no listbox ever opens — which reads
 * in the failure output as "the option does not exist" rather than as a missing
 * browser API.
 *
 * These are stubs, not implementations: they exist so the component's own logic
 * runs. Anything that genuinely depends on pointer capture or scroll position is
 * verified in Playwright against a real browser instead.
 */
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => undefined;
  Element.prototype.releasePointerCapture = () => undefined;
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => undefined;
}

/*
 * jsdom does not implement `window.scrollTo`, and `<ScrollRestoration />` calls
 * it on every navigation.
 *
 * Without this every test that drives the real route table — most of them —
 * prints "Not implemented: window.scrollTo" per navigation, burying real
 * failures in noise. A no-op is honest here: jsdom has no layout and therefore
 * no scroll position, so the behaviour is verified in Playwright instead
 * (`e2e/developer.spec.ts`).
 */
window.scrollTo = () => undefined;
/*
 * jsdom has no `matchMedia`, and `hooks/useMediaQuery` calls it during render.
 *
 * Every chart reads `prefers-reduced-motion` through that hook, because Recharts
 * animates SVG attributes from JavaScript and the global CSS block in
 * `global.css` cannot reach it. Without this stub any screen containing a chart
 * throws before it paints — which surfaces as "cannot find the heading" rather
 * than as a missing browser API.
 *
 * Reports NO match, so tests exercise the animated path — the one real users on
 * default settings get. The reduced-motion path is verified in a real browser.
 */
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {
      /* jsdom never resizes anything; nothing to observe. */
    }
    unobserve() {
      /* No-op, for the same reason. */
    }
    disconnect() {
      /* No-op, for the same reason. */
    }
  };
}

/* -------------------------------------------------------------------------- */
/* Network: canned answers only                                                */
/* -------------------------------------------------------------------------- */

/**
 * Every `fetch` goes to `apiStub`: the test's own declared answers. There is no
 * mock backend. A request the test did not declare is answered with 501 AND
 * fails the test in `afterEach`, so a screen that starts calling a new
 * endpoint has to say so in its tests.
 */
beforeEach(() => {
  vi.stubGlobal('fetch', apiStub.fetch);
});

/* -------------------------------------------------------------------------- */
/* Session                                                                     */
/* -------------------------------------------------------------------------- */

/** The default signed-in account: Developer + Reviewer + Admin (fixtures users.json). */
export const DEFAULT_TEST_USER_ID = 'u-charith';

/**
 * Signs the test in as `user` (a fixture id or a full user record): the session
 * store says authenticated, and GET /auth/me answers with that user — what
 * NestJS does for a valid session cookie.
 */
export function signInForTest(user: string | User = DEFAULT_TEST_USER_ID): User {
  const record =
    typeof user === 'string'
      ? buildDataset().users.find((candidate) => candidate.id === user)
      : user;
  if (!record) throw new Error(`No fixture user "${typeof user === 'string' ? user : user.id}"`);
  apiStub.get('/auth/me', () => record);
  useSession.setState({
    userId: record.id,
    isAuthenticated: true,
    isChecking: false,
    isExpired: false,
    didExpire: false,
  });
  return record;
}

export function signOutForTest(): void {
  apiStub.get('/auth/me', () => apiError(401, 'AUTH_REQUIRED', 'Unauthorized'));
  useSession.setState({
    userId: null,
    isAuthenticated: false,
    isChecking: false,
    isExpired: false,
    didExpire: false,
  });
}

beforeEach(() => {
  // `apiClient` tries one refresh after any 401. NestJS refuses it without a
  // live refresh cookie; tests that model a successful refresh override this.
  apiStub.post('/auth/refresh', () => apiError(401, 'AUTH_REQUIRED', 'Unauthorized'));
  signInForTest();
});

afterEach(() => {
  cleanup();
  const unhandled = [...apiStub.unhandled()];
  apiStub.reset();
  vi.unstubAllGlobals();
  try {
    window.localStorage.clear();
    window.sessionStorage.clear();
  } catch {
    /* jsdom always provides storage; guard is for safety only. */
  }
  expect(unhandled, 'requests the test did not stub (declare them with apiStub)').toEqual([]);
});
