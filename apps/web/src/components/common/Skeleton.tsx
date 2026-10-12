import { cn } from '@/components/ui';
import common from '@/content/common.json';
import { PAGE_CONTAINER, PAGE_CONTAINER_Y } from './PageContainer.tsx';

/**
 * Shape-matched loading placeholders.
 *
 * The alternative these replace is a centred spinner that swaps in for the whole
 * panel: the card collapses to the height of the spinner, the page reflows, and
 * then everything jumps back when the data lands. That is most of why the app
 * felt laggy — not the 250ms of mock latency, but the layout moving twice for
 * every fetch.
 *
 * A skeleton holds the space the real content will occupy, so nothing moves when
 * it arrives. It is also honest about structure: eight rows of a table say "a
 * table is coming", which a spinner does not.
 *
 * `LoadingState` in `states.tsx` stays for the cases where the shape genuinely
 * is not known ahead of time. These are for the cases where it is.
 *
 * ACCESSIBILITY
 * Every skeleton is `aria-hidden`, and the container that owns it carries
 * `role="status"` + `aria-busy` — announcing "loading" once is useful, having a
 * screen reader read out forty empty placeholder cells is not.
 */

/** The shimmering block everything else is built from. */
export function Skeleton({ className }: { className?: string | undefined }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative block overflow-hidden rounded-md bg-line/70',
        // The sweep is a child, clipped by `overflow-hidden` above. That is what
        // makes a horizontal transform safe here — see the `shimmer` keyframe's
        // note in the token file.
        'after:absolute after:inset-0 after:animate-shimmer',
        'after:bg-linear-to-r after:from-transparent after:via-white/60 after:to-transparent',
        'after:content-[""]',
        className,
      )}
    />
  );
}

/**
 * A paragraph-shaped run of lines.
 *
 * The last line is short, because a full-width final line reads as a solid block
 * rather than as text.
 */
/** Internal: `PageSkeleton` is the only caller. */
function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number | undefined;
  className?: string | undefined;
}) {
  return (
    <span className={cn('block space-y-2', className)}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} className={cn('h-3', index === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </span>
  );
}

/**
 * Placeholder for one dashboard counter.
 *
 * Mirrors `StatCard`'s box exactly — same border, radius, padding and the same
 * `h-full` — so the counter row does not resize when the numbers arrive.
 */
export function StatCardSkeleton({
  size = 'default',
  className,
}: {
  size?: 'default' | 'compact' | undefined;
  className?: string | undefined;
}) {
  const compact = size === 'compact';

  if (compact) {
    return (
      <div
        className={cn(
          'flex h-full flex-col justify-between rounded-2xl border border-line bg-surface p-3.5 shadow-card sm:p-4',
          className,
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <Skeleton className="size-8.5 shrink-0 rounded-xl" />
        </div>
        <div className="mt-3 flex-1 space-y-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-7 w-12" />
        </div>
        <Skeleton className="mt-2 h-2.5 w-24" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex h-full flex-col justify-between rounded-2xl border border-line bg-surface p-5 shadow-card',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
      <div className="mt-3 space-y-2">
        <Skeleton className="h-8 w-14" />
        <Skeleton className="h-3 w-32" />
      </div>
    </div>
  );
}

/**
 * Placeholder rows for `DataTable`.
 *
 * Rendered as real `<tr>`/`<td>` inside the real `<table>`, not as a block that
 * replaces it, so the header row and the column widths are already correct when
 * the data lands. Swapping a `<table>` for a `<div>` and back is what made grids
 * jump.
 *
 * Cell widths alternate rather than being uniform: a grid of identical bars
 * reads as a loading GRAPHIC, while ragged ones read as text that has not
 * arrived yet.
 */
const CELL_WIDTHS = ['w-20', 'w-32', 'w-16', 'w-24', 'w-28', 'w-14', 'w-24', 'w-20'] as const;

export function TableSkeleton({ columns, rows = 6 }: { columns: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, rowIndex) => (
        <tr key={rowIndex} className="border-b border-line last:border-b-0">
          {Array.from({ length: columns }, (_, columnIndex) => (
            <td key={columnIndex} className="px-4 py-3.5 align-middle">
              <Skeleton
                className={cn('h-3.5', CELL_WIDTHS[columnIndex % CELL_WIDTHS.length] ?? 'w-20')}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/**
 * Whole-page placeholder, for a route chunk that has not downloaded yet.
 *
 * Deliberately generic — a header block and a panel — because the Suspense
 * boundaries above the outlet do not know which screen is arriving. It exists to
 * hold the page height so the header does not sit alone over a collapsed body.
 */
export function PageSkeleton({ className }: { className?: string | undefined }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className={cn(PAGE_CONTAINER, PAGE_CONTAINER_Y, 'space-y-6', className)}
    >
      <span className="sr-only">{common.states.loading}</span>

      <div className="flex items-start gap-4">
        <Skeleton className="size-12 shrink-0 rounded-card sm:size-14" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-7 w-64 max-w-full" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <StatCardSkeleton key={index} />
        ))}
      </div>

      <div className="rounded-card border border-line bg-surface p-5 shadow-card">
        <SkeletonText lines={6} />
      </div>
    </div>
  );
}
