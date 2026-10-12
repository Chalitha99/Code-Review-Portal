import { useMemo } from 'react';
import {
  AlertTriangle,
  Award,
  Building2,
  CheckCircle2,
  ClipboardList,
  Repeat,
  Target,
} from 'lucide-react';
import { CustomerChip } from '@/portals/code-review/components/badges.tsx';
import { Card, CardBody, CardHeader } from '@/components/ui/Card.tsx';
import { DonutChart, type DonutSlice } from '@/components/common/charts/DonutChart.tsx';
import { MetricBar } from '@/components/common/charts/MetricBar.tsx';
import {
  CHART_FALLBACK_COLOR,
  CYCLE_COLORS,
  RANK_COLORS,
  STATUS_COLORS,
} from '@/portals/code-review/components/charts/chartPalette.ts';
import { KpiCard } from '@/components/common/KpiCard.tsx';
import { Reveal } from '@/components/common/Reveal.tsx';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/states.tsx';
import { interpolate } from '@/lib/formatters.ts';
import {
  APPROVAL_RATE_TARGET,
  GOOD_RANK_THRESHOLD,
  HIGH_CYCLE_THRESHOLD,
} from '@/lib/analyticsTargets.ts';
import { useMyReviews } from '@/portals/code-review/hooks/useReviews.ts';
import common from '@/content/common.json';
import tasks from '@/content/tasks.json';
import { useTasks } from '../api/queries.ts';
import {
  developerQualityMetrics,
  submittedForAnalytics,
  taskMetrics,
} from '../domain/taskMetrics.ts';

/**
 * Developer Analytics (screen 17).
 *
 * All arithmetic comes from `taskMetrics`; this file only decides what a number
 * looks like. That is what lets FL 2.4.3's empty-state rules be tested without
 * rendering a chart.
 *
 * Two queries, because a rank lives on a REVIEW and everything else lives on a
 * task — see `useMyReviews`.
 */

/*
 * Chart colours come from `components/charts/chartPalette.ts`.
 *
 * This file used to declare its own `STATUS_COLOR` / `CYCLE_COLOR` /
 * `RANK_COLOR` maps, and they had drifted from the admin Reports copy: Approved
 * was `#166534` here and `#15803d` there, Submitted `#1e40af` against `#7c3aed`.
 * The same status was two different colours depending on which screen you were
 * standing on, which is precisely the thing a shared palette exists to stop.
 */

const RANK_LABEL: Record<1 | 2 | 3, string> = {
  1: tasks.analytics.rank['1'],
  2: tasks.analytics.rank['2'],
  3: tasks.analytics.rank['3'],
};

/** The per-customer figure pair, shared by all three so they cannot drift. */
const FIGURE_LABEL = 'truncate text-[0.6875rem] font-semibold tracking-wide text-ink-500 uppercase';
const FIGURE_VALUE = 'mt-1 font-display text-lg font-bold tabular-nums text-ink-900';

/** One place decides how a missing figure reads, so six cards cannot disagree. */
function orNotAvailable(value: number | null, format: (value: number) => string): string {
  return value === null ? tasks.analytics.notAvailable : format(value);
}

const asPercent = (value: number) => `${value.toFixed(1)}%`;
const asRank = (value: number) => value.toFixed(2);
const asCycles = (value: number) => value.toFixed(2);

