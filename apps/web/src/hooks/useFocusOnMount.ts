import { useCallback } from 'react';

/**
 * A stable callback ref that focuses its element when it mounts.
 *
 * The accessible replacement for `autoFocus` on a field that appears because the
 * user just asked for it — a dialog opening, an inline editor expanding. Radix's
 * focus scope leaves focus alone when it already sits inside the dialog.
 */
export function useFocusOnMount<TElement extends HTMLElement>() {
  return useCallback((node: TElement | null) => {
    node?.focus();
  }, []);
}
