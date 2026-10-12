import { Suspense } from 'react';
import { Outlet, useOutletContext } from 'react-router-dom';
import { Skeleton } from '@/components/common/Skeleton.tsx';
import common from '@/content/common.json';

/**
 * The nested outlet inside a workspace layout, with its own Suspense boundary.
 *
 * Without a boundary here, a suspending child would be caught by the one in
 * `RootLayout` — which sits ABOVE the workspace layout — and the header, the
 * counters and the tab strip would all be replaced by a spinner and then
 * remounted. The workspace chrome is the fixed part of the screen; only the
 * panel below the tabs should ever be in a loading state.
 *
 * The fallback is a panel-shaped skeleton rather than a centred spinner, and it
 * holds `min-h-[60vh]` for the same reason it always did: a chunk arriving must
 * not collapse the page to a thin strip and bounce the scroll position.
 */
export function WorkspaceOutlet() {
  const context = useOutletContext();

  return (
    <Suspense fallback={<PanelSkeleton />}>
      <Outlet context={context} />
    </Suspense>
  );
}

/**
 * A card outline with a toolbar row and a few text lines — the shape every
 * workspace tab arrives in, whichever one it is.
 */
function PanelSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="min-h-[60vh] rounded-card border border-line bg-surface p-5 shadow-card"
    >
      <span className="sr-only">{common.states.loading}</span>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-36" />
      </div>
      <Skeleton className="mt-4 h-10 w-full" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-9 w-full" />
        ))}
      </div>
    </div>
  );
}
