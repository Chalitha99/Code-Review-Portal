import type { ReactNode } from 'react';
import { cn } from '@/components/ui';
import { useReveal } from '@/hooks/useReveal.ts';

/**
 * Fades and lifts its children into view once, when they scroll in.
 *
 * `translateY` and `opacity` only. Never `translateX` or a `scale` overshoot: a
 * horizontal transform transiently widens `scrollWidth`, and the e2e suite
 * asserts on every screen that the page does not scroll horizontally — an
 * assertion that has caught real layout bugs and must not be traded away for a
 * flourish.
 *
 * Deliberately NOT used on table rows. The e2e specs read row content through
 * `page.evaluate()` loops that do not wait for animations, and staggered row
 * reveals are the single most flake-prone pattern available here.
 */
export function Reveal({
  children,
  /** Milliseconds, for staggering a group. Keep the total under ~300ms. */
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string | undefined;
}) {
  const { ref, isRevealed } = useReveal<HTMLDivElement>();

  // Always a `div`. A polymorphic `as` prop would need a generic ref type for no
  // benefit — every current caller wraps a block, and a wrapper that changes its
  // element type is a wrapper whose layout behaviour changes with it.
  return (
    <div
      ref={ref}
      className={cn(isRevealed ? 'animate-reveal-up' : 'opacity-0', className)}
      style={isRevealed && delay > 0 ? { animationDelay: `${String(delay)}ms` } : undefined}
    >
      {children}
    </div>
  );
}
