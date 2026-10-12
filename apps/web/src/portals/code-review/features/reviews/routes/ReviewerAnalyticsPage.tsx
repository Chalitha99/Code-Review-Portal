import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  Gauge,
  Inbox,
  Timer,
} from 'lucide-react';
import type { Review } from '@sdp/contracts';
import { CustomerChip } from '@/portals/code-review/components/badges.tsx';
import { CategoryBarChart } from '@/components/common/charts/CategoryBarChart.tsx';
import {
  CHART_ACCENT_COLOR,
  CHART_FALLBACK_COLOR,
  RANK_COLORS,
  STATUS_COLORS,
} from '@/portals/code-review/components/charts/chartPalette.ts';
import { DonutChart, type DonutSlice } from '@/components/common/charts/DonutChart.tsx';
import { MetricBar } from '@/components/common/charts/MetricBar.tsx';
import { TrendAreaChart } from '@/components/common/charts/TrendAreaChart.tsx';
import { KpiCard } from '@/components/common/KpiCard.tsx';
import { Reveal } from '@/components/common/Reveal.tsx';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/states.tsx';
import { Card, CardBody, CardHeader } from '@/components/ui/Card.tsx';
import { Select, type SelectOption } from '@/components/ui/Select.tsx';
import { formatDate, formatDurationHours, interpolate } from '@/lib/formatters.ts';
import { useReviewsGiven } from '@/portals/code-review/hooks/useReviews.ts';
import { useTasks } from '@/portals/code-review/hooks/useTasks.ts';
import common from '@/content/common.json';
import reviews from '@/content/reviews.json';
import {
  decisionMix,
  rankGivenDistribution,
  reviewActivityByWeek,
  reviewerSummary,
  reviewsByCustomer,
  turnaroundBuckets,
} from '../domain/reviewerMetrics.ts';

/**
 * Reviewer Analytics.
 *
 * Structurally a sibling of the developer's Analytics tab — KPI grid, charts,
 * per-customer panel — so the two read as one product. The CONTENT is nothing
 * like it, and deliberately so: the developer asks "was my work accepted", the
 * reviewer asks "how much am I carrying, how fast do I answer, how strictly do I
 * grade, and whose work is it". Nothing here is a relabelled developer metric.
 *
 * Two queries, because they answer different halves. `useReviewsGiven` is
 * everything already decided — keyed on the review's own reviewerId, which is
 * the only durable attribution once a Request Changes clears `task.reviewerId`.
 * `useTasks('assigned')` is the queue still waiting, which has no review rows
 * yet at all. `useTasks('history')` supplies the customer join.
 */

const labels = reviews.analytics;

const RANK_LABEL: Record<1 | 2 | 3, string> = {
  1: labels.rank['1'],
  2: labels.rank['2'],
  3: labels.rank['3'],
};

/**
 * The verdict pair borrows the STATUS palette rather than inventing colours.
 *
 * "Approved" and "Changes Requested" are already coloured everywhere else in the
 * product — on badges, on the developer's status donut, on the admin's. A
 * reviewer's decision mix showing the same two outcomes in different colours
 * would be the drift the shared palette exists to stop.
 */
const DECISION_COLOR = {
  Approved: STATUS_COLORS.Approved,
  ChangesRequested: STATUS_COLORS.ChangesRequested,
} as const;

/**
 * Turnaround bands get the neutral magnitude colour, not a status colour.
 *
 * There is no verdict to colour by here — the bands run fast to slow, and
 * borrowing the status palette would claim "under 4 hours" is Approved and
 * "over 5 days" is Cancelled. Neither is a judgement this chart is entitled to
 * make, especially with no agreed SLA behind it.
 */
const TURNAROUND_COLOR = CHART_ACCENT_COLOR;

const FIGURE_LABEL = 'truncate text-[0.6875rem] font-semibold tracking-wide text-ink-500 uppercase';
const FIGURE_VALUE = 'mt-1 font-display text-lg font-bold tabular-nums text-ink-900';

/** One place decides how a missing figure reads, so six cards cannot disagree. */
function orNotAvailable(value: number | null, format: (value: number) => string): string {
  return value === null ? labels.notAvailable : format(value);
}

