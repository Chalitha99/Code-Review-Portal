import { useMemo, useState } from 'react';
import {
  Building2,
  CalendarDays,
  Eye,
  Filter,
  Inbox,
  Undo2,
  UserRound,
  UserPlus,
} from 'lucide-react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { HANDOVER_STATUSES, type Handover } from '@sdp/contracts';
import type { SortingState } from '@tanstack/react-table';
import { Tag } from '@/portals/code-review/components/badges.tsx';
import { DateCell, MonoId, OptionalCell } from '@/portals/code-review/components/cells.tsx';
import { ConfirmDialog } from '@/components/common/ConfirmDialog.tsx';
import { DataTable } from '@/components/common/DataTable.tsx';
import { columnHelper, type ColumnList } from '@/components/common/dataTableColumns.ts';
import { EmptyState } from '@/components/common/states.tsx';
import { Alert } from '@/components/ui/Alert.tsx';
import { IconButton, SearchField } from '@/components/ui/controls.tsx';
import { Select, type SelectOption } from '@/components/ui/Select.tsx';
import { FilterResetButton } from '@/portals/code-review/components/TaskFilterBar.tsx';
import { ALL } from '@/portals/code-review/components/taskFilters.ts';
import { ROUTES } from '@/config/routes.ts';
import { ApiError } from '@/lib/apiClient.ts';
import { formatDate, interpolate } from '@/lib/formatters.ts';
import { useTasks } from '@/portals/code-review/hooks/useTasks.ts';
import { useUsers } from '@/portals/code-review/hooks/useUsers.ts';
import admin from '@/content/admin.json';
import common from '@/content/common.json';
import { useHandovers, useReturnHandover } from '../api/handovers.ts';
import { HandoverReasonCell } from '../components/HandoverReasonCell.tsx';
import { ReassignHandoverDialog } from '../components/ReassignHandoverDialog.tsx';
import {
  EMPTY_HANDOVER_FILTERS,
  filterHandovers,
  isHandoverFiltered,
  readHandoverFilters,
  writeHandoverFilters,
  type HandoverFilters,
} from '../components/handoverFilters.ts';
import { EmptyIllustration } from '@/components/common/EmptyIllustration.tsx';
import {
  buildDetailUrl,
  currentListUrl,
  readPagination,
  readSorting,
  writePagination,
  writeSorting,
} from '@/portals/code-review/components/taskListNavigation.ts';

/**
 * Admin — Handovers.
 *
 * ⚠️ Entirely our design. The specification defines handover in one paragraph
 * (p.12) and there is no Figma screen, no development-spec section and no
 * Handover button anywhere in the Power App wireframes. Built by reusing the
 * Admin Tasks shell so it reads as part of the same product; treat the shape as
 * provisional until reviewed (plan risk R7).
 *
 * Resolved rows stay listed rather than disappearing: "who did this task go to,
 * and why did it move" is exactly the question this tab exists to answer, and a
 * queue that empties itself answers it only while someone is watching.
 */

const labels = admin.handovers;

/** A handover joined with the task fields its row shows. */
interface HandoverRow extends Handover {
  taskCode: string;
  taskTitle: string;
  crimId: string;
  customerId: string;
  customerName: string;
  customerColor: string;
}

const helper = columnHelper<HandoverRow>();

/* Each column its own `const` — see the note in `taskColumns.tsx`. */

const taskColumn = helper.accessor('taskCode', {
  header: labels.columns.task,
  cell: (context) => (
    <div className="min-w-0">
      <MonoId value={context.getValue()} />
      <p className="truncate text-sm text-ink-700">{context.row.original.taskTitle}</p>
    </div>
  ),
});

const fromColumn = helper.accessor('fromReviewerName', {
  header: labels.columns.from,
  cell: (context) => <span className="text-sm">{context.getValue()}</span>,
});

