import { Suspense } from 'react';
import { Outlet, useMatches } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { EmptyState, ErrorState } from '@/components/common/states.tsx';
import { PageSkeleton } from '@/components/common/Skeleton.tsx';
import { hasNoWorkspaceAccess } from '@/lib/permissions.ts';
import { ApiError } from '@/lib/apiClient.ts';
import auth from '@/content/auth.json';
import common from '@/content/common.json';
import { SessionExpiredScreen } from '@/features/auth/components/SessionExpiredScreen.tsx';
import { useCurrentUser } from '@/hooks/useCurrentUser.ts';
import { useSession } from '@/hooks/useSession.ts';
import { AppBar } from './AppBar.tsx';
import { AppFooter } from './AppFooter.tsx';

/** Routes declare their header title through `handle`. */
interface RouteHandle {
  title?: string;
}

/** Narrowing instead of casting — router `handle` is typed `unknown`. */
function readTitle(handle: unknown): string | undefined {
  if (typeof handle !== 'object' || handle === null) return undefined;
  const title = (handle as RouteHandle).title;
  return typeof title === 'string' ? title : undefined;
}

function usePageTitle(): string | undefined {
  const matches = useMatches();
  // Deepest match wins, so a child route can override its parent's title.
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const title = readTitle(matches[i]?.handle);
    if (title !== undefined) return title;
  }
  return undefined;
}

const MAIN_CONTENT_ID = 'main-content';

/**
 * Shell rendered around every authenticated route.
 *
 * Resolves the principal once here rather than in each page, so no screen has
 * to handle a missing user and the "no roles configured" case (spec FL 2.1-01)
 * is caught in exactly one place.
 */
export function RootLayout() {
  const { data: user, isPending, isError, error, refetch } = useCurrentUser();
  const title = usePageTitle();
  const isExpired = useSession((state) => state.isExpired);

  // The API client attempts one refresh before a 401 reaches this query.
  // Authentication state changes are handled by AuthBootstrap after commit.
  const isUnauthorised = isError && error instanceof ApiError && error.statusCode === 401;

  /*
   * Checked before anything else, and before the query branches below: once the
   * session has expired there is no principal to resolve and nothing useful to
   * say about the failed request. `RequireAuth` lets this render rather than
   * redirecting, so the user is told what happened instead of being bounced.
   */
  if (isExpired) {
    return <SessionExpiredScreen />;
  }

  // The effect above has not run yet on the render that first sees the 401.
  // A skeleton rather than the error branch below, which would flash an
  // authentication error for the one frame before the expiry screen replaces it.
  if (isUnauthorised) {
    return <PageSkeleton className="min-h-screen" />;
  }

  if (isPending) {
    return <PageSkeleton className="min-h-screen" />;
  }

  /*
   * The 401 case is handled above, by the effect and the `isExpired` branch.
   * Anything else is a real error, and its own message is more useful than a
   * guess about authentication.
   */
  if (isError || !user) {
    return (
      <div className="grid min-h-screen place-items-center px-4">
        <ErrorState
          message={error instanceof Error ? error.message : common.errors.generic}
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  // Authenticated, but the account was never finished being set up. The spec
  // treats this as an error rather than an empty dashboard.
  //
  // The header is rendered without its notification bell: this account cannot
  // act on anything, so firing a notifications query for it would be noise.
  if (hasNoWorkspaceAccess(user.roles)) {
    return (
      <div className="flex min-h-screen flex-col">
        <AppBar user={user} showNotifications={false} />
        <div className="grid flex-1 place-items-center px-4">
          <EmptyState
            icon={<ShieldAlert className="size-6" />}
            title={auth.errors.notAuthenticated}
          />
        </div>
        <AppFooter />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Keyboard users should not have to tab through the header on every
          navigation to reach the page content. */}
      <a
        href={`#${MAIN_CONTENT_ID}`}
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-control focus:bg-violet-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        {common.actions.skipToContent}
      </a>

      <AppBar user={user} showNotifications {...(title === undefined ? {} : { title })} />

      {/*
        `scroll-mt-20` clears the sticky header. Without it the skip link — and
        any hash navigation — lands with the focused content hidden underneath.
      */}
      <main id={MAIN_CONTENT_ID} tabIndex={-1} className="flex-1 scroll-mt-20">
        {/*
          The boundary for code-split routes. Analytics and Reports pull in
          Recharts (~600KB of source, plus its own Redux Toolkit dependency),
          which no other screen needs — loading it on every visit made the
          landing page pay for a chart most users never open.

          One boundary here rather than per route: the header stays put while a
          chunk loads, so navigation never flashes an empty page.

          `min-h-[60vh]` on the fallback so a loading chunk does not collapse the
          page and bounce the layout. A skeleton rather than a spinner, so the
          space it holds is the shape of what is coming.
        */}
        <Suspense fallback={<PageSkeleton className="min-h-[60vh]" />}>
          <Outlet context={{ user }} />
        </Suspense>
      </main>

      <AppFooter />
    </div>
  );
}
