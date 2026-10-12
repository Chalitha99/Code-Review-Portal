import { useCallback, useEffect, useRef, useState } from 'react';

/** Sets `document.title` to "<title> | SDP" and restores the old one on leave. */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} | SDP`;
    return () => {
      document.title = previous;
    };
  }, [title]);
}

/**
 * Adds `<meta name="referrer" content="no-referrer">` while the screen is mounted.
 * The password screens must not leak their URL to anything they load or link to.
 */
export function useNoReferrer(): void {
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'referrer';
    meta.content = 'no-referrer';
    document.head.appendChild(meta);
    return () => {
      meta.remove();
    };
  }, []);
}

/**
 * Seconds left on a cooldown. Computed from a deadline rather than by counting
 * ticks, so a throttled background tab catches up instead of running slow.
 */
export function useCountdown() {
  const [remaining, setRemaining] = useState(0);
  const deadline = useRef(0);
  const isRunning = remaining > 0;

  const start = useCallback((seconds: number) => {
    deadline.current = Date.now() + seconds * 1000;
    setRemaining(seconds);
  }, []);

  useEffect(() => {
    if (!isRunning) return;
    const id = window.setInterval(() => {
      const left = Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000));
      setRemaining(left);
    }, 250);
    return () => {
      window.clearInterval(id);
    };
  }, [isRunning]);

  return { remaining, isRunning, start };
}

/**
 * A ref that takes focus whenever `trigger` changes — the heading or the error
 * when a screen swaps state, so a screen-reader user lands on what changed.
 * The target needs `tabIndex={-1}`.
 */
export function useFocusOnChange<TElement extends HTMLElement>(trigger: unknown) {
  const ref = useRef<TElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, [trigger]);
  return ref;
}
