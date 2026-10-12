import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Award,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Code2,
  Filter,
  Gauge,
  Repeat,
  RotateCcw,
  Users as UsersIcon,
  XCircle,
} from 'lucide-react';
import { type TaskStatus } from '@sdp/contracts';
import { DonutChart } from '@/components/common/charts/DonutChart.tsx';
import { KpiCard } from '@/components/common/KpiCard.tsx';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/states.tsx';
import { Button } from '@/components/ui/Button.tsx';
import { Card, CardBody, CardHeader } from '@/components/ui/Card.tsx';
import { Select, type SelectOption } from '@/components/ui/Select.tsx';
import { Tabs } from '@/components/ui/Tabs.tsx';
import { interpolate } from '@/lib/formatters.ts';
import { useTasks } from '@/portals/code-review/hooks/useTasks.ts';
import { useCustomers } from '@/portals/code-review/hooks/useReferenceData.ts';
import admin from '@/content/admin.json';
import common from '@/content/common.json';
import { useUsers } from '@/portals/code-review/hooks/useUsers.ts';
import { useAllReviews } from '../api/queries.ts';
import {
  applyReportFilters,
  cycleDistribution,
  rankDistribution,
  summarise,
  taskStatusDistribution,
  ALL_REPORT_VALUES,
  EMPTY_REPORT_FILTERS,
  type ReportFilters,
} from '../domain/reportMetrics.ts';
import { DeveloperPanel, ReviewerPanel } from '../components/ReportBreakdowns.tsx';
import { cycleSlices, rankSlices, statusSlices } from '../components/reportPalette.ts';

/**
 * Admin — Reports & Analytics (screens 04, 05).
 *
 * Three donuts, eight KPI cards, two performance sub-tabs. Every figure comes from
 * `domain/reportMetrics.ts`; this file only chooses what to render and in which
 * colour, so the arithmetic stays unit-tested against the business's own
 * numbers rather than being asserted through the DOM.
 *
 * The filters apply to the TASK set, and the review set is narrowed to those
 * tasks — filtering reviews independently would let a chart count a review whose
 * task the filter had excluded.
 */

const labels = admin.reports;

const RANK_LABELS = {
  1: labels.rank['1'],
  2: labels.rank['2'],
  3: labels.rank['3'],
} as const;

const STATUS_LABELS = common.status as Readonly<Record<TaskStatus, string>>;

