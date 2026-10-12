import { useCallback, useMemo, useState } from 'react';
import { FilePlus2, ListChecks, Trash2 } from 'lucide-react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { TaskListItem, TaskStatus } from '@sdp/contracts';
import type { SortingState } from '@tanstack/react-table';
import { ConfirmDialog } from '@/components/common/ConfirmDialog.tsx';
import { DataTable } from '@/components/common/DataTable.tsx';
import { EmptyState } from '@/components/common/states.tsx';
import { buttonVariants } from '@/components/ui/buttonVariants.ts';
import { IconButton } from '@/components/ui/controls.tsx';
import { ROUTES } from '@/config/routes.ts';
import { interpolate } from '@/lib/formatters.ts';
import tasks from '@/content/tasks.json';
import common from '@/content/common.json';
import { ApiError } from '@/lib/apiClient.ts';
import { useCurrentUser } from '@/hooks/useCurrentUser.ts';
import { useActiveBucket } from '@/portals/code-review/hooks/useKpiBucket.ts';
import { BUCKET_PARAM, BUCKET_TO_STATUS, STATUS_TO_BUCKET } from '@/lib/kpiBuckets.ts';
import { canDiscardDraft } from '@/lib/statusMachine.ts';
import { useDiscardDraft, useTasks } from '../api/queries.ts';
import {
  buildTaskColumns,
  taskArrowAction,
} from '@/portals/code-review/components/taskColumns.tsx';
import { TaskFilterBar } from '@/portals/code-review/components/TaskFilterBar.tsx';
import {
  ALL,
  filterTasks,
  type TaskFilters,
} from '@/portals/code-review/components/taskFilters.ts';
import { EmptyIllustration } from '@/components/common/EmptyIllustration.tsx';
import {
  buildDetailUrl,
  currentListUrl,
  readPagination,
  readTaskListFilters,
  readSorting,
  writePagination,
  writeSorting,
  writeTaskListFilters,
} from '@/portals/code-review/components/taskListNavigation.ts';

/**
 * My Tasks (screen 16).
 *
 * Filtering happens here rather than through `DataTable`'s own global filter:
 * the wireframe's search spans four fields and the status/priority/cycle selects
 * are domain filters, not column filters. Passing the already-filtered array in
 * keeps one implementation of "which tasks match" — the same one the count line
 * describes.
 *
 * The counter cards above this grid live in `DeveloperLayout`, a different
 * component on a different route, so their selection arrives through the URL
 * rather than through props. See `lib/kpiBuckets.ts`.
 */
