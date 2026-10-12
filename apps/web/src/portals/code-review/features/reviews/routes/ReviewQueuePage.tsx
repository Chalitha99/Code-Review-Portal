import { useCallback, useMemo, useState } from 'react';
import { History, Inbox, ListChecks, UserPlus } from 'lucide-react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { TaskListItem } from '@sdp/contracts';
import type { SortingState } from '@tanstack/react-table';
import { Button } from '@/components/ui/Button.tsx';
import { DataTable } from '@/components/common/DataTable.tsx';
import type { SelectOption } from '@/components/ui/Select.tsx';
import { EmptyState } from '@/components/common/states.tsx';
import { ROUTES } from '@/config/routes.ts';
import { WORKSPACE_THEME } from '@/config/workspaceTheme.ts';
import { ApiError } from '@/lib/apiClient.ts';
import { interpolate } from '@/lib/formatters.ts';
import common from '@/content/common.json';
import reviews from '@/content/reviews.json';
import { useTasks } from '@/portals/code-review/hooks/useTasks.ts';
import { useCustomers } from '@/portals/code-review/hooks/useReferenceData.ts';
import { useActiveBucket } from '@/portals/code-review/hooks/useKpiBucket.ts';
import { BUCKET_PARAM, BUCKET_TO_STATUS } from '@/lib/kpiBuckets.ts';
import {
  buildTaskColumns,
  taskArrowAction,
} from '@/portals/code-review/components/taskColumns.tsx';
import { TaskFilterBar } from '@/portals/code-review/components/TaskFilterBar.tsx';
import {
  ALL,
  EMPTY_TASK_FILTERS,
  filterTasks,
  type TaskFilters,
} from '@/portals/code-review/components/taskFilters.ts';
import { usePickTask } from '../api/queries.ts';
import { EmptyIllustration } from '@/components/common/EmptyIllustration.tsx';
import { buildReviewerTaskUrl } from '../domain/reviewerNavigation.ts';
import {
  readPagination,
  readSorting,
  writePagination,
  writeSorting,
} from '@/portals/code-review/components/taskListNavigation.ts';

/**
 * The three reviewer queues (screens 07, 08/10, 09/11).
 *
 * One component, three scopes. They differ only in which server scope they read
 * and which action each row offers — building three near-identical files would
 * mean three places to fix the next column change.
 */

type QueueVariant = 'available' | 'assigned' | 'history';

const COPY = {
  available: reviews.available,
  assigned: { ...reviews.available, ...reviews.assigned },
  history: { ...reviews.available, ...reviews.history },
} as const;

