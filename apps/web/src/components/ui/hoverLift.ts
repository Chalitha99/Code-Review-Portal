/**
 * The shared hover treatment for cards: a small, unhurried lift and a softer
 * shadow.
 *
 * One constant rather than the same four utilities copied onto every card,
 * because the whole point is that they move identically. When the timing is
 * tuned it is tuned once.
 *
 * THE CURVE
 * `200ms` on `cubic-bezier(0.2, 0.8, 0.2, 1)` — a decelerating ease-out with a
 * short tail. Three earlier attempts are worth remembering:
 *
 *   - `ease-out` alone moves fastest in the very first frames, so the card
 *     appears to snap to its raised position the instant the pointer touches it.
 *   - `ease-in` was the correction, and it overshot in the other direction: the
 *     card lags the pointer at the start, which reads as the page being slow.
 *   - `260ms` on `cubic-bezier(0.22, 1, 0.36, 1)` fixed the start but kept a long
 *     settle, and the business still reported a delay. A lift is a RESPONSE to a
 *     pointer, and a response still finishing a quarter of a second later has
 *     stopped feeling like one.
 *
 * The current pair covers most of the distance in the first third and is done
 * before the eye asks why it is not. Do not go much under 150ms: below that the
 * card stops reading as moving and starts reading as redrawing.
 *
 * Only `transform`, `box-shadow` and `border-color` are transitioned — all
 * compositor-friendly, none of them forcing layout on a frame. The global
 * `prefers-reduced-motion: reduce` block in `global.css` flattens the duration
 * to nothing for anyone who has asked for that, so this needs no guard of its
 * own.
 *
 * NOTHING ELSE MAY DO THIS. A second hover implementation existed as
 * `.transform-smooth` in `global.css` — an unlayered rule, so it beat every
 * Tailwind utility — and `WorkspaceCard` carried both. Two transitions and two
 * translate distances raced on one element, which is exactly the abruptness the
 * constant exists to prevent. It has been deleted; do not reintroduce it.
 *
 * A separate `.ts` file, not an export from a component module: a file that
 * exports both a component and a constant breaks React Fast Refresh (standard
 * 19), which is why `buttonVariants.ts` sits beside `Button.tsx` too.
 */
export const HOVER_LIFT = [
  'transition-[transform,box-shadow,border-color] duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)]',
  'hover:-translate-y-1 hover:shadow-card-hover',
  'active:translate-y-0 active:duration-75',
].join(' ');

/**
 * `HOVER_LIFT` for a BORDERLESS card, which needs the raised elevation pair.
 *
 * `hover:shadow-card-raised-hover` has to override `hover:shadow-card-hover`
 * from the constant above, and two utilities of equal specificity are settled by
 * source order in the generated stylesheet — not by the order they appear in a
 * `class` attribute. Composing the shared string and then re-declaring the
 * shadow is therefore unreliable, so this spells the whole treatment out.
 *
 * Everything except the shadow is identical, deliberately: the movement is the
 * part that must not drift between one card and the next.
 */
/** Internal: composed into `INTERACTIVE_CARD_RAISED`, which is what callers use. */
const HOVER_LIFT_RAISED = [
  'transition-[transform,box-shadow,border-color] duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)]',
  'hover:-translate-y-1 hover:shadow-card-raised-hover',
  'active:translate-y-0 active:duration-75',
].join(' ');

/**
 * The affordances a lift alone cannot carry: the pointer cursor (Tailwind v4's
 * Preflight sets `cursor: default` on `<button>`, so a card rendered as a button
 * looks inert without this) and a focus ring, since these cards are reachable by
 * keyboard and the lift is invisible to a keyboard user.
 */
const ACTIONABLE = [
  'cursor-pointer text-left',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600',
].join(' ');

/**
 * `HOVER_LIFT` for a card that is genuinely actionable — a dashboard counter
 * that filters its grid, a workspace card that navigates.
 */
export const INTERACTIVE_CARD = [HOVER_LIFT, ACTIONABLE].join(' ');

/** The same, for a borderless card. See `HOVER_LIFT_RAISED`. */
export const INTERACTIVE_CARD_RAISED = [HOVER_LIFT_RAISED, ACTIONABLE].join(' ');