export function AnalyticsPage() {
  const { data, isPending, error, refetch } = useTasks('mine');
  const { data: reviews, isPending: reviewsPending } = useMyReviews();

  /*
    One filtered set, feeding BOTH metric functions.

    Filtering twice — or filtering for the KPI row and not for the donuts — is
    how a headline figure ends up disagreeing with the chart directly beneath it.
   */
  const analysed = useMemo(() => submittedForAnalytics(data ?? []), [data]);

  const metrics = useMemo(() => taskMetrics(analysed), [analysed]);
  const quality = useMemo(
    () => developerQualityMetrics(analysed, reviews ?? []),
    [analysed, reviews],
  );

  if (isPending || reviewsPending) return <LoadingState />;
  if (error) {
    return (
      <ErrorState
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  const statusSlices: DonutSlice[] = metrics.byStatus.map((entry) => ({
    id: entry.status,
    label: common.status[entry.status],
    value: entry.count,
    color: STATUS_COLORS[entry.status],
  }));

  const cycleSlices: DonutSlice[] = metrics.byCycle.map((entry) => ({
    id: entry.label,
    label: interpolate(tasks.list.filters.cycleValue, { n: entry.label }),
    value: entry.count,
    color: CYCLE_COLORS[entry.label] ?? CHART_FALLBACK_COLOR,
  }));

  const rankSlices: DonutSlice[] = quality.byRank.map((entry) => ({
    id: String(entry.rank),
    label: RANK_LABEL[entry.rank],
    value: entry.count,
    color: RANK_COLORS[String(entry.rank)] ?? CHART_FALLBACK_COLOR,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-lg font-bold text-ink-900">{tasks.analytics.title}</h2>
        <p className="mt-0.5 text-sm text-ink-500">{tasks.analytics.subtitle}</p>
      </div>

      {/*
        Six cards, three across — the reference's 3×2 block.

        Every figure below is computed over `analysed`, which excludes Draft (see
        `submittedForAnalytics`). "Total Submitted" once counted drafts too,
        mirroring the Power App; it read as a contradiction of its own label and
        the business asked for it to be corrected. The workspace counters above
        this tab still carry the Draft-versus-Submitted split, which is where
        that number belongs.
      */}
      <Reveal className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/*
          `metrics.submitted`, NOT `metrics.total`.

          The card says "Total Submitted" and used to render every non-Draft
          task, Cancelled included — so it disagreed with the Approval Rate two
          cards along, which divides by `submitted`. On the seed that is a card
          reading 6 above a rate computed over 2, because four of the six were
          cancelled. Cancelled work was never submitted for review in any sense
          the label supports; it stays visible in the status donut below, which
          is the card that IS about status.
        */}
        <KpiCard
          label={tasks.analytics.totalTasks}
          value={metrics.submitted}
          caption={tasks.analytics.totalTasksCaption}
          icon={<ClipboardList className="size-4" />}
        />
        <KpiCard
          label={tasks.analytics.approved}
          value={metrics.approved}
          caption={interpolate(tasks.analytics.approvedCaption, {
            rate: orNotAvailable(metrics.approvalRate, asPercent),
          })}
          tone="green"
          icon={<CheckCircle2 className="size-4" />}
        />
        <KpiCard
          label={tasks.analytics.changesRequested}
          value={metrics.changesRequested}
          caption={tasks.analytics.changesRequestedCaption}
          tone="amber"
          icon={<AlertTriangle className="size-4" />}
        />
        <KpiCard
          label={tasks.analytics.avgRank}
          value={orNotAvailable(quality.avgRank, asRank)}
          caption={tasks.analytics.avgRankCaption}
          tone="violet"
          icon={<Award className="size-4" />}
          // Lower is better on this scale, so the comparison is inverted against
          // every other target in the product.
          {...(quality.avgRank === null
            ? {}
            : { target: { met: quality.avgRank <= GOOD_RANK_THRESHOLD } })}
        />
        <KpiCard
          label={tasks.analytics.avgCycles}
          value={orNotAvailable(metrics.averageCycles, asCycles)}
          caption={tasks.analytics.avgCyclesCaption}
          tone="blue"
          icon={<Repeat className="size-4" />}
          {...(metrics.averageCycles === null
            ? {}
            : {
                target: { met: metrics.averageCycles <= HIGH_CYCLE_THRESHOLD },
              })}
        />
        <KpiCard
          label={tasks.analytics.approvalRate}
          // "N/A" rather than "0%" when nothing has been submitted: a rate needs a
          // denominator, and claiming 0% would read as total failure.
          value={orNotAvailable(metrics.approvalRate, asPercent)}
          caption={tasks.analytics.approvalRateCaption}
          tone="neutral"
          icon={<Target className="size-4" />}
          /*
            The SAME target the admin's Reports tab compares against, and the
            reason `lib/analyticsTargets.ts` exists. This card read `>= 50` while
            Reports read `>= 70`, so one developer's approval rate could be "On
            target" on their own page and "Below target" on the administrator's.
          */
          {...(metrics.approvalRate === null
            ? {}
            : {
                target: {
                  met: metrics.approvalRate >= APPROVAL_RATE_TARGET,
                  note: common.kpi.targetNote,
                },
              })}
        />
      </Reveal>

      {/*
        `Reveal` wraps the ROW, not each card. Wrapping cards individually
        inserts a div between the grid and the card, so the wrapper becomes the
        grid item and stretches while the card inside sizes to its own content —
        which is how a row of three donuts ends up three different heights
        (standards §8).

        `h-full` on each card for the same reason: a rank donut with two slices
        is shorter than a status donut with five.
      */}
      <Reveal className="grid gap-4 lg:grid-cols-3">
        <Card className="flex h-full flex-col">
          <CardHeader
            title={tasks.analytics.rankTitle}
            description={tasks.analytics.rankSubtitle}
          />
          <CardBody className="flex flex-1 items-center justify-center pt-5">
            <DonutChart
              slices={rankSlices}
              emptyLabel={tasks.analytics.rankEmpty}
              valueLabel={common.chart.reviews}
              centerLabel={String(quality.byRank.reduce((sum, r) => sum + r.count, 0))}
              centerCaption={common.chart.reviews}
            />
          </CardBody>
        </Card>

        <Card className="flex h-full flex-col">
          <CardHeader
            title={tasks.analytics.cycleTitle}
            description={tasks.analytics.cycleSubtitle}
          />
          <CardBody className="flex flex-1 items-center justify-center pt-5">
            <DonutChart
              slices={cycleSlices}
              emptyLabel={tasks.analytics.cycleEmpty}
              valueLabel={common.chart.tasks}
              centerLabel={String(metrics.approved)}
              centerCaption={tasks.analytics.approved}
            />
          </CardBody>
        </Card>

        <Card className="flex h-full flex-col">
          <CardHeader
            title={tasks.analytics.statusTitle}
            description={tasks.analytics.statusSubtitle}
          />
          <CardBody className="flex flex-1 items-center justify-center pt-5">
            <DonutChart
              slices={statusSlices}
              emptyLabel={tasks.analytics.statusEmpty}
              valueLabel={common.chart.tasks}
              centerLabel={String(metrics.total)}
              centerCaption={tasks.list.noun}
            />
          </CardBody>
        </Card>
      </Reveal>

      <Card>
        <CardHeader
          title={tasks.analytics.customersTitle}
          description={tasks.analytics.customersSubtitle}
          icon={<Building2 className="size-4" />}
        />
        <CardBody className="pt-4">
          {quality.byCustomer.length === 0 ? (
            <EmptyState title={tasks.analytics.customersEmpty} />
          ) : (
            <ul className="space-y-3">
              {quality.byCustomer.map((customer) => (
                /*
                  The customer's own colour as a left accent, the one sanctioned
                  use of a raw database colour — the same exception `CustomerChip`
                  takes in `badges.tsx`, and the same treatment Admin → Customers
                  uses via `getRowAccent`. It is legitimate here for the reason it
                  is illegitimate on a task grid: these rows ARE customers, so the
                  stripe identifies rather than decorates.

                  `border-l-4` with an inline colour rather than a token, because
                  the value comes from the record.

                  A background shift on hover, NOT `HOVER_LIFT`. These are nested
                  rows inside a card, and the shared lift reaches for
                  `shadow-card-hover` — an elevation the row has no resting
                  counterpart for, so it would pop a shadow out of nothing every
                  time the pointer crossed it. §8's "exactly one card hover" is
                  about cards; a list row is not one.
                */
                <li
                  key={customer.customerId}
                  className="rounded-card border border-l-4 border-line bg-canvas/60 p-4 transition-colors duration-200 hover:border-line-strong hover:bg-canvas"
                  style={{ borderLeftColor: customer.color }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CustomerChip name={customer.name} color={customer.color} variant="inline" />
                    <p className="text-xs text-ink-500">
                      {interpolate(tasks.analytics.customerTasks, {
                        tasks: customer.taskCount,
                        approved: customer.approvedCount,
                      })}
                    </p>
                  </div>

                  {/*
                    One row of three figures, matching the reference: the rate as a
                    meter because it is a proportion, the two averages as plain
                    numbers because they are not.

                    `items-end` aligns the meter's baseline with the two numbers
                    beside it — without it the bar floats above them, because a
                    1.5-line `<dd>` and a 2-line one do not share a bottom edge.
                  */}
                  <dl className="mt-4 grid items-end gap-4 sm:grid-cols-3">
                    {/*
                      `FIGURE_LABEL` / `FIGURE_VALUE` rather than three
                      hand-written class strings: these three sit side by side, so
                      any drift between them is immediately visible, and the
                      uppercase label echoes `KpiCard` so the page has one label
                      treatment rather than two.
                    */}
                    <div className="min-w-0">
                      <dt className={FIGURE_LABEL}>{tasks.analytics.customerApprovalRate}</dt>
                      <dd className="mt-2">
                        <MetricBar
                          value={customer.approvalRate ?? 0}
                          label={`${tasks.analytics.customerApprovalRate} — ${customer.name}`}
                          valueLabel={orNotAvailable(
                            customer.approvalRate,
                            (value) => `${Math.round(value)}%`,
                          )}
                        />
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className={FIGURE_LABEL}>{tasks.analytics.customerAvgRank}</dt>
                      <dd className={FIGURE_VALUE}>{orNotAvailable(customer.avgRank, asRank)}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className={FIGURE_LABEL}>{tasks.analytics.customerAvgCycles}</dt>
                      <dd className={FIGURE_VALUE}>
                        {orNotAvailable(customer.avgCycles, asCycles)}
                      </dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