export function ReviewQueuePage({ variant }: { variant: QueueVariant }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const bucket = useActiveBucket();
  const explicitBucket = searchParams.get(BUCKET_PARAM);

  const pagination = useMemo(() => readPagination(searchParams), [searchParams]);
  const sorting = useMemo(() => readSorting(searchParams), [searchParams]);

  const searchParamStatus = searchParams.get('status') ?? searchParams.get('decision');
  const searchParamPriority = searchParams.get('priority');
  const searchParamCustomer = searchParams.get('customer') ?? searchParams.get('customerId');
  const searchParamCycle = searchParams.get('cycle');
  const searchParamSearch = searchParams.get('search');

  const [filters, setFilters] = useState<TaskFilters>(() => ({
    ...EMPTY_TASK_FILTERS,
    status: searchParamStatus ?? ALL,
    bucket: explicitBucket ?? ALL,
    priority: searchParamPriority ?? ALL,
    customerId: searchParamCustomer ?? ALL,
    cycle: searchParamCycle ? String(searchParamCycle) : ALL,
    search: searchParamSearch ?? '',
  }));

  // Re-sync the filters when the URL-driven inputs change (adjusted during render).
  const urlFilterKey = JSON.stringify([
    variant,
    searchParamStatus,
    searchParamPriority,
    searchParamCustomer,
    searchParamCycle,
    searchParamSearch,
    bucket,
    explicitBucket,
  ]);
  // `null` so the first render also applies the bucket and queue rules the initial state skips.
  const [syncedUrlFilterKey, setSyncedUrlFilterKey] = useState<string | null>(null);
  if (syncedUrlFilterKey !== urlFilterKey) {
    setSyncedUrlFilterKey(urlFilterKey);
    setFilters((prev) => {
      const nextStatus =
        variant === 'assigned'
          ? ALL
          : (searchParamStatus ?? (bucket ? BUCKET_TO_STATUS[bucket] : prev.status) ?? ALL);
      const nextPriority = searchParamPriority ?? ALL;
      const nextCustomer = searchParamCustomer ?? ALL;
      const nextCycle = searchParamCycle ? String(searchParamCycle) : ALL;
      const nextSearch = searchParamSearch ?? '';
      const nextBucket = explicitBucket ?? ALL;

      if (
        prev.status === nextStatus &&
        prev.priority === nextPriority &&
        prev.customerId === nextCustomer &&
        prev.cycle === nextCycle &&
        prev.search === nextSearch &&
        prev.bucket === nextBucket
      ) {
        return prev;
      }
      return {
        ...prev,
        status: nextStatus,
        priority: nextPriority,
        customerId: nextCustomer,
        cycle: nextCycle,
        search: nextSearch,
        bucket: nextBucket,
      };
    });
  }

  const { data, isPending, isFetching, error, refetch } = useTasks(variant);
  const { data: customers } = useCustomers();
  const pick = usePickTask();

  const customerOptions = useMemo<SelectOption[]>(() => {
    if (!customers || customers.length === 0) return [];
    return [
      { value: ALL, label: reviews.available.filters.customerAll ?? 'All Customers' },
      ...customers.map((c) => ({
        value: c.id,
        label: c.name,
        adornment: (
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: c.color }}
            aria-hidden="true"
          />
        ),
      })),
    ];
  }, [customers]);

  const availableStatusOptions = useMemo<SelectOption[]>(
    () => [
      { value: ALL, label: reviews.available.filters.submissionTypeAll },
      { value: 'Submitted', label: reviews.available.filters.submissionTypeInitial },
      { value: 'ReSubmitted', label: reviews.available.filters.submissionTypeReReview },
    ],
    [],
  );

  const historyStatusOptions = useMemo<SelectOption[]>(
    () => [
      { value: ALL, label: reviews.history.filters.decisionAll },
      { value: 'ChangesRequested', label: reviews.history.filters.decisionChangesRequested },
      { value: 'Approved', label: reviews.history.filters.decisionApproved },
    ],
    [],
  );

  const currentStatus = useMemo(() => {
    if (variant === 'assigned') {
      return ALL;
    }
    const fromQuery = searchParams.get('status') ?? searchParams.get('decision');
    if (fromQuery) return fromQuery;
    if (bucket) {
      return BUCKET_TO_STATUS[bucket] ?? ALL;
    }
    return filters.status;
  }, [variant, searchParams, bucket, filters.status]);

  const effective = useMemo<TaskFilters>(
    () => ({
      ...filters,
      status: currentStatus,
      bucket: explicitBucket ?? ALL,
    }),
    [filters, currentStatus, explicitBucket],
  );

  const visible = useMemo(() => filterTasks(data ?? [], effective), [data, effective]);
  const copy = COPY[variant];
  const currentReturnPath = `${location.pathname}${location.search}`;

  const handleFiltersChange = useCallback(
    (next: TaskFilters) => {
      setFilters(next);
      const nextParams = new URLSearchParams(searchParams);

      if (next.status !== ALL) {
        nextParams.set('status', next.status);
        if (variant === 'history') {
          nextParams.set('decision', next.status);
        }
        // A dropdown choice is an exact status filter. KPI buckets can group
        // multiple statuses, so retaining/mapping one here makes "Initial
        // Submissions" silently include re-submissions and in-review work.
        nextParams.delete(BUCKET_PARAM);
      } else {
        nextParams.delete('status');
        nextParams.delete('decision');
        nextParams.delete(BUCKET_PARAM);
      }

      if (next.search?.trim()) {
        nextParams.set('search', next.search.trim());
      } else {
        nextParams.delete('search');
      }

      if (next.priority && next.priority !== ALL) {
        nextParams.set('priority', next.priority);
      } else {
        nextParams.delete('priority');
      }

      if (next.customerId && next.customerId !== ALL) {
        nextParams.set('customer', next.customerId);
      } else {
        nextParams.delete('customer');
        nextParams.delete('customerId');
      }

      if (next.cycle !== undefined && next.cycle !== ALL) {
        nextParams.set('cycle', String(next.cycle));
      } else {
        nextParams.delete('cycle');
      }

      // Reset page when filters change
      nextParams.delete('page');

      const qs = nextParams.toString();
      void navigate(qs ? `${location.pathname}?${qs}` : location.pathname, { replace: true });
    },
    [variant, navigate, location.pathname, searchParams],
  );

  const handlePaginationChange = useCallback(
    (pageIndex: number, pageSize: number) => {
      const nextParams = new URLSearchParams(searchParams);
      writePagination(nextParams, pageIndex, pageSize);
      const qs = nextParams.toString();
      const target = qs ? `${location.pathname}?${qs}` : location.pathname;
      if (target !== currentReturnPath) void navigate(target, { replace: true });
    },
    [searchParams, location.pathname, navigate, currentReturnPath],
  );

  const handleSortingChange = useCallback(
    (nextSorting: SortingState) => {
      const nextParams = new URLSearchParams(searchParams);
      writeSorting(nextParams, nextSorting);
      const qs = nextParams.toString();
      const target = qs ? `${location.pathname}?${qs}` : location.pathname;
      if (target !== currentReturnPath) void navigate(target, { replace: true });
    },
    [currentReturnPath, location.pathname, navigate, searchParams],
  );

  function handlePick(task: TaskListItem) {
    pick.mutate(task.id, {
      onSuccess: (picked) => {
        toast.success(interpolate(reviews.available.picked, { taskCode: picked.taskCode }));
        const taskUrl = buildReviewerTaskUrl(picked.id, ROUTES.reviewer.myTasks);
        void navigate(taskUrl, { state: { returnTo: ROUTES.reviewer.myTasks } });
      },
      onError: (cause) => {
        toast.error(cause instanceof ApiError ? cause.message : common.errors.generic);
      },
    });
  }

  const columns = useMemo(() => {
    if (variant === 'available') {
      return buildTaskColumns({
        showDeveloper: true,
        showHandover: true,
        compactIdentityColumns: true,
        renderAction: (task) => (
          <Button
            variant="workspace"
            className={WORKSPACE_THEME.reviewer.gradient}
            size="sm"
            onClick={() => {
              handlePick(task);
            }}
            isLoading={pick.isPending && pick.variables === task.id}
            disabled={pick.isPending}
            aria-label={interpolate(reviews.available.pickAria, { taskCode: task.taskCode })}
          >
            <UserPlus className="size-3.5" aria-hidden="true" />
            {reviews.available.pick}
          </Button>
        ),
      });
    }

    if (variant === 'history') {
      return buildTaskColumns({
        showDeveloper: true,
        compactIdentityColumns: true,
        renderAction: (task) =>
          taskArrowAction(
            task,
            () => {
              const taskUrl = buildReviewerTaskUrl(task.id, currentReturnPath);
              void navigate(taskUrl, { state: { returnTo: currentReturnPath } });
            },
            reviews.history.view,
          ),
      });
    }

    return buildTaskColumns({
      showDeveloper: true,
      compactIdentityColumns: true,
      showHandover: true,
      renderAction: (task) =>
        taskArrowAction(task, () => {
          const taskUrl = buildReviewerTaskUrl(task.id, currentReturnPath);
          void navigate(taskUrl, { state: { returnTo: currentReturnPath } });
        }),
    });
    // `handlePick` closes over the mutation, which changes identity while a pick
    // is in flight — that is exactly when the button must re-render to show its
    // spinner.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant, navigate, pick.isPending, pick.variables, currentReturnPath]);

  return (
    <section>
      <DataTable
        // Wireframes 07/08/09 all title the card and put the count opposite it;
        // this replaces the sr-only heading the section used to carry.
        heading={{
          icon:
            variant === 'available' ? (
              <Inbox className="size-5 shrink-0 text-workspace-reviewer" />
            ) : variant === 'history' ? (
              <History className="size-5 shrink-0 text-workspace-reviewer" />
            ) : (
              <ListChecks className="size-5 shrink-0 text-workspace-reviewer" />
            ),
          title: copy.title,
        }}
        data={visible}
        columns={columns}
        getRowId={(task) => task.id}
        onRowClick={
          variant === 'available'
            ? undefined
            : (task) => {
                const taskUrl = buildReviewerTaskUrl(task.id, currentReturnPath);
                void navigate(taskUrl, { state: { returnTo: currentReturnPath } });
              }
        }
        totalCount={data?.length ?? 0}
        countNoun={reviews.available.noun}
        caption={copy.caption}
        isLoading={isPending}
        isFetching={isFetching}
        error={error}
        onRetry={() => {
          void refetch();
        }}
        pageSize={pagination.pageSize}
        alwaysShowPagination
        initialPageIndex={pagination.pageIndex}
        onPaginationChange={handlePaginationChange}
        initialSorting={sorting}
        onSortingChange={handleSortingChange}
        resetPageIndexTrigger={`${effective.search}|${effective.status}|${effective.priority}|${effective.customerId ?? ''}|${effective.cycle}|${effective.bucket}`}
        toolbar={
          <TaskFilterBar
            filters={{ ...filters, status: currentStatus }}
            onChange={handleFiltersChange}
            customerOptions={customerOptions}
            statusOptions={
              variant === 'available'
                ? availableStatusOptions
                : variant === 'assigned'
                  ? null
                  : historyStatusOptions
            }
            statusLabel={
              variant === 'available'
                ? reviews.available.filters.submissionType
                : variant === 'history'
                  ? reviews.history.filters.decision
                  : undefined
            }
            showCycle={variant === 'history'}
          />
        }
        emptyState={
          <EmptyState
            icon={
              <EmptyIllustration>
                {variant === 'available' ? <Inbox /> : <ListChecks />}
              </EmptyIllustration>
            }
            title={copy.emptyTitle}
            hint={copy.emptyHint}
          />
        }
      />
    </section>
  );
}

/** Convenience wrappers so the route table reads as three screens, not one. */
export function AvailableTasksPage() {
  return <ReviewQueuePage variant="available" />;
}

export function MyReviewTasksPage() {
  return <ReviewQueuePage variant="assigned" />;
}

export function ReviewHistoryPage() {
  return <ReviewQueuePage variant="history" />;
}
