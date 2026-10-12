import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { signInForTest } from '@tests/support/setup.ts';
import { routes } from '@/app/routes.tsx';
import { useSession } from '@/hooks/useSession.ts';
import { apiStub } from '@tests/support/apiStub.ts';
import { buildDataset, toListItem } from '@tests/support/fixtures/dataset.ts';
import { page, serveNotifications, serveReferenceData } from '@tests/support/serve.ts';

const db = buildDataset();
import { APPROVAL_RATE_TARGET } from '@/lib/analyticsTargets.ts';

/**
 * Developer Analytics, rendered — which nothing tested before this file.
 *
 * `taskMetrics.test.ts` covers the arithmetic thoroughly. What it cannot see is
 * the wiring: which figure reaches which card, and what threshold the card
 * compares it against. That gap is exactly where the defect this file guards
 * against lived — the approval-rate indicator here used a hardcoded 50 while
 * Admin Reports used 70, so the same rate over the same tasks read "On target"
 * on this page and "Below target" on the administrator's.
 *
 * Expected values are counted off the fixtures here rather than by calling the
 * functions under test, so a wrong formula and a wrong expectation cannot agree
 * with each other.
 */

/** Fifteen seeded tasks across every status, including drafts and a cancellation. */
const DEVELOPER = 'u-hiruni';

function renderAnalytics() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(routes, { initialEntries: ['/crp/developer/analytics'] });

  return {
    ...render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    ),
    router,
  };
}

/** The statuses that count as having reached review, per FL 2.4.3. */
const SUBMITTED = ['Submitted', 'InReview', 'ChangesRequested', 'ReSubmitted', 'Approved'];

function expected(userId = DEVELOPER) {
  const own = db.tasks.filter((task) => task.developerId === userId);

  // Drafts are excluded from every figure on this page; Cancelled is excluded
  // from "submitted" but still appears in the status donut.
  const analysed = own.filter((task) => task.status !== 'Draft');
  const submitted = analysed.filter((task) => SUBMITTED.includes(task.status));
  const approved = analysed.filter((task) => task.status === 'Approved');

  return {
    analysed: analysed.length,
    submitted: submitted.length,
    approved: approved.length,
    changesRequested: analysed.filter((task) => task.status === 'ChangesRequested').length,
    approvalRate: submitted.length === 0 ? null : (approved.length / submitted.length) * 100,
    drafts: own.filter((task) => task.status === 'Draft').length,
  };
}

/**
 * The KPI card carrying this caption.
 *
 * Captions, not labels: "Approved", "Changes Requested" and "Approval Rate" all
 * appear again in the per-customer panel further down the same page.
 */
async function card(caption: RegExp) {
  const found = await screen.findByText(caption);
  const root = found.parentElement;
  if (root === null) throw new Error(`No KPI card for ${String(caption)}`);
  return root;
}

// The route is a lazy module pulling in Recharts; its first cold transform can outlast a
// `findBy` budget, so load it once up front instead of inside the first test.
beforeAll(async () => {
  await import('@/portals/code-review/features/tasks/routes/AnalyticsPage.tsx');
}, 60_000);

beforeEach(() => {
  signInForTest(DEVELOPER);
  serveReferenceData(db);
  serveNotifications(db);
  // `scope=mine` is the signed-in developer's own tasks (and reviews of them),
  // whoever the test signs in as.
  const me = () => useSession.getState().userId;
  apiStub.get('/tasks', () =>
    page(db.tasks.filter((task) => task.developerId === me()).map((task) => toListItem(db, task))),
  );
  apiStub.get('/reviews', () => {
    const own = new Set(
      db.tasks.filter((task) => task.developerId === me()).map((task) => task.id),
    );
    return db.reviews.filter((review) => own.has(review.taskId));
  });
});

