import { useState } from 'react';
import type { Review, TaskListItem, User } from '@sdp/contracts';
import { Tag } from '@/portals/code-review/components/badges.tsx';
import { DonutChart } from '@/components/common/charts/DonutChart.tsx';
import { MetricBar } from '@/components/common/charts/MetricBar.tsx';
import { Avatar } from '@/components/common/Avatar.tsx';
import { EmptyState } from '@/components/common/states.tsx';
import { SearchField } from '@/components/ui/controls.tsx';
import { interpolate } from '@/lib/formatters.ts';
import admin from '@/content/admin.json';
import common from '@/content/common.json';
import {
  developerPerformance,
  reviewerActivity,
} from '../domain/reportMetrics.ts';
import { cycleSlices, rankSlices } from './reportPalette.ts';

/**
 * The performance sub-tabs beneath the KPI cards (screens 04, 05).
 *
 * Both are lists of developers or reviewers with a few metrics each, so they
 * share the card shell and the search box; only the metrics differ. Every number
 * comes from `domain/reportMetrics.ts` — nothing is computed in this file, which
 * is what keeps the figures unit-tested.
 */

const labels = admin.reports;

const RANK_LABELS = {
  1: labels.rank['1'],
  2: labels.rank['2'],
  3: labels.rank['3'],
} as const;

function Panel({
  title,
  subtitle,
  searchLabel,
  searchPlaceholder,
  search,
  onSearch,
  count,
  children,
}: {
  title: string;
  subtitle: string;
  searchLabel: string;
  searchPlaceholder: string;
  search: string;
  onSearch: (value: string) => void;
  count: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-card border border-line bg-surface p-6 shadow-card">
      <p className="font-display text-lg font-bold text-ink-900">{title}</p>
      <p className="mt-0.5 text-sm text-ink-500">{subtitle}</p>

      <div className="mt-4 max-w-sm">
        <SearchField
          value={search}
          onValueChange={onSearch}
          label={searchLabel}
          placeholder={searchPlaceholder}
        />
      </div>

      <p className="mt-3 text-sm text-ink-500">{count}</p>
      <div className="mt-4 space-y-3">{children}</div>
    </div>
  );
}

function RowShell({
  name,
  caption,
  badge,
  children,
}: {
  name: string;
  caption: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-card border border-line p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Avatar name={name} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-ink-900">{name}</p>
          <p className="text-xs text-ink-500">{caption}</p>
        </div>
        {badge}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold tracking-wide text-ink-500 uppercase">{label}</p>
      <div className="mt-1 text-sm font-semibold text-ink-900">{value}</div>
    </div>
  );
}

const STANDING_TONES = {
  good: 'bg-status-approved-surface text-status-approved',
  fair: 'bg-status-draft-surface text-status-draft',
  poor: 'bg-status-cancelled-surface text-status-cancelled',
  none: 'bg-canvas text-ink-500',
} as const;

