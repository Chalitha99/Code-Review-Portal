import { beforeEach, describe, expect, it } from 'vitest';
import {
  forgetTabScrollOffset,
  isTabNavigation,
  readTabScrollOffset,
  rememberTabScrollOffset,
  TAB_NAVIGATION_STATE,
} from '@/lib/tabNavigation.ts';

/**
 * The handshake between the tab strips and the scroll layer.
 *
 * Both halves are asserted here rather than through the router, because what
 * makes them safe is what they do when a navigation is NOT a tab click — and a
 * router test would have to stage a redirect to reach that.
 */
describe('isTabNavigation', () => {
  it('recognises the marker the tab strips send', () => {
    expect(isTabNavigation(TAB_NAVIGATION_STATE)).toBe(true);
  });

  it('rejects every other kind of location state', () => {
    // `null` is what a plain `<Link>` leaves behind, and it is the case that
    // decides whether a drill-down or a workspace card keeps its scroll-to-top.
    expect(isTabNavigation(null)).toBe(false);
    expect(isTabNavigation(undefined)).toBe(false);
    expect(isTabNavigation({})).toBe(false);
    expect(isTabNavigation({ from: '/crp/admin' })).toBe(false);
    expect(isTabNavigation({ sdpTabNavigation: 'yes' })).toBe(false);
    expect(isTabNavigation('sdpTabNavigation')).toBe(false);
  });
});

describe('the remembered offset', () => {
  beforeEach(() => {
    forgetTabScrollOffset();
  });

  it('is nothing until a tab is clicked', () => {
    expect(readTabScrollOffset()).toBeNull();
  });

  it('survives being read, because StrictMode reads it twice', () => {
    window.scrollY = 420;
    rememberTabScrollOffset();

    /*
     * A read-and-clear is the obvious shape and it is the bug: React 19 runs
     * every effect twice on mount in development, so the first pass would
     * swallow the offset and the second — the one whose work survives — would
     * find nothing and leave the reader at the top.
     */
    expect(readTabScrollOffset()).toBe(420);
    expect(readTabScrollOffset()).toBe(420);
  });

  it('is dropped explicitly, so a click that navigates nowhere leaves nothing behind', () => {
    window.scrollY = 420;
    rememberTabScrollOffset();

    // What the scroll layer calls on any navigation that is not a tab click —
    // a guard bouncing the user to `/login`, for instance.
    forgetTabScrollOffset();
    expect(readTabScrollOffset()).toBeNull();
  });
});
