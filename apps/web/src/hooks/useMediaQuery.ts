import { useSyncExternalStore } from 'react';

/**
 * Subscribes to a CSS media query.
 *
 * `useSyncExternalStore` rather than `useState` + `useEffect`: it reads the
 * current match during render, so there is no first-paint flash of the wrong
 * layout, and React handles the subscription lifecycle.
 *
 * Layout should still be done in CSS wherever it can be. Reach for this only
 * when behaviour genuinely differs — rendering a drawer instead of a popover,
 * or a card list instead of a data table.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    // Server snapshot. There is no SSR today, but jsdom and any future
    // pre-render need a defined value rather than a `window` access.
    () => false,
  );
}

/*
 * A `BREAKPOINTS` map of Tailwind's defaults used to live here, unused by
 * anything. It was written for a JS-driven responsive branch that never
 * happened: every call site of `useMediaQuery` asks about
 * `prefers-reduced-motion`, and layout responds to width in CSS — through
 * Tailwind's own breakpoints and, where the answer depends on the parent rather
 * than the viewport, container queries (see `DonutChart`). Removed rather than
 * kept "in case", because a second copy of the breakpoint values is exactly the
 * thing that drifts from the first.
 */