describe('Developer Analytics', () => {
  it('counts submitted work without counting drafts', async () => {
    const want = expected();
    // The seed must actually contain drafts, or this proves nothing.
    expect(want.drafts).toBeGreaterThan(0);

    renderAnalytics();

    const total = await card(/^All my review tasks$/);
    expect(within(total).getByText(String(want.submitted))).toBeInTheDocument();

    /*
     * And it is NOT the raw task count.
     *
     * A draft is work in progress, not a submission; a cancellation is work the
     * business withdrew. Counting either would put a number here that the
     * Approval Rate card two along contradicts, because that rate divides by
     * this same set. The card once showed every non-Draft task, Cancelled
     * included, and read as a contradiction of its own label.
     */
    const own = db.tasks.filter((task) => task.developerId === DEVELOPER);
    expect(want.submitted).toBeLessThan(own.length);
    expect(within(total).queryByText(String(own.length))).not.toBeInTheDocument();
    expect(within(total).queryByText(String(want.analysed))).not.toBeInTheDocument();
  });

  it('shows the approved count and the changes-requested count', async () => {
    const want = expected();

    renderAnalytics();

    expect(
      within(await card(new RegExp(`^${want.approvalRate!.toFixed(1)}% success rate$`))).getByText(
        String(want.approved),
      ),
    ).toBeInTheDocument();
    expect(
      within(await card(/^Tasks requiring revision$/)).getByText(String(want.changesRequested)),
    ).toBeInTheDocument();
  });

  /**
   * The regression guard for the split target.
   *
   * The threshold has to be the one Admin Reports uses. Deriving the expected
   * verdict from `APPROVAL_RATE_TARGET` rather than writing "Below target" in
   * literally means this test follows a future sign-off instead of blocking it —
   * and it still fails the moment this page compares against a different number,
   * which is the thing that was actually broken.
   */
  it('judges the approval rate against the same target Admin Reports uses', async () => {
    const want = expected();
    expect(want.approvalRate).not.toBeNull();

    renderAnalytics();

    const rate = await card(/^Of submitted tasks$/);
    expect(within(rate).getByText(`${want.approvalRate!.toFixed(1)}%`)).toBeInTheDocument();

    const verdict = want.approvalRate! >= APPROVAL_RATE_TARGET ? /on target/i : /below target/i;
    expect(within(rate).getByText(verdict)).toBeInTheDocument();

    // FL 2.4.3 requires the indicator; the specification never gave the number.
    expect(within(rate).getByText(/placeholder pending business sign-off/i)).toBeInTheDocument();
  });

  /**
   * The test above cannot fail on the original defect, and that is worth being
   * explicit about: this developer's seeded rate is ~27%, which is below 50 AND
   * below 70, so both thresholds render "Below target" and the bug is invisible.
   *
   * A guard nobody has watched fail is a guard nobody has tested, so this one
   * puts the rate in the band where the two thresholds DISAGREE — 60%, on target
   * under the old hardcoded 50, below it under the shared 70. Reverting
   * `AnalyticsPage` to `>= 50` turns this test red and nothing else does.
   */
  it('reads Below target at 60%, where the old hardcoded 50 said On target', async () => {
    const own = db.tasks.filter((task) => task.developerId === DEVELOPER);

    // Five tasks that reached review, three of them approved: 60.0%.
    own.forEach((task, index) => {
      task.status = index < 3 ? 'Approved' : index < 5 ? 'Submitted' : 'Draft';
    });

    renderAnalytics();

    const rate = await card(/^Of submitted tasks$/);
    expect(within(rate).getByText('60.0%')).toBeInTheDocument();

    expect(within(rate).getByText(/below target/i)).toBeInTheDocument();
    expect(within(rate).queryByText(/on target/i)).not.toBeInTheDocument();
  });

  /**
   * Card ↔ chart consistency.
   *
   * "My Tasks by Status" is drawn from the same non-Draft rows the cards are, so
   * its slices must add up to that set — and it must show Cancelled, which the
   * "Total Submitted" card deliberately excludes. The two are different
   * questions about one dataset, and the donut is where the excluded rows go.
   */
  it('draws the status chart over the same rows the cards count', async () => {
    const want = expected();

    renderAnalytics();

    const heading = await screen.findByRole('heading', { name: 'My Tasks by Status' });
    const chart = heading.closest('div.rounded-card');
    if (chart === null) throw new Error('status chart has no card');

    const own = db.tasks.filter((task) => task.developerId === DEVELOPER);
    const analysed = own.filter((task) => task.status !== 'Draft');
    const present = new Set(analysed.map((task) => task.status));

    const rows = within(chart as HTMLElement).getAllByRole('button');
    expect(rows).toHaveLength(present.size);

    // No Draft slice: the page-wide filter drops them before anything is drawn.
    expect(rows.map((row) => row.textContent)).not.toContainEqual(expect.stringMatching(/^Draft/));

    // Cancelled IS shown, and is the difference between the donut's total and
    // the "Total Submitted" card above it.
    const cancelled = analysed.filter((task) => task.status === 'Cancelled').length;
    expect(want.analysed - want.submitted).toBe(cancelled);
  });

  /**
   * FL 2.4.3 Logic 1: with nothing approved, a rate has no denominator and the
   * charts have nothing to draw. "0%" would read as total failure and an empty
   * donut as a missing feature; both must say so in words.
   */
  it('reads N/A rather than zero for a developer with no decided work', async () => {
    const untouched = db.users.find(
      (user) =>
        user.roles.includes('Developer') &&
        !db.tasks.some((task) => task.developerId === user.id && task.status !== 'Draft'),
    );
    if (!untouched) throw new Error('seed has no developer without submitted work');

    signInForTest(untouched.id);
    renderAnalytics();

    const rate = await card(/^Of submitted tasks$/);
    expect(within(rate).getByText('N/A')).toBeInTheDocument();
    // No verdict either: a target comparison against no data is not a judgement.
    expect(within(rate).queryByText(/target/i)).not.toBeInTheDocument();

    expect(await screen.findByText('No approved tasks yet')).toBeInTheDocument();
    expect(screen.getByText('No decided reviews yet')).toBeInTheDocument();
  });
});
