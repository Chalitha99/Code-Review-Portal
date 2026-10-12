import { Outlet, ScrollRestoration } from 'react-router-dom';
import { useTabScrollPreservation } from './useTabScrollPreservation.ts';

/**
 * Scroll behaviour for the whole app, in one place.
 *
 * A data router does NOT reset scroll on its own. The document never unloads on
 * a client navigation, so `window.scrollY` simply persists — and the browser's
 * `history.scrollRestoration` never comes into play because there is no real
 * page load. Nothing here compensated for that, which is why clicking a Home
 * workspace card (well below the fold, under a `py-20` hero) opened the
 * destination dashboard mid-page.
 *
 * `<ScrollRestoration />` is React Router's answer: top on a forward
 * navigation, the remembered offset on Back and Forward. It works unmodified
 * because the WINDOW is the scroller here — the shell is `min-h-screen` rather
 * than `h-screen`, `<main>` sets no `overflow`, and the header is `sticky`
 * rather than `fixed`. An inner scroll container would have needed `getKey`
 * plumbing; there isn't one.
 *
 * WHY A PATHLESS ROUTE rather than `RootLayout`. `RootLayout` returns early in
 * five states — two loading skeletons, session-expired, an error and the
 * unauthenticated case — so anything rendered only in its final JSX unmounts
 * and remounts as those states come and go. A pathless layout is mounted for
 * exactly one location's lifetime, and it also covers `/login`, which renders
 * outside `RootLayout` entirely.
 *
 * ONE THING OPTS OUT: a click on a sibling tab inside a workspace. Entering a
 * workspace is a change of place and belongs at the top; moving between the six
 * Admin tabs, or between Developer's two, is not — it was throwing the reader
 * back to the header every time they compared two panels. `RouteTabs` marks
 * those navigations and `useTabScrollPreservation` puts the offset back, because
 * `preventScrollReset` alone cannot: the lazily loaded panel collapses the page
 * height mid-swap and the browser clamps the scroll first. The hook's docblock
 * has the measurement.
 *
 * `getKey` is still not the answer to any of this. It makes React Router
 * RESTORE a remembered offset for a key it has seen before, so keying on the
 * workspace segment would land the second Home → Developer trip mid-page —
 * breaking the thing scroll restoration was added to fix.
 */
export function ScrollRestorationLayout() {
  useTabScrollPreservation();

  return (
    <>
      <ScrollRestoration />
      <Outlet />
    </>
  );
}