const reasonColumn = helper.accessor('reason', {
  header: labels.columns.reason,
  cell: (context) => (
    <HandoverReasonCell
      reason={context.getValue()}
      fromReviewerName={context.row.original.fromReviewerName}
      raisedAt={context.row.original.createdAt}
    />
  ),
});

const STATUS_TONES = {
  Pending: 'bg-status-draft-surface text-status-draft',
  Reassigned: 'bg-status-approved-surface text-status-approved',
  Cancelled: 'bg-canvas text-ink-500',
  ReturnedToQueue: 'bg-canvas text-ink-500',
} as const;

const statusColumn = helper.accessor('status', {
  header: labels.columns.status,
  cell: (context) => (
    <Tag className={STATUS_TONES[context.getValue()]}>{labels.status[context.getValue()]}</Tag>
  ),
});

const outcomeColumn = helper.accessor('reassignedToName', {
  header: labels.columns.outcome,
  cell: (context) => {
    const row = context.row.original;
    if (row.status === 'Reassigned') {
      return (
        <span className="text-sm">
          {interpolate(labels.reassignedTo, { name: context.getValue() ?? '' })}
        </span>
      );
    }
    if (row.status === 'Cancelled' || row.status === 'ReturnedToQueue') {
      return <span className="text-sm">{labels.returned}</span>;
    }
    return <OptionalCell value={null} />;
  },
});

const raisedColumn = helper.accessor('createdAt', {
  header: labels.columns.raised,
  cell: (context) => <DateCell>{formatDate(context.getValue())}</DateCell>,
});

