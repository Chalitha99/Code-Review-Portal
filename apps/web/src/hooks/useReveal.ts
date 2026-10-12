import { useEffect, useRef, useState } from 'react';

/**
 * Reveals an element once it scrolls into view.
 *
 * `IntersectionObserver` rather than a scroll listener: the browser does the
 * intersection maths off the main thread, and a scroll handler that runs on
 * every frame is exactly the kind of "animation" that costs more than it adds.
 *
 * Observes once and disconnects. A reveal that replays every time the user
 * scrolls back up stops reading as polish within about ten seconds.
 *
 * Motion preferences are handled by the global `prefers-reduced-motion` block in
 * `styles/global.css`, which collapses every animation to 0.01ms — so the
 * element still ends up visible, it simply arrives instantly. That only works
 * because the reveal is a CSS `animation`; a JS-driven opacity tween would slip
 * straight past it.
 */
export function useReveal<T extends HTMLElement>(): {
  ref: React.RefObject<T | null>;
  isRevealed: boolean;
} {
  const ref = useRef<T>(null);

  // Starts revealed when the API is unavailable, so a browser without
  // IntersectionObserver shows the content rather than a blank page. Failing
  // open is the only acceptable default for something that hides content.
  const [isRevealed, setRevealed] = useState(() => typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    if (isRevealed) return;

    const element = ref.current;
    if (element === null) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setRevealed(true);
          observer.disconnect();
        }
      },
      // A little before the element reaches the fold, so the animation is
      // finishing as it arrives rather than starting there.
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
    );

    observer.observe(element);

    /*
     * Fail open.
     *
     * Until it is revealed, this element is `opacity-0` — so anything that stops
     * the observer from ever firing does not degrade the animation, it hides the
     * content permanently. That is not hypothetical: an element observed while
     * the tab is hidden gets no callback until the tab is shown again, and a
     * `threshold` that a very short or zero-height element never reaches is
     * never satisfied at all. Either way the user sees a blank panel and has no
     * idea it is a blank panel rather than an empty dashboard.
     *
     * Half a second is longer than any real intersection callback takes and
     * short enough that the fallback is imperceptible. A decorative reveal must
     * never be the reason content is missing.
     */
    const failOpen = window.setTimeout(() => {
      setRevealed(true);
      observer.disconnect();
    }, 500);

    return () => {
      window.clearTimeout(failOpen);
      observer.disconnect();
    };
  }, [isRevealed]);

  return { ref, isRevealed };
}
