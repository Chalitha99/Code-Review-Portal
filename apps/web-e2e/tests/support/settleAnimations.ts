import type { Page } from '@playwright/test';

/**
 * Lets one-shot entry animations finish before anything is measured.
 *
 * `color-contrast` reads the COMPOSITED colour, so an element caught halfway
 * through a fade is measured at partial opacity against the page behind it. The
 * login form's `reveal-up` produced exactly that: the "or" divider label scored
 * 4.47:1 mid-fade and 4.95:1 at rest, so the suite failed intermittently on a
 * colour that is fine. Waiting is the honest fix — the resting state is the one
 * a user reads.
 *
 * Only FINITE animations are awaited. The login panel's decorative drift loops
 * forever by design, and `a.finished` on an infinite animation never settles.
 *
 * SHARED, after the same flake resurfaced on Developer Analytics. This helper
 * lived inside `accessibility.spec.ts` and the four workspace specs each ran
 * their own axe scan without it — so the guard existed and three-quarters of the
 * suite did not use it. `Reveal` now wraps a KPI row on both Analytics tabs,
 * which made the race common enough to fail a full run: `ink-500` on white is
 * about 7:1 at rest and dips below AA at 40% opacity.
 */
export async function settleAnimations(page: Page) {
  /*
   * STOP the animations rather than race them.
   *
   * Waiting was the obvious approach and it does not hold. `Reveal` keeps its
   * content at `opacity-0` until an IntersectionObserver fires, so a block below
   * the fold has no animation running — `document.getAnimations()` finds nothing
   * and returns at once. axe then scrolls the page itself to measure, which
   * trips the observer, starts the fade, and measures it halfway through.
   * Scrolling first to arm every observer narrows the window but does not close
   * it: it still failed roughly one run in three.
   *
   * `prefers-reduced-motion: reduce` closes it outright. The global block in
   * `global.css` flattens every animation and transition to 0.01ms, so there is
   * no in-flight frame left to catch. That is also the honest thing to measure —
   * as the login-form flake first established, the RESTING state is the one a
   * user reads. Developer Analytics failed with `danger` at `#e04344` on
   * `#fefefe` for 4.11:1, where the token is `#dc2626` on white for 5.9:1;
   * nothing was wrong with the colour, the element was at about 92% opacity.
   *
   * The animated path is still exercised everywhere else — this only applies to
   * the axe scans, which are about colour, not motion.
   */
  await page.emulateMedia({ reducedMotion: 'reduce' });

  // Still walk the page: an observer that never fired leaves its block at
  // `opacity-0`, and an element axe considers present but transparent is a
  // different false reading from the one above.
  await page.evaluate(async () => {
    const step = window.innerHeight;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    window.scrollTo(0, 0);
  });

  await page.evaluate(async () => {
    const finite = document
      .getAnimations()
      .filter((animation) => Number.isFinite(animation.effect?.getTiming().iterations ?? 1));

    await Promise.all(
      finite.map(async (animation) => {
        try {
          await animation.finished;
        } catch {
          /* Cancelled mid-flight — nothing left to wait for. */
        }
      }),
    );
  });
}
