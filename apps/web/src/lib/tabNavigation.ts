/**
 * The two facts a workspace tab click has to carry across to the scroll layer.
 *
 * `components/ui/Tabs.tsx` renders the tab strips and `app/` owns scrolling, and
 * the layer graph forbids the former importing the latter — so the handshake
 * lives here, in the one place both are allowed to reach.
 *
 * There are two halves because they answer different questions:
 *
 * - **`TAB_NAVIGATION_STATE`** rides along in `location.state`, so the scroll
 *   layer can tell "the user clicked a sibling tab" apart from every other
 *   navigation — a drill-down into a task, a Home workspace card, a guard
 *   redirect. It is per-navigation and it survives into history, which is why
 *   the reader on the other side also has to exclude `POP`.
 * - **the remembered offset** is captured in the click handler, which is the
 *   last moment `window.scrollY` is still the reader's position. By the time an
 *   effect runs after the navigation commits, the incoming panel has already
 *   shortened the document and the browser has already clamped the scroll — the
 *   number is gone. Reading it from a `scroll` listener instead would be a race
 *   against when the browser chooses to dispatch that event.
 */

/**
 * Frozen and shared: `location.state` is compared by contents, never mutated,
 * and one constant object keeps every tab strip in the app sending the same one.
 */
export const TAB_NAVIGATION_STATE = Object.freeze({ sdpTabNavigation: true });

export function isTabNavigation(state: unknown): boolean {
  return (
    typeof state === 'object' &&
    state !== null &&
    (state as { sdpTabNavigation?: unknown }).sdpTabNavigation === true
  );
}

let rememberedOffset: number | null = null;

/** Called from a tab's `onClick`, before the router does anything. */
export function rememberTabScrollOffset(): void {
  rememberedOffset = window.scrollY;
}

/**
 * Reads the offset WITHOUT clearing it, and that is deliberate.
 *
 * A read-and-clear is the obvious shape and it is wrong here: React 19's
 * StrictMode runs every effect twice in development, so the first pass would
 * swallow the offset and the second — the one whose work survives — would find
 * nothing. Reading is idempotent instead, and `forgetTabScrollOffset` is called
 * explicitly by the navigation that invalidates it.
 */
export function readTabScrollOffset(): number | null {
  return rememberedOffset;
}

/**
 * Drops the offset. Called on any navigation that is not a tab click, so a click
 * that navigates nowhere — a guard bouncing the user to `/login`, a tab that
 * redirects — cannot leave a stale offset for a later navigation to apply.
 */
export function forgetTabScrollOffset(): void {
  rememberedOffset = null;
}
