import { useCallback } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { BUCKET_PARAM, BUCKET_TO_STATUS, isKpiBucket, type KpiBucket } from '@/lib/kpiBuckets.ts';
import { ROUTES } from '@/config/routes.ts';

/**
 * Reading and toggling the dashboard-counter filter, which lives in the URL.
 *
 * Two hooks, because the two sides of this sit in different components: the
 * COUNTER CARDS are rendered by a workspace layout, and the GRID they filter is
 * rendered by a child route. See `lib/kpiBuckets.ts` for why the URL is the
 * shared medium rather than a store or `Outlet` context.
 */

/**
 * The active bucket for a grid. `null` when no counter is selected.
 *
 * A value that is not a known bucket reads as `null`, so a hand-edited URL
 * cannot empty a grid.
 */
export function useActiveBucket(): KpiBucket | null {
  const [searchParams] = useSearchParams();
  const value = searchParams.get(BUCKET_PARAM);
  if (isKpiBucket(value)) return value;
  const status = searchParams.get('status') ?? searchParams.get('decision');
  if (status === 'Draft') return 'draft';
  if (status === 'Submitted') return 'awaitingReview';
  if (status === 'InReview') return 'inReview';
  if (status === 'ChangesRequested') return 'changesRequested';
  if (status === 'Approved') return 'approved';
  return null;
}

export interface BucketSelection {
  /** True when this card's bucket is the one currently filtering the grid. */
  isActive: (bucket: KpiBucket, path: string) => boolean;
  /**
   * Handler for a counter card.
   *
   * Selecting the active card again clears the filter — a filter you cannot turn
   * off without hunting for a Clear button is a trap, and the card is the
   * obvious place to look.
   */
  select: (bucket: KpiBucket, path: string) => void;
  /**
   * True when `path` is showing an unfiltered grid.
   */
  isUnfiltered: (path: string) => boolean;
  clear: (path: string) => void;
}

export function useBucketSelection(): BucketSelection {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const current = searchParams.get(BUCKET_PARAM);
  const currentStatus = searchParams.get('status') ?? searchParams.get('decision');

  const isActive = useCallback(
    (bucket: KpiBucket, path: string) => {
      if (location.pathname !== path) return false;
      if (current === bucket) return true;
      if (bucket === 'draft' && currentStatus === 'Draft') return true;
      if ((bucket === 'awaitingReview' || bucket === 'submitted') && currentStatus === 'Submitted')
        return true;
      if (bucket === 'inReview' && currentStatus === 'InReview') return true;
      if (bucket === 'changesRequested' && currentStatus === 'ChangesRequested') return true;
      if (bucket === 'approved' && currentStatus === 'Approved') return true;
      return false;
    },
    [location.pathname, current, currentStatus],
  );

  const select = useCallback(
    (bucket: KpiBucket, path: string) => {
      const active = isActive(bucket, path);
      const nextParams = new URLSearchParams(searchParams);
      // Reset page on bucket selection change
      nextParams.delete('page');
      // `replace`, so a run of card clicks does not stack up history entries the
      // user then has to Back through one at a time to leave the dashboard.
      if (active) {
        nextParams.delete(BUCKET_PARAM);
        nextParams.delete('status');
        nextParams.delete('decision');
      } else {
        nextParams.set(BUCKET_PARAM, bucket);
        const mappedStatus = BUCKET_TO_STATUS[bucket];
        if (mappedStatus) {
          nextParams.set('status', mappedStatus);
          if (path === ROUTES.reviewer.history) {
            nextParams.set('decision', mappedStatus);
          }
        }
      }
      const qs = nextParams.toString();
      void navigate(qs ? `${path}?${qs}` : path, { replace: true });
    },
    [navigate, searchParams, isActive],
  );

  const isUnfiltered = useCallback(
    (path: string) =>
      location.pathname === path &&
      !isKpiBucket(current) &&
      (!currentStatus || currentStatus === 'All'),
    [location.pathname, current, currentStatus],
  );

  const clear = useCallback(
    (path: string) => {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete(BUCKET_PARAM);
      nextParams.delete('status');
      nextParams.delete('decision');
      nextParams.delete('page');
      const qs = nextParams.toString();
      void navigate(qs ? `${path}?${qs}` : path, { replace: true });
    },
    [navigate, searchParams],
  );

  return { isActive, select, isUnfiltered, clear };
}