export function MyTasksPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { data: user } = useCurrentUser();
  const [discarding, setDiscarding] = useState<TaskListItem | null>(null);
  const { data, isPending, isFetching, error, refetch } = useTasks('mine');
  const discardDraft = useDiscardDraft();

  const actor = useMemo(
    () => ({ userId: user?.id ?? '', roles: user?.roles ?? [] }),
    [user?.id, user?.roles],
  );

  const bucket = useActiveBucket();
  const filters = useMemo(() => readTaskListFilters(searchParams), [searchParams]);
  const pagination = useMemo(() => readPagination(searchParams), [searchParams]);
  const sorting = useMemo(() => readSorting(searchParams), [searchParams]);
  const returnTo = currentListUrl(location.pathname, location.search);

  // If a status is explicitly in the URL, or if a bucket is active, sync status
  const currentStatus = useMemo(() => {
    const statusParam = searchParams.get('status');
    if (statusParam) return statusParam;
    if (bucket) {
      return BUCKET_TO_STATUS[bucket] ?? ALL;
    }
    return ALL;
  }, [searchParams, bucket]);

  const effective = useMemo<TaskFilters>(
    () => ({
      ...filters,
      status: currentStatus,
      bucket: bucket ?? ALL,
    }),
    [filters, currentStatus, bucket],
  );

  const handleSortingChange = useCallback(
    (nextSorting: SortingState) => {
      const nextParams = new URLSearchParams(searchParams);
      writeSorting(nextParams, nextSorting);
      const query = nextParams.toString();
      const target = query ? `${location.pathname}?${query}` : location.pathname;
      if (target !== returnTo) void navigate(target, { replace: true });
    },
    [location.pathname, navigate, returnTo, searchParams],
  );

  const visible = useMemo(() => filterTasks(data ?? [], effective), [data, effective]);

  const handleFiltersChange = useCallback(
    (next: TaskFilters) => {
      const nextParams = new URLSearchParams(searchParams);
      writeTaskListFilters(nextParams, next);
      nextParams.delete('page');

      if (next.status !== ALL) {
        nextParams.set('status', next.status);
        const mappedBucket = STATUS_TO_BUCKET[next.status as TaskStatus];
        if (mappedBucket) {
          nextParams.set(BUCKET_PARAM, mappedBucket);
        } else {
          nextParams.delete(BUCKET_PARAM);
        }
      } else {
        nextParams.delete('status');
        nextParams.delete(BUCKET_PARAM);
      }

      // If user resets all filters
      if (
        next.search === '' &&
        next.status === ALL &&
        next.priority === ALL &&
        next.cycle === ALL
      ) {
        nextParams.delete(BUCKET_PARAM);
        nextParams.delete('status');
      }

      const qs = nextParams.toString();
      void navigate(qs ? `${location.pathname}?${qs}` : location.pathname, { replace: true });
    },
    [navigate, location.pathname, searchParams],
  );

  const handlePaginationChange = useCallback(
    (pageIndex: number, pageSize: number) => {
      const nextParams = new URLSearchParams(searchParams);
      writePagination(nextParams, pageIndex, pageSize);
      const query = nextParams.toString();
      const target = query ? `${location.pathname}?${query}` : location.pathname;
      if (target !== returnTo) void navigate(target, { replace: true });
    },
    [location.pathname, navigate, returnTo, searchParams],
  );

  const columns = useMemo(
    () =>
      buildTaskColumns({
        renderAction: (task) => (
          <div className="flex items-center justify-end gap-1">
            {canDiscardDraft(actor, task) ? (
              <IconButton
                label={interpolate(tasks.discardDraft.rowAction, { taskCode: task.taskCode })}
                icon={<Trash2 className="size-4" />}
                tone="danger"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setDiscarding(task);
                }}
              />
            ) : null}
            {taskArrowAction(task, () => {
              void navigate(buildDetailUrl(ROUTES.developer.task(task.id), returnTo));
            })}
          </div>
        ),
      }),
    [navigate, actor, returnTo],
  );

  return (
    <section>
      <DataTable
        heading={{
          icon: <ListChecks className="size-5 shrink-0 text-workspace-developer" />,
          title: tasks.list.title,
        }}
        data={visible}
        columns={columns}
        getRowId={(task) => task.id}
        onRowClick={(task) => {
          void navigate(buildDetailUrl(ROUTES.developer.task(task.id), returnTo));
        }}
        totalCount={data?.length ?? 0}
        countNoun={tasks.list.noun}
        caption={tasks.list.caption}
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
        resetPageIndexTrigger={`${effective.search}|${effective.status}|${effective.priority}|${effective.cycle}|${effective.bucket}`}
        toolbar={<TaskFilterBar filters={effective} onChange={handleFiltersChange} />}
        emptyState={
          <EmptyState
            icon={
              <EmptyIllustration>
                <ListChecks />
              </EmptyIllustration>
            }
            title={tasks.list.emptyTitle}
            hint={tasks.list.emptyHint}
            action={
              <Link to={ROUTES.developer.newTask} className={buttonVariants()}>
                <FilePlus2 className="size-4" aria-hidden="true" />
                {tasks.workspace.newTask}
              </Link>
            }
          />
        }
      />

      <ConfirmDialog
        open={discarding !== null}
        onOpenChange={(open) => {
          if (!open) setDiscarding(null);
        }}
        title={tasks.discardDraft.title}
        description={tasks.discardDraft.description}
        confirmLabel={
          discardDraft.isPending ? tasks.discardDraft.confirming : tasks.discardDraft.confirm
        }
        tone="danger"
        isPending={discardDraft.isPending}
        onConfirm={() => {
          if (!discarding) return;
          const taskToDiscard = discarding;
          discardDraft.mutate(taskToDiscard.id, {
            onSuccess: () => {
              toast.success(
                interpolate(tasks.discardDraft.successWithCode, {
                  taskCode: taskToDiscard.taskCode,
                }),
              );
              setDiscarding(null);
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