export function AdminHandoversPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { data: handovers, isPending, isFetching, error, refetch } = useHandovers();
  const { data: tasks } = useTasks('all');
  const { data: users } = useUsers();
  const returnToQueue = useReturnHandover();

  const [reassigning, setReassigning] = useState<HandoverRow | null>(null);
  const [returning, setReturning] = useState<HandoverRow | null>(null);
  const pagination = useMemo(() => readPagination(searchParams), [searchParams]);
  const sorting = useMemo(() => readSorting(searchParams), [searchParams]);
  const filters = useMemo(() => readHandoverFilters(searchParams), [searchParams]);
  const returnTo = currentListUrl(location.pathname, location.search);

  const rows = useMemo<HandoverRow[]>(() => {
    const byId = new Map((tasks ?? []).map((task) => [task.id, task]));

    return (handovers ?? []).map((handover) => {
      const task = byId.get(handover.taskId);
      return {
        ...handover,
        taskCode: task?.taskCode ?? handover.taskId,
        taskTitle: task?.title ?? '',
        crimId: task?.crimId ?? '',
        customerId: task?.customerId ?? '',
        customerName: task?.customerName ?? '',
        customerColor: task?.customerColor ?? '',
      };
    });
  }, [handovers, tasks]);

  const visibleRows = useMemo(() => filterHandovers(rows, filters), [rows, filters]);
  const isFiltered = isHandoverFiltered(filters);

  const reviewerOptions = useMemo<SelectOption[]>(() => {
    const reviewers = new Map(rows.map((row) => [row.fromReviewerId, row.fromReviewerName]));
    return [
      { value: ALL, label: labels.filters.reviewerAll },
      ...[...reviewers]
        .sort((a, b) => a[1].localeCompare(b[1]))
        .map(([value, label]) => ({ value, label })),
    ];
  }, [rows]);

  const customerOptions = useMemo<SelectOption[]>(() => {
    const customers = new Map(
      rows.filter((row) => row.customerId !== '').map((row) => [row.customerId, row.customerName]),
    );
    return [
      { value: ALL, label: labels.filters.customerAll },
      ...[...customers]
        .sort((a, b) => a[1].localeCompare(b[1]))
        .map(([value, label]) => ({ value, label })),
    ];
  }, [rows]);

  const statusOptions: SelectOption[] = [
    { value: ALL, label: labels.filters.statusAll },
    ...HANDOVER_STATUSES.map((status) => ({ value: status, label: labels.status[status] })),
  ];
  const dateOptions: SelectOption[] = [
    { value: 'all', label: labels.filters.dateAll },
    { value: 'today', label: labels.filters.dateToday },
    { value: '7d', label: labels.filters.date7 },
    { value: '30d', label: labels.filters.date30 },
  ];

  const applyFilters = (nextFilters: HandoverFilters) => {
    const nextParams = new URLSearchParams(searchParams);
    writeHandoverFilters(nextParams, nextFilters);
    nextParams.delete('page');
    const query = nextParams.toString();
    void navigate(query ? `${location.pathname}?${query}` : location.pathname, { replace: true });
  };

  const columns = useMemo<ColumnList<HandoverRow>>(
    () => [
      taskColumn,
      fromColumn,
      reasonColumn,
      statusColumn,
      outcomeColumn,
      raisedColumn,
      helper.display({
        id: 'actions',
        header: '',
        cell: (context) => {
          const row = context.row.original;
          return (
            <div className="flex items-center justify-end gap-0.5">
              <IconButton
                label={interpolate(labels.actions.view, { taskCode: row.taskCode })}
                icon={<Eye className="size-4" />}
                size="sm"
                onClick={() => {
                  void navigate(buildDetailUrl(ROUTES.admin.handover(row.id), returnTo));
                }}
              />
              {/* Only a pending handover can be acted on; the rest are history. */}
              {row.status === 'Pending' ? (
                <>
                  <IconButton
                    label={interpolate(labels.actions.reassign, { taskCode: row.taskCode })}
                    icon={<UserPlus className="size-4" />}
                    size="sm"
                    onClick={() => {
                      setReassigning(row);
                    }}
                  />
                  <IconButton
                    label={interpolate(labels.actions.return, { taskCode: row.taskCode })}
                    icon={<Undo2 className="size-4" />}
                    size="sm"
                    onClick={() => {
                      setReturning(row);
                    }}
                  />
                </>
              ) : null}
            </div>
          );
        },
      }),
    ],
    [navigate, returnTo],
  );

  const handlePaginationChange = (pageIndex: number, pageSize: number) => {
    const nextParams = new URLSearchParams(searchParams);
    writePagination(nextParams, pageIndex, pageSize);
    const query = nextParams.toString();
    const target = query ? `${location.pathname}?${query}` : location.pathname;
    if (target !== returnTo) void navigate(target, { replace: true });
  };

  const handleSortingChange = (nextSorting: SortingState) => {
    const nextParams = new URLSearchParams(searchParams);
    writeSorting(nextParams, nextSorting);
    const query = nextParams.toString();
    const target = query ? `${location.pathname}?${query}` : location.pathname;
    if (target !== returnTo) void navigate(target, { replace: true });
  };

  const pendingCount = rows.filter((row) => row.status === 'Pending').length;

  return (
    <section aria-labelledby="admin-handovers-heading" className="space-y-4">
      <div>
        <h2 id="admin-handovers-heading" className="font-display text-lg font-bold text-ink-900">
          {labels.title}
        </h2>
        <p className="mt-0.5 text-sm text-ink-500">{labels.subtitle}</p>
      </div>

      {pendingCount > 0 ? <Alert tone="info">{labels.pendingNote}</Alert> : null}

      <DataTable
        data={visibleRows}
        totalCount={rows.length}
        columns={columns}
        getRowId={(row) => row.id}
        countNoun={labels.noun}
        caption={labels.caption}
        isLoading={isPending}
        isFetching={isFetching}
        error={error}
        onRetry={() => {
          void refetch();
        }}
        pageSize={pagination.pageSize}
        initialPageIndex={pagination.pageIndex}
        onPaginationChange={handlePaginationChange}
        initialSorting={sorting}
        onSortingChange={handleSortingChange}
        alwaysShowPagination
        resetPageIndexTrigger={`${filters.search}|${filters.status}|${filters.reviewerId}|${filters.dateRange}|${filters.customerId}`}
        toolbar={
          <div className="space-y-3">
            <SearchField
              value={filters.search}
              onValueChange={(search) => applyFilters({ ...filters, search })}
              label={labels.filters.searchLabel}
              placeholder={labels.filters.searchPlaceholder}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
              <Select
                value={filters.status}
                onValueChange={(status) =>
                  applyFilters({ ...filters, status: status as HandoverFilters['status'] })
                }
                options={statusOptions}
                label={labels.filters.status}
                icon={<Filter className="size-4" />}
                variant="stacked"
                aria-label={labels.filters.status}
              />
              <Select
                value={filters.reviewerId}
                onValueChange={(reviewerId) => applyFilters({ ...filters, reviewerId })}
                options={reviewerOptions}
                label={labels.filters.reviewer}
                icon={<UserRound className="size-4" />}
                variant="stacked"
                aria-label={labels.filters.reviewer}
              />
              <Select
                value={filters.dateRange}
                onValueChange={(dateRange) =>
                  applyFilters({ ...filters, dateRange: dateRange as HandoverFilters['dateRange'] })
                }
                options={dateOptions}
                label={labels.filters.date}
                icon={<CalendarDays className="size-4" />}
                variant="stacked"
                aria-label={labels.filters.date}
              />
              <Select
                value={filters.customerId}
                onValueChange={(customerId) => applyFilters({ ...filters, customerId })}
                options={customerOptions}
                label={labels.filters.customer}
                icon={<Building2 className="size-4" />}
                variant="stacked"
                aria-label={labels.filters.customer}
              />
              <FilterResetButton
                isFiltered={isFiltered}
                onReset={() => applyFilters(EMPTY_HANDOVER_FILTERS)}
              />
            </div>
            <p className="text-xs text-ink-500" aria-live="polite">
              {interpolate(labels.filters.summary, {
                visible: visibleRows.length,
                total: rows.length,
              })}
              {isFiltered ? ` ${labels.filters.filtered}` : null}
            </p>
          </div>
        }
        emptyState={
          <EmptyState
            icon={
              <EmptyIllustration>
                <Inbox />
              </EmptyIllustration>
            }
            title={labels.emptyTitle}
            hint={labels.emptyHint}
          />
        }
        filteredEmptyState={
          <EmptyState
            icon={
              <EmptyIllustration>
                <Inbox />
              </EmptyIllustration>
            }
            title={labels.filters.emptyTitle}
            hint={labels.filters.emptyHint}
            action={
              <button
                type="button"
                onClick={() => applyFilters(EMPTY_HANDOVER_FILTERS)}
                className="cursor-pointer rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm font-semibold text-brand-blue-600 hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
              >
                {labels.filters.clear}
              </button>
            }
          />
        }
      />

      {reassigning === null ? null : (
        <ReassignHandoverDialog
          key={reassigning.id}
          handover={reassigning}
          task={(tasks ?? []).find((task) => task.id === reassigning.taskId)}
          users={users ?? []}
          onClose={() => {
            setReassigning(null);
          }}
        />
      )}

      <ConfirmDialog
        open={returning !== null}
        onOpenChange={(open) => {
          if (!open) setReturning(null);
        }}
        title={labels.return.title}
        description={interpolate(labels.return.description, {
          taskCode: returning?.taskCode ?? '',
        })}
        confirmLabel={labels.return.confirm}
        tone="primary"
        isPending={returnToQueue.isPending}
        onConfirm={() => {
          if (returning === null) return;
          const row = returning;

          returnToQueue.mutate(row.id, {
            onSuccess: () => {
              toast.success(interpolate(labels.return.success, { taskCode: row.taskCode }));
              setReturning(null);
            },
            onError: (cause) => {
              toast.error(cause instanceof ApiError ? cause.message : common.errors.generic);
            },
          });
        }}
      />
    </section>
  );
}
