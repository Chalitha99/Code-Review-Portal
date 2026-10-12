import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { signInForTest } from '@tests/support/setup.ts';
import { routes } from '@/app/routes.tsx';
import { apiStub } from '@tests/support/apiStub.ts';
import { buildDataset, toListItem } from '@tests/support/fixtures/dataset.ts';
import { serveNotifications, serveReferenceData, serveTaskLists } from '@tests/support/serve.ts';

const db = buildDataset();
import { APPROVAL_RATE_TARGET } from '@/lib/analyticsTargets.ts';
import { cycleDistribution } from '@/portals/code-review/features/reports/domain/reportMetrics.ts';

/**
 * Admin Reports, rendered — which nothing tested before this file.
 *
 * `reportMetrics.test.ts` proves the arithmetic against the business's own
 * figures and is the better test of the maths. It cannot see any of what is
 * asserted here: that the number a function returns is the number the card
 * shows, that the card and the chart drawn from the same rows agree, and that a
 * filter moves both together. A page can wire `summary.cancelled` into the
 * Delivered card and pass every domain test ever written.
 *
 * Expected values are counted off the fixtures IN THIS FILE rather than by calling
 * the functions under test. Restating the implementation would make this a
 * tautology; an oracle is only worth having if it is derived independently.
 */

const ADMIN = 'u-charith';

function renderReports() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const router = createMemoryRouter(routes, {
    initialEntries: ['/crp/admin/reports'],
  });

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

/** What an admin can see: drafts are private developer work and never reach Reports. */
const adminTasks = () => db.tasks.filter((task) => task.status !== 'Draft');

const countOf = (status: string, tasks = adminTasks()) =>
  tasks.filter((task) => task.status === status).length;

/** Every figure the cards claim, counted straight off the seed. */
function expected() {
  const approved = countOf('Approved');
  // Tasks that actually reached review: every admin-visible task, less cancellations.
  const reviewed = adminTasks().length - countOf('Cancelled');

  return {
    total: adminTasks().length,
    approved,
    changesRequested: countOf('ChangesRequested'),
    cancelled: countOf('Cancelled'),
    approvalRate: Math.round((approved / reviewed) * 1000) / 10,
  };
}

/**
 * The KPI card carrying this caption.
 *
 * Anchored on the CAPTION rather than the label, which is the lesson
 * `reviewerAnalytics.test.tsx` already paid for: "Approval Rate" and "Delivered"
 * each appear several times on this page — in the KPI row, in the status chart's
 * legend, and again as column headings inside the breakdown panels — so a label
 * query matches three elements and picks whichever it reaches first. The
 * captions are unique. The caption is a direct child of the card, so its parent
 * is the card itself.
 */
async function card(caption: RegExp) {
  const found = await screen.findByText(caption);
  const root = found.parentElement;
  if (root === null) throw new Error(`No KPI card for ${String(caption)}`);
  return root;
}

/**
 * The Task Status Distribution legend, which is the donut's accessible form.
 *
 * Each row reads label + count + share, concatenated without separators
 * ("Changes Requested918%"), so callers match a label-and-count prefix and leave
 * the percentage open rather than trying to split the digits apart.
 */
async function statusLegend() {
  const heading = await screen.findByRole('heading', {
    name: 'Task Status Distribution',
  });
  const chart = heading.closest('div.rounded-card');
  if (chart === null) throw new Error('status chart has no card');
  return within(chart as HTMLElement).getAllByRole('button');
}

// The route is a lazy module pulling in Recharts; its first cold transform can outlast a
// `findBy` budget, so load it once up front instead of inside the first test.
beforeAll(async () => {
  await import('@/portals/code-review/features/reports/routes/AdminReportsPage.tsx');
}, 60_000);

beforeEach(() => {
  signInForTest(ADMIN);
  serveReferenceData(db);
  serveNotifications(db);
  // What NestJS answers an admin: every submitted task (drafts are private) and
  // every review.
  serveTaskLists({ all: adminTasks().map((task) => toListItem(db, task)) });
  apiStub.get('/reviews', () => db.reviews);
});

