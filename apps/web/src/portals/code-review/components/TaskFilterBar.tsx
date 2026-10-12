import { useMemo, type ReactNode } from 'react';
import { AlertCircle, Building2, Filter, RefreshCw, RotateCcw } from 'lucide-react';
import { PRIORITIES, TASK_STATUSES } from '@sdp/contracts';
import { cn } from '@/components/ui';
import { SearchField } from '@/components/ui/controls.tsx';
import { Select, type SelectOption } from '@/components/ui/Select.tsx';
import { interpolate } from '@/lib/formatters.ts';
import common from '@/content/common.json';
import tasks from '@/content/tasks.json';
import { ALL, EMPTY_TASK_FILTERS, type TaskFilters } from './taskFilters.ts';

/**
 * The filter row above every task grid (screen 16).
 *
 * State lives with the caller, not here: the same filters drive the grid, the
 * count line and — in Phase 2 — a server-side query, so a component that owned
 * them privately would have to expose them again anyway. This is presentation
 * over a value.
 */

const labels = tasks.list.filters;

const STATUS_OPTIONS: SelectOption[] = [
  { value: ALL, label: labels.statusAll },
  ...TASK_STATUSES.map((status) => ({ value: status, label: common.status[status] })),
];

const PRIORITY_OPTIONS: SelectOption[] = [
  { value: ALL, label: labels.priorityAll },
  ...PRIORITIES.map((priority) => ({ value: priority, label: common.priority[priority] })),
];

export interface TaskFilterBarProps {
  filters: TaskFilters;
  onChange: (filters: TaskFilters) => void;
  onReset?: (() => void) | undefined;
  hasAdditionalFilters?: boolean | undefined;
  showCycle?: boolean | undefined;
  customerOptions?: SelectOption[] | undefined;
  statusOptions?: SelectOption[] | null | undefined;
  statusLabel?: string | undefined;
  statusIcon?: ReactNode | undefined;
}

export function FilterResetButton({
  isFiltered,
  onReset,
  label = tasks.list.filters.reset ?? 'Reset Filters',
  className,
}: {
  isFiltered: boolean;
  onReset: () => void;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onReset}
      className={cn(
        'inline-flex h-14 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl border border-line bg-surface px-5 text-sm font-medium transition-all',
        'hover:border-line-strong hover:bg-canvas hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600',
        isFiltered ? 'border-line-strong text-ink-900 shadow-xs' : 'text-ink-700',
        className,
      )}
      aria-label={label}
    >
      <RotateCcw className="size-4 text-ink-500" aria-hidden="true" />
      <span className="font-medium whitespace-nowrap">{label}</span>
    </button>
  );
}

export function TaskFilterBar({
  filters,
  onChange,
  onReset,
  hasAdditionalFilters = false,
  showCycle = true,
  customerOptions,
  statusOptions,
  statusLabel,
  statusIcon,
}: TaskFilterBarProps) {
  const cycleOptions = useMemo<SelectOption[]>(
    () => [
      { value: ALL, label: labels.cycleAll },
      { value: '1', label: interpolate(labels.cycleValue, { n: 1 }) },
      { value: '2', label: interpolate(labels.cycleValue, { n: 2 }) },
      { value: '3+', label: interpolate(labels.cyclePlus, { n: 3 }) },
    ],
    [],
  );

  const hasCustomer = Boolean(customerOptions && customerOptions.length > 0);
  const showStatus = statusOptions !== null;

  const isFiltered =
    filters.search !== '' ||
    filters.status !== ALL ||
    filters.priority !== ALL ||
    (filters.customerId !== undefined && filters.customerId !== ALL) ||
    filters.cycle !== ALL ||
    hasAdditionalFilters;

  const controlCount =
    (showStatus ? 1 : 0) +
    1 + // priority
    (hasCustomer ? 1 : 0) +
    (showCycle ? 1 : 0) +
    1; // reset button

  const gridClass =
    controlCount <= 3
      ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
      : controlCount === 4
        ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
        : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5';

  return (
    <div className="flex w-full flex-col gap-3">
      {/* Row 1: Full-width modern search input */}
      <div className="w-full">
        <SearchField
          value={filters.search}
          onValueChange={(search) => {
            onChange({ ...filters, search });
          }}
          label={tasks.list.searchLabel}
          placeholder={tasks.list.searchPlaceholder}
        />
      </div>

      {/* Row 2: Filter dropdown cards and Reset action */}
      <div className={cn('grid w-full gap-3', gridClass)}>
        {showStatus ? (
          <Select
            value={filters.status}
            onValueChange={(status) => {
              onChange({ ...filters, status });
            }}
            options={statusOptions ?? STATUS_OPTIONS}
            label={statusLabel ?? labels.status}
            icon={statusIcon ?? <Filter className="size-4" />}
            variant="stacked"
            aria-label={statusLabel ?? labels.status}
          />
        ) : null}

        <Select
          value={filters.priority}
          onValueChange={(priority) => {
            onChange({ ...filters, priority });
          }}
          options={PRIORITY_OPTIONS}
          label={labels.priority}
          icon={<AlertCircle className="size-4" />}
          variant="stacked"
          aria-label={labels.priority}
        />

        {hasCustomer ? (
          <Select
            value={filters.customerId ?? ALL}
            onValueChange={(customerId) => {
              onChange({ ...filters, customerId });
            }}
            options={customerOptions!}
            label="Customer"
            icon={<Building2 className="size-4" />}
            variant="stacked"
            aria-label="Customer"
          />
        ) : null}

        {showCycle ? (
          <Select
            value={filters.cycle}
            onValueChange={(cycle) => {
              onChange({ ...filters, cycle });
            }}
            options={cycleOptions}
            label={labels.cycle}
            icon={<RefreshCw className="size-4" />}
            variant="stacked"
            aria-label={labels.cycle}
          />
        ) : null}

        <FilterResetButton
          isFiltered={isFiltered}
          onReset={() => {
            if (onReset) {
              onReset();
            } else {
              onChange(EMPTY_TASK_FILTERS);
            }
          }}
        />
      </div>
    </div>
  );
}