export function DeveloperPanel({
  tasks,
  reviews,
  users,
}: {
  tasks: readonly TaskListItem[];
  reviews: readonly Review[];
  users: readonly User[];
}) {
  const [search, setSearch] = useState('');
  const rows = developerPerformance(tasks, reviews, users, {
    rank: RANK_LABELS,
    cycle: labels.cycle,
  });
  const needle = search.trim().toLowerCase();
  const visible = rows.filter((row) => row.name.toLowerCase().includes(needle));

  return (
    <Panel
      title={labels.developers.title}
      subtitle={labels.developers.subtitle}
      searchLabel={labels.developers.searchLabel}
      searchPlaceholder={labels.developers.searchPlaceholder}
      search={search}
      onSearch={setSearch}
      count={interpolate(labels.developers.count, {
        shown: visible.length,
        total: rows.length,
      })}
    >
      {visible.length === 0 ? (
        <EmptyState title={labels.developers.empty} />
      ) : (
        visible.map((row) => (
          <RowShell
            key={row.userId}
            name={row.name}
            caption={interpolate(labels.developers.tasks, {
              count: row.taskCount,
              approved: row.approvedCount,
            })}
            badge={
              <Tag className={STANDING_TONES[row.standing]}>
                {labels.developers.standing[row.standing]}
              </Tag>
            }
          >
            {row.standing === 'none' ? (
              <p className="text-sm text-ink-500">{labels.developers.noReviews}</p>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Metric
                    label={labels.developers.approvalRate}
                    value={
                      <MetricBar
                        value={row.approvalRate}
                        label={`${labels.developers.approvalRate} — ${row.name}`}
                        valueLabel={`${String(row.approvalRate)}%`}
                      />
                    }
                  />
                  <Metric
                    label={labels.developers.avgRanking}
                    value={row.avgRank === null ? '—' : row.avgRank.toFixed(2)}
                  />
                  <Metric
                    label={labels.developers.avgCycles}
                    value={row.avgCycles === null ? '—' : row.avgCycles.toFixed(2)}
                  />
                  <Metric
                    label={labels.developers.changesRequested}
                    value={row.changesRequestedCount}
                  />
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-card bg-canvas p-4">
                    <p className="mb-2 text-sm font-semibold text-ink-900">
                      {labels.developers.rankTitle ?? labels.charts.rankTitle}
                    </p>
                    <DonutChart
                      slices={rankSlices(row.rankSlices)}
                      emptyLabel={labels.charts.empty}
                      valueLabel={common.chart.reviews}
                      size={96}
                    />
                  </div>
                  <div className="rounded-card bg-canvas p-4">
                    <p className="mb-2 text-sm font-semibold text-ink-900">
                      {labels.developers.cycleTitle ?? labels.charts.cycleTitle}
                    </p>
                    <DonutChart
                      slices={cycleSlices(row.cycleSlices)}
                      emptyLabel={labels.charts.empty}
                      valueLabel={common.chart.tasks}
                      size={96}
                    />
                  </div>
                </div>
              </>
            )}
          </RowShell>
        ))
      )}
    </Panel>
  );
}

const TENDENCY_TONES = {
  strict: 'bg-status-cancelled-surface text-status-cancelled',
  balanced: 'bg-status-draft-surface text-status-draft',
  lenient: 'bg-status-approved-surface text-status-approved',
  none: 'bg-canvas text-ink-500',
} as const;

export function ReviewerPanel({
  reviews,
  users,
}: {
  reviews: readonly Review[];
  users: readonly User[];
}) {
  const [search, setSearch] = useState('');
  const rows = reviewerActivity(reviews, users);
  const needle = search.trim().toLowerCase();
  const visible = rows.filter((row) => row.name.toLowerCase().includes(needle));

  return (
    <Panel
      title={labels.reviewers.title}
      subtitle={labels.reviewers.subtitle}
      searchLabel={labels.reviewers.searchLabel}
      searchPlaceholder={labels.reviewers.searchPlaceholder}
      search={search}
      onSearch={setSearch}
      count={interpolate(labels.reviewers.count, {
        shown: visible.length,
        total: rows.length,
      })}
    >
      {visible.length === 0 ? (
        <EmptyState title={labels.reviewers.empty} />
      ) : (
        visible.map((row) => (
          <RowShell
            key={row.userId}
            name={row.name}
            caption={interpolate(labels.reviewers.reviews, {
              count: row.reviewCount,
            })}
            badge={
              <Tag className={TENDENCY_TONES[row.tendency]}>
                {labels.reviewers.tendency[row.tendency]}
              </Tag>
            }
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <Metric
                label={labels.reviewers.approvalRate}
                value={
                  <MetricBar
                    value={row.approvalRate}
                    label={`${labels.reviewers.approvalRate} — ${row.name}`}
                    valueLabel={`${String(row.approvalRate)}%`}
                    tone="success"
                  />
                }
              />
              <Metric
                label={labels.reviewers.changesRate}
                value={
                  <MetricBar
                    value={row.changesRate}
                    label={`${labels.reviewers.changesRate} — ${row.name}`}
                    valueLabel={`${String(row.changesRate)}%`}
                    tone="warning"
                  />
                }
              />
              <Metric
                label={labels.reviewers.avgRankGiven}
                value={row.avgRankGiven === null ? '—' : row.avgRankGiven.toFixed(2)}
              />
            </div>
          </RowShell>
        ))
      )}
    </Panel>
  );
}