describe('Admin Reports', () => {
  it('shows the counts the seed actually contains', async () => {
    const want = expected();

    renderReports();

    expect(
      within(await card(/^All review tasks$/)).getByText(String(want.total)),
    ).toBeInTheDocument();
    // The Approved caption interpolates the rate, so the anchor carries it: a
    // bare /approval rate/ also matches the column heading in every breakdown
    // panel below.
    expect(
      within(await card(new RegExp(`^${String(want.approvalRate)}% approval rate$`))).getByText(
        String(want.approved),
      ),
    ).toBeInTheDocument();
    expect(
      within(await card(/^Pending revisions$/)).getByText(String(want.changesRequested)),
    ).toBeInTheDocument();
    expect(
      within(await card(/^Tasks cancelled$/)).getByText(String(want.cancelled)),
    ).toBeInTheDocument();
  });

  it('computes the approval rate over tasks that reached review', async () => {
    const want = expected();

    renderReports();

    const rate = await card(/^Of submitted tasks$/);
    expect(within(rate).getByText(`${String(want.approvalRate)}%`)).toBeInTheDocument();

    // Not approved ÷ total, the tempting wrong denominator: it would punish the
    // team for drafts in progress and for work the business itself withdrew.
    const naive = Math.round((want.approved / want.total) * 1000) / 10;
    expect(naive).not.toBe(want.approvalRate);
  });

  /**
   * The contradiction this pass exists to remove.
   *
   * Developer Analytics compared the same rate against 50 while this page used
   * 70, so one figure read "On target" for a developer and "Below target" for
   * the administrator looking at that same developer.
   */
  it('judges the rate against the shared target and says the target is provisional', async () => {
    const want = expected();

    renderReports();

    const rate = await card(/^Of submitted tasks$/);
    const verdict = want.approvalRate >= APPROVAL_RATE_TARGET ? /on target/i : /below target/i;
    expect(within(rate).getByText(verdict)).toBeInTheDocument();

    // FL 2.4.3 needs the indicator; the specification never gave a number. The
    // card has to admit that rather than presenting a placeholder as agreed.
    expect(within(rate).getByText(/placeholder pending business sign-off/i)).toBeInTheDocument();
  });

  /**
   * Card ↔ chart consistency.
   *
   * Both are drawn from the same filtered rows, so they cannot legitimately
   * disagree — but they are computed by different functions and nothing enforced
   * it.
   */
  it('agrees with the status chart drawn from the same rows', async () => {
    const want = expected();

    renderReports();

    const rows = await statusLegend();

    // One row per status present, and none for a status with no tasks — an
    // always-rendered zero slice would flatter the chart against the cards.
    const present = new Set(adminTasks().map((task) => task.status));
    expect(rows).toHaveLength(present.size);

    // The three statuses that also have a card of their own must report the same
    // number in both places.
    expect(rows.map((row) => row.textContent)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          new RegExp(`^Changes Requested${String(want.changesRequested)}\\d+%$`),
        ),
        expect.stringMatching(new RegExp(`^Cancelled${String(want.cancelled)}\\d+%$`)),
        expect.stringMatching(new RegExp(`^Approved${String(want.approved)}\\d+%$`)),
      ]),
    );
  });

  it('moves the cards and the chart together when a customer filter is applied', async () => {
    const { user } = renderReports();

    const before = (await card(/^All review tasks$/)).textContent;

    const customer = db.customers.find((entry) =>
      adminTasks().some((task) => task.customerId === entry.id),
    );
    if (!customer) throw new Error('seed has no customer with tasks');
    const theirs = adminTasks().filter((task) => task.customerId === customer.id);

    await user.click(screen.getByRole('combobox', { name: 'Customer' }));
    await user.click(await screen.findByRole('option', { name: customer.name }));

    const after = await card(/^All review tasks$/);
    expect(after.textContent).not.toBe(before);
    expect(within(after).getByText(String(theirs.length))).toBeInTheDocument();

    // The chart followed. A filter that moved the cards and left the donut
    // showing the whole system would be the same defect in reverse.
    const rows = await statusLegend();
    expect(rows).toHaveLength(new Set(theirs.map((task) => task.status)).size);
  });

  it('contains only Date and Customer filters with no Status filter', async () => {
    renderReports();

    await card(/^All review tasks$/);

    expect(screen.getByRole('combobox', { name: 'Date' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Customer' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /^status$/i })).not.toBeInTheDocument();

    expect(screen.getByText('Date: All Time')).toBeInTheDocument();
    expect(screen.getByText('Customer: All Customers')).toBeInTheDocument();
  });

  it('displays distribution charts in the required order and uses Cycle terminology', async () => {
    renderReports();

    await card(/^All review tasks$/);

    const qHeading = await screen.findByRole('heading', { name: 'Quality Ranking Distribution' });
    const cHeading = await screen.findByRole('heading', { name: 'Cycle Distribution' });
    const sHeading = await screen.findByRole('heading', { name: 'Task Status Distribution' });

    expect(qHeading).toBeInTheDocument();
    expect(cHeading).toBeInTheDocument();
    expect(sHeading).toBeInTheDocument();

    // Verify ordering in the document: Quality Ranking first, Cycle second, Task Status last
    expect(
      qHeading.compareDocumentPosition(cHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      cHeading.compareDocumentPosition(sHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // Verify Review Cycle Distribution is gone
    expect(screen.queryByText(/Review Cycle Distribution/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Avg Review Cycles/i)).not.toBeInTheDocument();
    expect(screen.getAllByText('Avg Cycles').length).toBeGreaterThan(0);
  });

  it('provides Developers and Reviewers tabs and removes the Customers tab and Customer Overview section', async () => {
    renderReports();

    await card(/^All review tasks$/);

    expect(screen.getByRole('tab', { name: 'Developers' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Reviewers' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Customers' })).not.toBeInTheDocument();

    expect(screen.queryByText(/Customer Overview/i)).not.toBeInTheDocument();
  });

  it('renders Rank Distribution and Cycle Distribution charts in Developer Performance without review cycle terminology', async () => {
    renderReports();

    await card(/^All review tasks$/);

    // Developers tab is active by default
    const rankTitles = await screen.findAllByText('Rank Distribution');
    const cycleTitles = await screen.findAllByText('Cycle Distribution');

    expect(rankTitles.length).toBeGreaterThan(0);
    expect(cycleTitles.length).toBeGreaterThan(0);

    const devAvgCycles = screen.getAllByText('Avg Cycles');
    expect(devAvgCycles.length).toBeGreaterThan(0);

    expect(screen.queryByText(/Avg Review Cycles/i)).not.toBeInTheDocument();
  });

  it('renders Reviewer Performance without pie or donut charts', async () => {
    const { user } = renderReports();

    await card(/^All review tasks$/);

    const reviewerTab = await screen.findByRole('tab', { name: 'Reviewers' });
    await user.click(reviewerTab);

    // Verify Reviewer tab content is shown
    const avgRankGiven = await screen.findAllByText('Avg Rank Given');
    expect(avgRankGiven.length).toBeGreaterThan(0);

    // Verify there are no pie/donut charts in the reviewer tabpanel
    const tabpanel = screen.getByRole('tabpanel');
    expect(within(tabpanel).queryByText(/Rank Distribution/i)).not.toBeInTheDocument();
    expect(within(tabpanel).queryByText(/Cycle Distribution/i)).not.toBeInTheDocument();
  });

  it('scopes all metrics and charts to SEMCO when SEMCO is selected', async () => {
    const { user } = renderReports();

    await card(/^All review tasks$/);

    const semco = db.customers.find((c) => c.name === 'SEMCO');
    if (!semco) throw new Error('SEMCO not found in seed');

    const semcoTasks = adminTasks().filter((t) => t.customerId === semco.id);
    const semcoApproved = semcoTasks.filter((t) => t.status === 'Approved').length;
    const semcoReviewed =
      semcoTasks.length - semcoTasks.filter((t) => t.status === 'Cancelled').length;
    const semcoRate = Math.round((semcoApproved / semcoReviewed) * 1000) / 10;

    await user.click(screen.getByRole('combobox', { name: 'Customer' }));
    await user.click(await screen.findByRole('option', { name: 'SEMCO' }));

    const totalCard = await card(/^All review tasks$/);
    expect(within(totalCard).getByText(String(semcoTasks.length))).toBeInTheDocument();

    const approvedCard = await card(new RegExp(`^${String(semcoRate)}% approval rate$`));
    expect(within(approvedCard).getByText(String(semcoApproved))).toBeInTheDocument();

    const rateCard = await card(/^Of submitted tasks$/);
    expect(within(rateCard).getByText(`${String(semcoRate)}%`)).toBeInTheDocument();
  });

  it('shows a clean empty state with Reset Filters button when no report data matches filters', async () => {
    const { user } = renderReports();

    await card(/^All review tasks$/);

    const emptyCustomer = db.customers.find(
      (c) => !adminTasks().some((t) => t.customerId === c.id),
    );
    if (!emptyCustomer) throw new Error('No empty customer in seed');

    await user.click(screen.getByRole('combobox', { name: 'Customer' }));
    await user.click(await screen.findByRole('option', { name: emptyCustomer.name }));

    expect(
      await screen.findByText('No report data found for the selected filters.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Try adjusting your date range or customer selection to view reports.'),
    ).toBeInTheDocument();

    // Reset Filters button should be present in both the filter bar and the empty state card
    const resetBtns = screen.getAllByRole('button', { name: /Reset Filters/i });
    expect(resetBtns.length).toBe(2);

    const emptyStateReset = resetBtns[1];
    if (!emptyStateReset) throw new Error('Missing empty state reset button');

    // Clicking Reset Filters in the empty state restores full default reporting
    await user.click(emptyStateReset);

    expect(
      await screen.findByRole('heading', { name: 'Quality Ranking Distribution' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Task Status Distribution' })).toBeInTheDocument();
    expect(screen.getByText('Customer: All Customers')).toBeInTheDocument();
  });

  it('restores default state when Reset Filters in filter bar is clicked', async () => {
    const { user } = renderReports();

    await card(/^All review tasks$/);

    const semco = db.customers.find((c) => c.name === 'SEMCO')!;
    await user.click(screen.getByRole('combobox', { name: 'Customer' }));
    await user.click(await screen.findByRole('option', { name: semco.name }));

    // Reset button should now be visible in filter bar
    const resetBtn = await screen.findByRole('button', { name: /Reset Filters/i });
    await user.click(resetBtn);

    // Filter resets back to All Customers
    expect(screen.getByText('Customer: All Customers')).toBeInTheDocument();
    const totalCard = await card(/^All review tasks$/);
    expect(within(totalCard).getByText(String(adminTasks().length))).toBeInTheDocument();
  });

  it('correctly handles the cycle-decrement case (reviewRound=2, countedCycle=1) contributing to Cycle 1', () => {
    const baseTask = adminTasks().find((t) => t.status === 'Approved');
    if (!baseTask) throw new Error('No approved task in seed');

    // Directly test cycleDistribution with a cycle-decremented task
    const mockTask = { ...baseTask, reviewRound: 2, countedCycle: 1 };

    const distribution = cycleDistribution([mockTask as never], {
      one: 'Cycle 1',
      two: 'Cycle 2',
      threePlus: 'Cycle 3+',
    });

    const cycle1 = distribution.find((s) => s.key === '1');
    const cycle2 = distribution.find((s) => s.key === '2');

    // Crucial check: Must contribute to Cycle 1, NOT Cycle 2
    expect(cycle1?.value).toBe(1);
    expect(cycle2).toBeUndefined();
  });
});