const asPercent = (value: number) => `${value.toFixed(1)}%`;
const asRank = (value: number) => value.toFixed(2);

type TimeRangeKey = 'all' | '30d' | '90d' | 'quarter';

function filterReviewsByTimeRange(reviews: readonly Review[], range: TimeRangeKey): Review[] {
  if (range === 'all') return reviews.slice();

  let cutoffTime = 0;
  const now = new Date();

  if (range === '30d') {
    cutoffTime = Date.now() - 30 * 24 * 60 * 60 * 1000;
  } else if (range === '90d') {
    cutoffTime = Date.now() - 90 * 24 * 60 * 60 * 1000;
  } else if (range === 'quarter') {
    const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
    cutoffTime = new Date(now.getFullYear(), quarterStartMonth, 1).getTime();
  }

  return reviews.filter((r) => {
    const timestamp = r.decidedAt ?? r.createdAt;
    if (!timestamp) return false;
    return new Date(timestamp).getTime() >= cutoffTime;
  });
}

export function ReviewerAnalyticsPage() {
  const given = useReviewsGiven();
  const assigned = useTasks('assigned');
  const history = useTasks('history');

  const [timeRange, setTimeRange] = useState<TimeRangeKey>('all');

  const timeRangeOptions = useMemo<SelectOption[]>(
    () => [
      { value: 'all', label: labels.timeRanges?.all ?? 'All Time' },
      { value: '30d', label: labels.timeRanges?.['30d'] ?? 'Last 30 Days' },
      { value: '90d', label: labels.timeRanges?.['90d'] ?? 'Last 90 Days' },
      { value: 'quarter', label: labels.timeRanges?.quarter ?? 'This Quarter' },
    ],
    [],
  );

  const filteredGiven = useMemo(
    () => filterReviewsByTimeRange(given.data ?? [], timeRange),
    [given.data, timeRange],
  );

  const summary = useMemo(
    () => reviewerSummary(filteredGiven, assigned.data?.length ?? 0),
    [filteredGiven, assigned.data],
  );
  const weeks = useMemo(() => reviewActivityByWeek(filteredGiven), [filteredGiven]);
  const buckets = useMemo(() => turnaroundBuckets(filteredGiven), [filteredGiven]);
  const decisions = useMemo(() => decisionMix(filteredGiven), [filteredGiven]);
  const ranks = useMemo(() => rankGivenDistribution(filteredGiven), [filteredGiven]);

  /*
    The customer join needs BOTH task lists, but for a narrower reason than it
    used to.

    `scope=history` now matches on the REVIEW's `reviewerId`, so it returns every
    task this reviewer decided on — including the ones sent back for changes,
    which previously vanished because the decision clears `task.reviewerId`. That
    was the real gap, and it is closed server-side.

    `assigned` is still added because history deliberately excludes tasks that
    have come back round to this reviewer and are `InReview` again: those live in
    the assigned queue, and their EARLIER cycles are decided reviews that still
    need a customer. Anything left unmatched is dropped by `reviewsByCustomer`
    rather than bucketed as "Unknown".
  */
  const joinable = useMemo(
    () => [...(history.data ?? []), ...(assigned.data ?? [])],
    [history.data, assigned.data],
  );
  const byCustomer = useMemo(
    () => reviewsByCustomer(filteredGiven, joinable),
    [filteredGiven, joinable],
  );

  /*
   * The title renders BEFORE the data, and that is a fix rather than a tidy-up.
   *
   * This page gated its entire output — heading included — on three queries, on
   * top of a lazily imported Recharts chunk. So the slowest route in the product
   * showed nothing at all, not even its own name, until every one of them
   * settled; and its screen test, which waits for that heading, was measuring
   * the queries rather than the render. Under a loaded suite that intermittently
   * exceeded the shared query budget, which is what the bespoke timeout in
   * `reviewerAnalytics.test.tsx` was compensating for.
   *
   * With the heading hoisted, first paint is independent of the fetches: the
   * user sees where they are immediately, and the test's wait is a wait for the
   * route, as it always claimed to be.
   */
  const header = (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="font-display text-lg font-bold text-ink-900">{labels.title}</h2>
        <p className="mt-0.5 text-sm text-ink-500">{labels.subtitle}</p>
      </div>
      <div className="w-full sm:w-56">
        <Select
          value={timeRange}
          onValueChange={(val) => setTimeRange(val as TimeRangeKey)}
          options={timeRangeOptions}
          icon={<Calendar className="size-4" />}
          label={labels.timeRange ?? 'Time Range'}
          aria-label={labels.timeRange ?? 'Time Range'}
        />
      </div>
    </div>
  );

  if (given.isPending || assigned.isPending || history.isPending) {
    return (
      <div className="space-y-6">
        {header}
        <LoadingState />
      </div>
    );
  }
  if (given.error) {
    return (
      <div className="space-y-6">
        {header}
        <ErrorState
          onRetry={() => {
            void given.refetch();
          }}
        />
      </div>
    );
  }

  const decisionSlices: DonutSlice[] = decisions.map((entry) => ({
    id: entry.decision,
    label: common.status[entry.decision],
    value: entry.count,
    color: DECISION_COLOR[entry.decision],
  }));

  const rankSlices: DonutSlice[] = ranks.map((entry) => ({
    id: String(entry.rank),
    label: RANK_LABEL[entry.rank],
    value: entry.count,
    color: RANK_COLORS[String(entry.rank)] ?? CHART_FALLBACK_COLOR,
  }));

  const weekLabel = (iso: string) => interpolate(labels.weekOf, { date: formatDate(iso) });

  return (
    <div className="space-y-6">
      {header}

      {/*
        Six cards, three across — the same block the developer's tab uses, so the
        two workspaces do not disagree about what a dashboard looks like.

        Neither Turnaround nor Avg Rank Given carries a target, and that is a
        judgement rather than an omission. There is no signed-off turnaround SLA,
        and inventing one would put an authoritative-looking "Below target" under
        a number nobody agreed. Grading severity has no good value at all — a
        reviewer on a fragile subsystem SHOULD send more back — so it gets a
        descriptive caption instead.
      */}
      <Reveal className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          label={labels.completed}
          value={summary.completed}
          caption={labels.completedCaption}
          icon={<ClipboardCheck className="size-4" />}
        />
        <KpiCard
          label={labels.inQueue}
          value={summary.inQueue}
          caption={labels.inQueueCaption}
          tone="violet"
          icon={<Inbox className="size-4" />}
        />
        <KpiCard
          label={labels.turnaround}
          value={orNotAvailable(summary.avgTurnaroundHours, formatDurationHours)}
          caption={labels.turnaroundCaption}
          tone="blue"
          icon={<Timer className="size-4" />}
        />
        <KpiCard
          label={labels.approvalRate}
          value={orNotAvailable(summary.approvalRate, asPercent)}
          caption={labels.approvalRateCaption}
          tone="green"
          icon={<CheckCircle2 className="size-4" />}
        />
        <KpiCard
          label={labels.changesRequested}
          value={summary.changesRequested}
          caption={labels.changesRequestedCaption}
          tone="amber"
          icon={<AlertTriangle className="size-4" />}
        />
        <KpiCard
          label={labels.avgRankGiven}
          value={orNotAvailable(summary.avgRankGiven, asRank)}
          caption={labels.tendency[summary.tendency]}
          tone="neutral"
          icon={<Gauge className="size-4" />}
        />
      </Reveal>

      {/*
        Full width, and the only chart on either dashboard with a time axis.

        "How much did I review, and when" is the reviewer's question that a donut
        structurally cannot answer — a mix has no direction. It gets the whole row
        because a twelve-week series squeezed into a third of one is a sparkline,
        and a sparkline cannot be read against its own axis.
      */}
      <Reveal>
        <Card className="overflow-hidden">
          <CardHeader title={labels.activityTitle} description={labels.activitySubtitle} />
          <CardBody className="pt-5">
            <TrendAreaChart
              data={weeks.map((week) => ({
                x: week.weekStart,
                approved: week.approved,
                changesRequested: week.changesRequested,
              }))}
              series={[
                {
                  id: 'approved',
                  label: common.status.Approved,
                  color: DECISION_COLOR.Approved,
                },
                {
                  id: 'changesRequested',
                  label: common.status.ChangesRequested,
                  color: DECISION_COLOR.ChangesRequested,
                },
              ]}
              emptyLabel={labels.activityEmpty}
              formatX={(iso) => formatDate(iso)}
              formatXLong={weekLabel}
              formatTotal={(total) => interpolate(labels.activityTotal, { count: total })}
              tableCaption={labels.activityTable}
            />
          </CardBody>
        </Card>
      </Reveal>

      <Reveal className="grid gap-4 lg:grid-cols-3">
        <Card className="flex h-full flex-col">
          <CardHeader title={labels.decisionTitle} description={labels.decisionSubtitle} />
          <CardBody className="flex flex-1 items-center justify-center pt-5">
            <DonutChart
              slices={decisionSlices}
              emptyLabel={labels.decisionEmpty}
              valueLabel={common.chart.reviews}
              centerLabel={String(summary.completed)}
              centerCaption={common.chart.reviews}
            />
          </CardBody>
        </Card>

        <Card className="flex h-full flex-col">
          <CardHeader title={labels.rankTitle} description={labels.rankSubtitle} />
          <CardBody className="flex flex-1 items-center justify-center pt-5">
            <DonutChart
              slices={rankSlices}
              emptyLabel={labels.rankEmpty}
              valueLabel={common.chart.reviews}
              centerLabel={String(ranks.reduce((sum, r) => sum + r.count, 0))}
              centerCaption={common.chart.reviews}
            />
          </CardBody>
        </Card>

        {/*
          A bar chart, not a third donut. These bands have an ORDER — fast to
          slow — and where the mass sits along it is the reading. A donut would
          throw that ordering away and answer a question nobody asked.
        */}
        <Card className="flex h-full flex-col">
          <CardHeader title={labels.turnaroundTitle} description={labels.turnaroundSubtitle} />
          <CardBody className="flex flex-1 items-center pt-5">
            <CategoryBarChart
              data={buckets.map((bucket) => ({
                id: bucket.id,
                label: labels.buckets[bucket.id],
                value: bucket.count,
              }))}
              color={TURNAROUND_COLOR}
              emptyLabel={labels.turnaroundEmpty}
              tooltipLabel={common.chart.reviews}
              tableCaption={labels.turnaroundTable}
            />
          </CardBody>
        </Card>
      </Reveal>

      <Card>
        <CardHeader
          title={labels.customersTitle}
          description={labels.customersSubtitle}
          icon={<Building2 className="size-4" />}
        />
        <CardBody className="pt-4">
          {byCustomer.length === 0 ? (
            <EmptyState title={labels.customersEmpty} />
          ) : (
            <ul className="space-y-3">
              {byCustomer.map((customer) => (
                /* Same treatment as the developer's per-customer panel — the
                   customer's own colour as a left accent, which is the sanctioned
                   use of a raw database colour (see `CustomerChip`). */
                <li
                  key={customer.customerId}
                  className="rounded-card border border-l-4 border-line bg-canvas/60 p-4 transition-colors duration-200 hover:border-line-strong hover:bg-canvas"
                  style={{ borderLeftColor: customer.color }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CustomerChip name={customer.name} color={customer.color} variant="inline" />
                    <p className="text-xs text-ink-500">
                      {interpolate(labels.customerReviews, { count: customer.reviewCount })}
                    </p>
                  </div>

                  <dl className="mt-4 grid items-end gap-4 sm:grid-cols-3">
                    <div className="min-w-0">
                      <dt className={FIGURE_LABEL}>{labels.customerApprovalRate}</dt>
                      <dd className="mt-2">
                        <MetricBar
                          value={customer.approvalRate ?? 0}
                          label={`${labels.customerApprovalRate} — ${customer.name}`}
                          valueLabel={orNotAvailable(
                            customer.approvalRate,
                            (value) => `${String(Math.round(value))}%`,
                          )}
                        />
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className={FIGURE_LABEL}>{labels.customerAvgRank}</dt>
                      <dd className={FIGURE_VALUE}>
                        {orNotAvailable(customer.avgRankGiven, asRank)}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className={FIGURE_LABEL}>{labels.customerTurnaround}</dt>
                      <dd className={FIGURE_VALUE}>
                        {orNotAvailable(customer.avgTurnaroundHours, formatDurationHours)}
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
