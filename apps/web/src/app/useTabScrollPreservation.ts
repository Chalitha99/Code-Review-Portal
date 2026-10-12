import { useEffect } from 'react';
import { NavigationType, useLocation, useNavigationType } from 'react-router-dom';
import {
  forgetTabScrollOffset,
  isTabNavigation,
  readTabScrollOffset,
} from '@/lib/tabNavigation.ts';

/**
 * Keeps the reader's place when they move between tabs inside a workspace.
 *
 * WHY THIS IS NOT JUST `preventScrollReset`. The opt-out is on the tab strips
 * and it is not enough on its own — measured, at 1280x700 on Developer, scrolled
 * to y=260, clicking Analytics:
 *
 *     preventScrollReset alone   → y = 0
 *     preventScrollReset + this  → y = 260
 *
 * Every workspace panel is `React.lazy` and every panel also renders its own
 * loading state, so during the swap the document is briefly shorter than the
 * viewport. The BROWSER clamps `window.scrollY` to the new maximum the moment
 * that happens, which is before React Router or anything else gets a say.
 *
 * So the offset is captured in the tab's click handler (see `lib/tabNavigation`)
 * and re-applied here once the page can hold it again — the hand-rolled
 * restoration the old note in `ui/Tabs.tsx` described but did not build.
 *
 * MEASURE, DO NOT ASSUME, if you touch this. The note that used to sit in
 * `ui/Tabs.tsx` recorded "y=28 from y=400" and concluded the whole idea was
 * unworkable. That number is a testing artifact: at y=400 the tab strip is above
 * the fold, so Playwright scrolled the page to reach it and the click never
 * happened from y=400 at all. The tab strip has to be both on screen and clear
 * of the sticky header for the measurement to mean anything.
 *
 * WHAT IT DELIBERATELY DOES NOT TOUCH. `<ScrollRestoration />` still owns every
 * other navigation, unchanged: Home → a workspace and any cross-workspace move
 * still open at the top, drill-downs like `/developer → /developer/tasks/:id`
 * still open at the top, and Back and Forward still land on their remembered
 * offset. Only a click on a sibling tab is exempt, and only because that click
 * says so.
 */

/**
 * How long to keep trying before giving up.
 *
 * In practice the first attempt wins — the workspace chunk is already cached and
 * the panel's query usually resolves from React Query's cache, so the page has
 * its height back within a frame. The budget is for the case where it does not:
 * long enough to cover a panel that takes a moment to lay out, short enough that
 * a genuinely slow one is simply left at the top rather than yanked out from
 * under someone who has started reading it.
 */
const RESTORE_BUDGET_MS = 1200;

/**
 * Anything that means the reader took over. Our own `scrollTo` fires `scroll`
 * events indistinguishable from a real one, so intent is read from the input
 * events instead — those we never synthesise.
 */
const INTERRUPTS = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;

export function useTabScrollPreservation(): void {
  const location = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    /*
     * `POP` is excluded even though the state matches: `location.state` is
     * stored with the history entry, so going Back to a tab arrives carrying the
     * same marker. Back belongs to `<ScrollRestoration />`, which has the offset
     * for that entry; ours is for the entry we just left.
     */
    if (navigationType === NavigationType.Pop || !isTabNavigation(location.state)) {
      // Drop any offset a click left behind — see `forgetTabScrollOffset`.
      forgetTabScrollOffset();
      return;
    }

    const remembered = readTabScrollOffset();
    if (remembered === null || remembered <= 0) return;

    // Re-bound as a plain `number` so the closures below do not have to re-prove
    // it: TypeScript does not carry a narrowing into a nested function.
    const target = remembered;

    const deadline = performance.now() + RESTORE_BUDGET_MS;
    const observer = new ResizeObserver(() => {
      attempt();
    });

    let frame = 0;
    let done = false;

    function stop() {
      if (done) return;
      done = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      for (const event of INTERRUPTS) window.removeEventListener(event, stop);
    }

    function attempt() {
      if (done) return;

      // The observer and the frame loop both land here, so cancel before
      // rescheduling — otherwise each resize forks another chain that runs
      // until `done` rather than being cancelled with the rest.
      cancelAnimationFrame(frame);
      window.scrollTo(0, target);

      // Arrived, or out of budget. `scrollY` is fractional on a zoomed or
      // high-DPI display, so this is a tolerance rather than an equality.
      if (Math.abs(window.scrollY - target) < 1 || performance.now() > deadline) {
        stop();
        return;
      }

      // Not there yet: the panel is still short. Keep asking until it grows —
      // the observer covers a late layout, the frame loop covers everything it
      // does not fire for.
      frame = requestAnimationFrame(attempt);
    }

    observer.observe(document.documentElement);
    for (const event of INTERRUPTS) {
      window.addEventListener(event, stop, { passive: true });
    }
    attempt();

    return stop;
  }, [location, navigationType]);
}
