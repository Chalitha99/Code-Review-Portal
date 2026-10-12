import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom';
import { AlertTriangle, FileQuestion } from 'lucide-react';
import { EmptyState } from '@/components/common/states.tsx';
import { ROUTES } from '@/config/routes.ts';
import { useSession } from '@/hooks/useSession.ts';
import common from '@/content/common.json';
import { SessionExpiredScreen } from '@/features/auth/components/SessionExpiredScreen.tsx';

/**
 * Did a lazily-imported chunk fail to arrive?
 *
 * Matched on the message rather than a type, because there is no shared error
 * class to catch: the browser, Vite's dev server and the built bundle each word
 * this differently ("Failed to fetch dynamically imported module",
 * "error loading dynamically imported module", "Importing a module script
 * failed"). A `504 (Outdated Optimize Dep)` from Vite lands here too.
 *
 * Worth telling apart from any other throw because the RECOVERY is different: a
 * missing chunk is fixed by refetching the document, and nothing else the user
 * can do from this screen will help.
 *
 * Only an `Error` or a string is inspected. `String(someObject)` yields
 * "[object Object]", which cannot match and would only invite a reader to think
 * arbitrary throws were being handled.
 */
function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return /dynamically imported module|importing a module script failed|outdated optimize dep|failed to fetch dynamically/i.test(
    message,
  );
}

/**
 * Route-level error boundary.
 *
 * Distinguishes "this URL does not exist" from "something threw". The route
 * previously used `NotFoundPage` for both, so a crash inside the authenticated
 * tree reported a missing page — which sends the reader looking for a broken
 * link instead of a broken component.
 */
export function RouteError() {
  const error = useRouteError();
  const isAuthenticated = useSession((state) => state.isAuthenticated);

  /*
   * A dead session outranks whatever threw.
   *
   * The user reported reaching this boundary — "This page ran into a problem" —
   * after their session expired. That exact path could not be reproduced (see the
   * note in `RootLayout`), so rather than guess at a cause and fix the wrong
   * thing, this asks the only question that decides which message is TRUE: is
   * there still a session?
   *
   * If there is not, then whatever threw, the honest answer is "you have been
   * signed out", not "this page has a bug" — and the user gets an action that
   * works instead of a retry that cannot. The Zustand flag reflects the
   * cookie-backed authentication check performed at application startup.
   */
  if (!isAuthenticated) {
    return <SessionExpiredScreen />;
  }

  if (isRouteErrorResponse(error) && error.status === 404) {
    return (
      <EmptyState
        className="min-h-[60vh]"
        icon={<FileQuestion className="size-6" />}
        title={common.errors.notFound}
        action={
          <Link
            to={ROUTES.home}
            className="text-sm font-semibold text-brand-blue-600 hover:text-brand-blue-500"
          >
            {common.actions.backToDashboard}
          </Link>
        }
      />
    );
  }

  // Surfaced in the console for a developer; the user gets the plain message.
  console.error('Route error', error);

  const chunkFailure = isChunkLoadError(error);

  return (
    <EmptyState
      className="min-h-[60vh]"
      icon={<AlertTriangle className="size-6 text-danger" />}
      title={chunkFailure ? common.errors.chunkTitle : common.errors.boundaryTitle}
      hint={chunkFailure ? common.errors.chunkBody : common.errors.boundaryBody}
      action={
        <span className="flex flex-wrap items-center justify-center gap-4">
          {/*
            A full reload, not a router navigation, and it leads.

            Every screen below the shell is a `React.lazy` chunk, so the most
            common way to reach this boundary is a dynamic import that failed —
            a stale tab after a deploy in production, and the window during a
            Vite re-optimisation in development. `Back to Dashboard` cannot
            recover from either: it is a client-side navigation that re-requests
            the very module that just failed, from the same broken module graph.
            Only a document reload refetches it.

            The copy also used to promise a retry that was not on screen — the
            body said "You can retry" beside a single Back link.
          */}
          <button
            type="button"
            onClick={() => {
              window.location.reload();
            }}
            className="text-sm font-semibold text-brand-blue-600 hover:text-brand-blue-500"
          >
            {common.actions.reload}
          </button>
          <Link to={ROUTES.home} className="text-sm font-semibold text-ink-500 hover:text-ink-700">
            {common.actions.backToDashboard}
          </Link>
        </span>
      }
    />
  );
}
