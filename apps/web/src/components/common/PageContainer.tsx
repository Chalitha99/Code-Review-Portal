import type { ReactNode } from 'react';
import { cn } from '@/components/ui';

/**
 * The shared page container — one definition of how wide content gets and how
 * far it sits from the edge.
 *
 * Before this, `<main>` was a bare `flex-1` with no padding and no max-width, so
 * every workspace screen ran edge to edge and kept stretching on wide monitors.
 * The wireframes inset content to roughly 1540px at 1920: compare wireframe 22
 * with the built wizard, where the page-header icon tile sat flush at x=0 and
 * the action bar spanned the whole viewport.
 *
 * Deliberately NOT applied to `<main>` in `RootLayout`. The Home hero is
 * full-bleed by design — a coloured band across the viewport with inset content
 * inside it — and the alternatives (a `w-screen` breakout, negative margins) all
 * risk horizontal overflow, which the e2e suite asserts against at six widths.
 * Applying it per surface costs a few imports and cannot produce that bug.
 *
 * Lives in `components/` rather than `app/` so features may import it: the
 * boundary rules forbid `feature → app`.
 */

/** The raw classes, for surfaces that compose their own wrapper element. */
export const PAGE_CONTAINER = 'mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-8';

/** Vertical rhythm for a page's own content, kept separate so the header can
 *  reuse the horizontal half without inheriting page padding. */
export const PAGE_CONTAINER_Y = 'py-6 sm:py-8';

export function PageContainer({
  children,
  className,
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string | undefined;
  /** `section` where the container is the page's landmark, `div` otherwise. */
  as?: 'div' | 'section';
}) {
  return <Tag className={cn(PAGE_CONTAINER, PAGE_CONTAINER_Y, className)}>{children}</Tag>;
}