const DATE_OPTIONS: SelectOption[] = [
  { value: ALL_REPORT_VALUES, label: labels.filters.dateAll },
  { value: '30', label: labels.filters.date30 },
  { value: '90', label: labels.filters.date90 },
  { value: '365', label: labels.filters.date365 },
];

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export function AdminReportsPage() {
  const { data: tasks, isPending: tasksPending, error: tasksError, refetch } = useTasks('all');
  const { data: reviews, isPending: reviewsPending } = useAllReviews();
  const { data: users } = useUsers();
  const { data: customers } = useCustomers();

  const [dateRange, setDateRange] = useState(ALL_REPORT_VALUES);
  const [filters, setFilters] = useState<ReportFilters>(EMPTY_REPORT_FILTERS);
  const [view, setView] = useState('developers');

  const isFiltered = dateRange !== ALL_REPORT_VALUES || filters.customerId !== ALL_REPORT_VALUES;

  const handleResetFilters = () => {
    setDateRange(ALL_REPORT_VALUES);
    setFilters(EMPTY_REPORT_FILTERS);
  };

  const visibleTasks = useMemo(() => applyReportFilters(tasks ?? [], filters), [tasks, filters]);

  /**
   * Reviews are narrowed to the visible tasks rather than filtered in their own
   * right: "reviews for AASL in the last 30 days" has to mean the same set of
   * tasks the cards above are counting, or the donuts disagree with the KPIs.
   */
  const visibleReviews = useMemo(() => {
    const ids = new Set(visibleTasks.map((task) => task.id));
    return (reviews ?? []).filter((review) => ids.has(review.taskId));
  }, [reviews, visibleTasks]);

  const summary = useMemo(
    () => summarise(visibleTasks, visibleReviews, users ?? []),
    [visibleTasks, visibleReviews, users],
  );

  const customerOptions = useMemo<SelectOption[]>(
    () => [
      { value: ALL_REPORT_VALUES, label: labels.filters.customerAll },
      ...(customers ?? []).map((customer) => ({
        value: customer.id,
        label: customer.name,
      })),
    ],
    [customers],
  );

  if (tasksPending || reviewsPending) return <LoadingState />;
  if (tasksError !== null) {
    return (
      <ErrorState
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  return (
    <section aria-labelledby="admin-reports-heading" className="space-y-4">
      <div>
        <h2 id="admin-reports-heading" className="font-display text-lg font-bold text-ink-900">
          {labels.title}
        </h2>
        <p className="mt-0.5 text-sm text-ink-500">{labels.subtitle}</p>
      </div>

      <Card>
        <CardBody className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4">
          <p className="flex h-10 shrink-0 items-center gap-2 text-sm font-semibold text-ink-900">
            <Filter className="size-4 text-ink-400" aria-hidden="true" />
            {labels.filters.heading}
          </p>

          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
            <div className="w-full min-w-0 sm:w-52">
              <Select
                value={dateRange}
                onValueChange={(value) => {
                  setDateRange(value);
                  setFilters((current) => ({
                    ...current,
                    from: value === ALL_REPORT_VALUES ? '' : daysAgo(Number(value)),
                  }));
                }}
                options={DATE_OPTIONS}
                icon={<CalendarDays className="size-4" />}
                aria-label={labels.filters.date}
              />
            </div>
            <div className="w-full min-w-0 sm:w-52">
              <Select
                value={filters.customerId}
                onValueChange={(customerId) => {
                  setFilters((current) => ({ ...current, customerId }));
                }}
                options={customerOptions}
                icon={<Building2 className="size-4" />}
                aria-label={labels.filters.customer}
              />
            </div>
            {isFiltered ? (
              <Button size="sm" variant="ghost" onClick={handleResetFilters} className="text-ink-600 hover:text-ink-900">
                <RotateCcw className="size-3.5" aria-hidden="true" />
                {labels.filters.reset ?? 'Reset Filters'}
              </Button>
            ) : null}
          </div>
        </CardBody>
      </Card>

      {visibleTasks.length === 0 ? (
        <Card>
          <CardBody className="flex min-h-[320px] flex-col items-center justify-center p-12 text-center">
            <EmptyState
              title={labels.emptyFiltered ?? 'No report data found for the selected filters.'}
              hint={labels.emptyFilteredHint ?? 'Try adjusting your date range or customer selection to view reports.'}
              action={
                <Button variant="secondary" onClick={handleResetFilters}>
                  <RotateCcw className="size-4" aria-hidden="true" />
                  {labels.filters.reset ?? 'Reset Filters'}
                </Button>
              }
            />
          </CardBody>
        </Card>
      ) : (
        <>
          {/*
            Distribution Charts order:
            1. Quality Ranking Distribution
            2. Cycle Distribution
            3. Task Status Distribution
          */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader title={labels.charts.rankTitle} description={labels.charts.rankSubtitle} />
              <CardBody className="flex items-center justify-center pt-4">
                <DonutChart
                  slices={rankSlices(rankDistribution(visibleReviews, RANK_LABELS))}
                  emptyLabel={labels.charts.empty}
                  valueLabel={common.chart.reviews}
                />
              </CardBody>
            </Card>

            <Card>
              <CardHeader title={labels.charts.cycleTitle} description={labels.charts.cycleSubtitle} />
              <CardBody className="flex items-center justify-center pt-4">
                <DonutChart
                  slices={cycleSlices(cycleDistribution(visibleTasks, labels.cycle))}
                  emptyLabel={labels.charts.empty}
                  valueLabel={common.chart.tasks}
                />
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title={labels.charts.statusTitle}
                description={labels.charts.statusSubtitle}
              />
              <CardBody className="flex items-center justify-center pt-4">
                <DonutChart
                  slices={statusSlices(taskStatusDistribution(visibleTasks, STATUS_LABELS))}
                  emptyLabel={labels.charts.empty}
                  valueLabel={common.chart.tasks}
                />
              </CardBody>
            </Card>
          </div>

          {/*
            Four status count cards: Total, Approved, Changes Requested, Cancelled.
          */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label={labels.kpis.total}
              value={summary.total}
              caption={labels.kpis.totalCaption}
              icon={<ClipboardList className="size-4" />}
              tone="violet"
            />
            <KpiCard
              label={labels.kpis.approved}
              value={summary.approved}
              caption={interpolate(labels.kpis.approvedCaption, {
                rate: summary.approvalRate,
              })}
              icon={<CheckCircle2 className="size-4" />}
              tone="green"
            />
            <KpiCard
              label={labels.kpis.changesRequested}
              value={summary.changesRequested}
              caption={labels.kpis.changesRequestedCaption}
              icon={<AlertTriangle className="size-4" />}
              tone="amber"
            />
            <KpiCard
              label={labels.kpis.cancelled}
              value={summary.cancelled}
              caption={labels.kpis.cancelledCaption}
              icon={<XCircle className="size-4" />}
              tone="red"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label={labels.kpis.approvalRate}
              value={`${String(summary.approvalRate)}%`}
              caption={labels.kpis.approvalRateCaption}
              icon={<Gauge className="size-4" />}
              tone="blue"
              target={{
                met: summary.isApprovalOnTarget,
                note: common.kpi.targetNote,
              }}
            />
            <KpiCard
              label={labels.kpis.avgCycles}
              value={summary.avgCountedCycles.toFixed(2)}
              caption={labels.kpis.avgCyclesCaption}
              icon={<Repeat className="size-4" />}
              tone="violet"
              target={{ met: !summary.isCycleCountHigh }}
            />
            <KpiCard
              label={labels.kpis.avgRank}
              value={summary.avgQualityRank.toFixed(2)}
              caption={labels.kpis.avgRankCaption}
              icon={<Award className="size-4" />}
              tone="green"
              target={{ met: summary.isQualityGood }}
            />

            <div className="rounded-card border border-line bg-surface p-5 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-semibold tracking-wide text-ink-500 uppercase">
                  {labels.kpis.team}
                </p>
                <span
                  className="grid size-9 shrink-0 place-items-center rounded-full bg-canvas text-ink-500"
                  aria-hidden="true"
                >
                  <UsersIcon className="size-4" />
                </span>
              </div>

              <dl className="mt-3 space-y-1.5 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-ink-700">{labels.kpis.developers}</dt>
                  <dd className="font-semibold text-ink-900">{summary.team.developers}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-ink-700">{labels.kpis.reviewers}</dt>
                  <dd className="font-semibold text-ink-900">{summary.team.reviewers}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-ink-700">{labels.kpis.admins}</dt>
                  <dd className="font-semibold text-ink-900">{summary.team.admins}</dd>
                </div>
              </dl>
              <p className="mt-2 text-sm text-ink-500">{labels.kpis.teamCaption}</p>
            </div>
          </div>

          <Tabs
            label={labels.title}
            value={view}
            onValueChange={setView}
            tabs={[
              {
                value: 'developers',
                label: labels.tabs.developers,
                icon: <Code2 className="size-4" />,
                content: (
                  <DeveloperPanel tasks={visibleTasks} reviews={visibleReviews} users={users ?? []} />
                ),
              },
              {
                value: 'reviewers',
                label: labels.tabs.reviewers,
                icon: <UsersIcon className="size-4" />,
                content: <ReviewerPanel reviews={visibleReviews} users={users ?? []} />,
              },
            ]}
          />
        </>
      )}
    </section>
  );
}
