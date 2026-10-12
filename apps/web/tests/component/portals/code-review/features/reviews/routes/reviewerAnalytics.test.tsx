import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { signInForTest } from '@tests/support/setup.ts';
import { apiStub } from '@tests/support/apiStub.ts';
import { buildDataset, toListItem } from '@tests/support/fixtures/dataset.ts';
import { serveNotifications, serveReferenceData, serveTaskLists } from '@tests/support/serve.ts';
import { routes } from '@/app/routes.tsx';

/**
 * Reviewer Analytics, through the real route table.
 *
 * The arithmetic is asserted in `domain/reviewerMetrics.test.ts`; which reviews
 * `scope=reviewer` returns (the ones this user GAVE, refused without the role)
 * is a NestJS rule tested in apps/api reviews.scope.spec.ts. What is worth
 * proving HERE is the wiring: the tab exists and resolves, the page asks for the
 * reviewer scope, and it renders real figures from the answer.
 */

/** Holds Reviewer, and has ten seeded reviews of other people's tasks. */
const REVIEWER = 'u-charith';
const db = buildDataset();

function renderApp(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(routes, { initialEntries: [path] });

  return {
    ...render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    ),
    router,
    user: userEvent.setup({ delay: null }),
  };
}

beforeEach(() => {
  signInForTest(REVIEWER);
  serveReferenceData(db);
  serveNotifications(db);
  const items = db.tasks.map((task) => toListItem(db, task));
  serveTaskLists({
    available: items.filter((task) => task.reviewerId === null && task.status === 'Submitted'),
    assigned: items.filter((task) => task.reviewerId === REVIEWER && task.status === 'InReview'),
    history: items.filter((task) =>
      db.reviews.some((review) => review.taskId === task.id && review.reviewerId === REVIEWER),
    ),
  });
  // GET /reviews?scope=reviewer: the reviews this user decided.
  apiStub.get('/reviews', ({ query }) => {
    expect(query.get('scope')).toBe('reviewer');
    return db.reviews.filter((review) => review.reviewerId === REVIEWER);
  });
});

describe('Reviewer Analytics', () => {
  it('is reachable from the tab strip', async () => {
    const { user, router } = renderApp('/crp/reviewer');

    await user.click(await screen.findByRole('link', { name: /analytics/i }));

    // Lazy route modules resolve asynchronously, so the location updates after the chunk loads.
    await waitFor(() => expect(router.state.location.pathname).toBe('/crp/reviewer/analytics'));
  });

  /**
   * The page heading, and the readiness signal for everything below it.
   *
   * This file used to carry a bespoke 15s `CHART_PAGE_TIMEOUT` on every query
   * here, because the page gated its ENTIRE render — heading included — on three
   * queries plus a lazily imported Recharts chunk, and under full-suite
   * contention that intermittently outran the shared 10s budget. The timeout was
   * treating the symptom: a wait for a heading was really a wait for three
   * fetches.
   *
   * `ReviewerAnalyticsPage` now renders its header before the data, so this is a
   * wait for the route rather than for the network, and the shared budget in
   * `tests/support/setup.ts` is the right one. If this starts flaking again, the
   * regression is in the page's render gate — do not put the number back.
   */
  async function findAnalyticsPage() {
    return screen.findByText(/my review analytics/i);
  }

  /**
   * The KPI card carrying this caption.
   *
   * Anchored on the CAPTION, not the label. "Avg Turnaround" and "Avg Rank
   * Given" each appear twice on this page — once in the KPI row and once as a
   * column heading in the per-customer panel — so a label query matches two
   * elements and picks the wrong one half the time.
   */
  async function kpiCard(caption: RegExp) {
    const found = await screen.findByText(caption);
    const card = found.closest('div');
    if (card === null) throw new Error(`No KPI card for ${String(caption)}`);
    return card;
  }

  it('reports the reviewer’s own workload, turnaround and grading', async () => {
    renderApp('/crp/reviewer/analytics');

    expect(await findAnalyticsPage()).toBeInTheDocument();

    // A real figure rather than the empty state — the seed gives this reviewer
    // ten decided reviews, so "N/A" here would mean the page is reading the
    // wrong scope and quietly rendering somebody else's emptiness.
    const completed = await kpiCard(/decided across every cycle/i);
    expect(within(completed).queryByText('N/A')).toBeNull();

    // Anchored, because the page SUBTITLE also says "grading profile" and an
    // unanchored match picks it up.
    const grading = await kpiCard(/^(you grade|a balanced grading profile)/i);
    expect(within(grading).queryByText('N/A')).toBeNull();
  });

  it('shows a non-zero turnaround, which the seed once made impossible', async () => {
    /*
     * A regression guard with history. `seedReviews` used to write one timestamp
     * into `createdAt`, `decidedAt` and `updatedAt`, so every turnaround in the
     * product was exactly zero and the metric looked implemented while measuring
     * nothing. If someone collapses those fields again this fails.
     */
    renderApp('/crp/reviewer/analytics');

    const card = await kpiCard(/from opening a review to deciding it/i);
    expect(within(card).queryByText('N/A')).toBeNull();
    expect(within(card).queryByText('0m')).toBeNull();
  });

  it('carries an accessible table for the chart a legend cannot describe', async () => {
    renderApp('/crp/reviewer/analytics');

    // The trend chart's SVG is hidden from assistive tech, so this table IS the
    // data for a screen-reader user. Twelve weeks by two series is too much for
    // a legend, which is why the donuts get one and this does not.
    expect(
      await screen.findByRole('table', { name: /reviews decided each week/i }),
    ).toBeInTheDocument();
  });
});
