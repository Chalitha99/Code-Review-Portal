import { useMemo, useState } from 'react';
import { ClipboardList, Eye, Trash2, UserPlus, XCircle } from 'lucide-react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { TaskListItem, TaskStatus } from '@sdp/contracts';
import type { SortingState } from '@tanstack/react-table';
import { DataTable } from '@/components/common/DataTable.tsx';
import { ConfirmDialog } from '@/components/common/ConfirmDialog.tsx';
import { EmptyState } from '@/components/common/states.tsx';
import { buildTaskColumns } from '@/portals/code-review/components/taskColumns.tsx';
import { IconButton, Textarea } from '@/components/ui/controls.tsx';
import { Field } from '@/components/ui/Field.tsx';
import { ROUTES } from '@/config/routes.ts';
import { ApiError } from '@/lib/apiClient.ts';
import { interpolate } from '@/lib/formatters.ts';
import {
  canAssignReviewer,
  canCancelTask,
  canDeleteTask,
  canReassignReviewer,
} from '@/lib/statusMachine.ts';
import { useCurrentUser } from '@/hooks/useCurrentUser.ts';
import { useActiveBucket } from '@/portals/code-review/hooks/useKpiBucket.ts';
import { useTasks } from '@/portals/code-review/hooks/useTasks.ts';
import { ALL } from '@/portals/code-review/components/taskFilters.ts';
import { BUCKET_PARAM, BUCKET_TO_STATUS, type KpiBucket } from '@/lib/kpiBuckets.ts';
import admin from '@/content/admin.json';
import common from '@/content/common.json';
import { useCustomers } from '@/portals/code-review/hooks/useReferenceData.ts';
import { useCancelTask, useDeleteTask, useUsers } from '../api/queries.ts';
import { AdminTaskFilterBar } from '../components/AdminTaskFilterBar.tsx';
import { AssignReviewerDialog } from '../components/AssignReviewerDialog.tsx';
import {
  EMPTY_ADMIN_FILTERS,
  filterAdminTasks,
  type AdminTaskFilters,
} from '../components/adminTaskFilters.ts';
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

const ADMIN_STATUS_TO_BUCKET: Partial<Record<TaskStatus, KpiBucket>> = {
  Submitted: 'awaitingReviewAdmin',
  ReSubmitted: 'awaitingReviewAdmin',
  InReview: 'inReview',
  ChangesRequested: 'changesRequested',
  Approved: 'approved',
  Cancelled: 'cancelled',
};

/**
 * Admin — Tasks (screen 01).
 *
 * Which row actions appear is decided by `statusMachine`, not by the wireframe's
 * drawing: the wireframe shows a cancel icon on an Approved row, which the
 * lifecycle does not permit. Following the machine keeps the buttons honest —
 * and the handlers re-check every one of them, so a stale button is a dead
 * click rather than an unauthorised write.
 */
/**
 * A ChangesRequested task waits for the developer; the admin may change who
 * receives it on resubmission (docs/25-review-assignment-rules.md).
 */
function canChangeFollowUpReviewer(task: TaskListItem): boolean {
  return task.status === 'ChangesRequested';
}

export function AdminTasksPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { data: user } = useCurrentUser();
  const { data: tasks, isPending, isFetching, error, refetch } = useTasks('all');
  const { data: users } = useUsers();
  const { data: customers } = useCustomers();
  // Set by the counter cards in `AdminLayout` — see `lib/kpiBuckets.ts`.
  const bucket = useActiveBucket();

  const filters = useMemo<AdminTaskFilters>(() => {
    const shared = readTaskListFilters(searchParams);
    return {
      ...EMPTY_ADMIN_FILTERS,
      ...shared,
      customerId: searchParams.get('customer') ?? searchParams.get('customerId') ?? ALL,
      developerId: searchParams.get('developer') ?? ALL,
      reviewerId: searchParams.get('reviewer') ?? ALL,
    };
  }, [searchParams]);
  const pagination = useMemo(() => readPagination(searchParams), [searchParams]);
  const sorting = useMemo(() => readSorting(searchParams), [searchParams]);
  const returnTo = currentListUrl(location.pathname, location.search);
  const [assigning, setAssigning] = useState<TaskListItem | null>(null);
  const [cancelling, setCancelling] = useState<TaskListItem | null>(null);
  const [deleting, setDeleting] = useState<TaskListItem | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteReasonError, setDeleteReasonError] = useState<string | undefined>();

  const cancelTask = useCancelTask();
  const deleteTask = useDeleteTask();

  // Status is navigation state because the summary cards live in the parent
  // layout. Both cards and the dropdown therefore read the same URL value.
  const currentStatus = useMemo(
    () => (filters.status !== ALL ? filters.status : bucket ? BUCKET_TO_STATUS[bucket] : ALL),
    [bucket, filters.status],
  );

  const effective = useMemo<AdminTaskFilters>(
    () => ({ ...filters, status: currentStatus, bucket: bucket ?? ALL }),
    [filters, currentStatus, bucket],
  );

  const visible = useMemo(() => filterAdminTasks(tasks ?? [], effective), [tasks, effective]);

  const actor = useMemo(
    () => ({ userId: user?.id ?? '', roles: user?.roles ?? [] }),
    [user?.id, user?.roles],
  );

  const columns = useMemo(
    () =>
      buildTaskColumns({
        showDeveloper: true,
        showReviewer: true,
        showPriority: false,
        renderAction: (task) => (
          <div className="flex items-center justify-end gap-0.5">
            <IconButton
              label={interpolate(admin.tasks.actions.view, { taskCode: task.taskCode })}
              icon={<Eye className="size-4" />}
              size="sm"
              onClick={() => {
                if (task.isHandedOver) {
                  void navigate(buildDetailUrl(ROUTES.admin.handoverTask(task.id), returnTo));
                } else {
                  void navigate(buildDetailUrl(ROUTES.admin.task(task.id), returnTo));
                }
              }}
            />
            {canAssignReviewer(actor, task) ||
            canReassignReviewer(actor, task) ||
            canChangeFollowUpReviewer(task) ? (
              <IconButton
                label={
                  task.status === 'ChangesRequested'
                    ? interpolate(admin.tasks.followUp.action, { taskCode: task.taskCode })
                    : task.status === 'InReview'
                      ? `Reassign reviewer for ${task.taskCode}`
                      : interpolate(admin.tasks.actions.assign, { taskCode: task.taskCode })
                }
                icon={<UserPlus className="size-4" />}
                size="sm"
                onClick={() => {
                  setAssigning(task);
                }}
              />
            ) : null}
            {canCancelTask(actor, task) ? (
              <IconButton
                label={interpolate(admin.tasks.actions.cancel, { taskCode: task.taskCode })}
                icon={<XCircle className="size-4" />}
                tone="danger"
                size="sm"
                onClick={() => {
                  setCancelReason('');
                  setCancelling(task);
                }}
              />
            ) : null}
            {canDeleteTask(actor, task) ? (
              <IconButton
                label={interpolate(admin.tasks.actions.delete, { taskCode: task.taskCode })}
                icon={<Trash2 className="size-4" />}
                tone="danger"
                size="sm"
                onClick={() => {
                  setDeleteReason('');
                  setDeleteReasonError(undefined);
                  setDeleting(task);
                }}
              />
            ) : null}
          </div>
        ),
      }),
    [actor, navigate, returnTo],
  );

  function confirmCancel() {
    if (cancelling === null) return;
    if (cancelReason.trim() === '') {
      toast.error('Provide a reason for cancelling this task.');
      return;
    }
    const task = cancelling;

    cancelTask.mutate(
      { taskId: task.id, reason: cancelReason.trim() },
      {
        onSuccess: () => {
          toast.success(interpolate(admin.tasks.cancel.success, { taskCode: task.taskCode }));
          setCancelling(null);
          setCancelReason('');
        },
        onError: (cause) => {
          toast.error(cause instanceof ApiError ? cause.message : common.errors.generic);
        },
      },
    );
  }

  function confirmDelete() {
    if (deleting === null) return;
    if (deleteReason.trim() === '') {
      setDeleteReasonError(admin.tasks.delete.reasonLabel);
      return;
    }
    const task = deleting;

    deleteTask.mutate(
      { taskId: task.id, reason: deleteReason.trim() },
      {
        onSuccess: () => {
          toast.success(interpolate(admin.tasks.delete.success, { taskCode: task.taskCode }));
          setDeleting(null);
          setDeleteReason('');
        },
        onError: (cause) => {
          toast.error(cause instanceof ApiError ? cause.message : common.errors.generic);
        },
      },
    );
  }

  function handleFiltersChange(next: AdminTaskFilters) {
    // Status has one owner (the URL). Keep only the remaining controls in local
    // state so a card click cannot leave a second, stale status behind.
    const nextParams = new URLSearchParams(searchParams);
    writeTaskListFilters(nextParams, next, { customer: true });
    if (next.developerId !== ALL) nextParams.set('developer', next.developerId);
    else nextParams.delete('developer');
    if (next.reviewerId !== ALL) nextParams.set('reviewer', next.reviewerId);
    else nextParams.delete('reviewer');
    nextParams.delete('page');

    if (next.status === ALL) {
      nextParams.delete('status');
      nextParams.delete(BUCKET_PARAM);
    } else {
      nextParams.set('status', next.status);
      const mappedBucket = ADMIN_STATUS_TO_BUCKET[next.status as TaskStatus];
      if (mappedBucket) {
        nextParams.set(BUCKET_PARAM, mappedBucket);
      } else {
        nextParams.delete(BUCKET_PARAM);
      }
    }

    const query = nextParams.toString();
    void navigate(query ? `${ROUTES.admin.root}?${query}` : ROUTES.admin.root, { replace: true });
  }

  function handlePaginationChange(pageIndex: number, pageSize: number) {
    const nextParams = new URLSearchParams(searchParams);
    writePagination(nextParams, pageIndex, pageSize);
    const query = nextParams.toString();
    const target = query ? `${ROUTES.admin.root}?${query}` : ROUTES.admin.root;
    if (target !== returnTo) void navigate(target, { replace: true });
  }

  function handleSortingChange(nextSorting: SortingState) {
    const nextParams = new URLSearchParams(searchParams);
    writeSorting(nextParams, nextSorting);
    const query = nextParams.toString();
    const target = query ? `${ROUTES.admin.root}?${query}` : ROUTES.admin.root;
    if (target !== returnTo) void navigate(target, { replace: true });
  }

  return (
    <section aria-labelledby="admin-tasks-heading">
      <h2 id="admin-tasks-heading" className="sr-only">
        {admin.tasks.title}
      </h2>

      <DataTable
        data={visible}
        columns={columns}
        getRowId={(task) => task.id}
        totalCount={tasks?.length ?? 0}
        countNoun={admin.tasks.noun}
        caption={admin.tasks.caption}
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
        resetPageIndexTrigger={`${effective.search}|${effective.status}|${effective.priority}|${effective.cycle}|${effective.customerId}|${effective.developerId}|${effective.reviewerId}`}
        toolbar={
          <AdminTaskFilterBar
            filters={effective}
            onChange={handleFiltersChange}
            customers={customers ?? []}
            users={users ?? []}
          />
        }
        emptyState={
          <EmptyState
            icon={
              <EmptyIllustration>
                <ClipboardList />
              </EmptyIllustration>
            }
            title={admin.tasks.emptyTitle}
            hint={admin.tasks.emptyHint}
          />
        }
      />

      {assigning === null ? null : (
        <AssignReviewerDialog
          key={assigning.id}
          task={assigning}
          users={users ?? []}
          onClose={() => {
            setAssigning(null);
          }}
        />
      )}

      <ConfirmDialog
        open={cancelling !== null}
        onOpenChange={(open) => {
          if (!open) setCancelling(null);
        }}
        title={admin.tasks.cancel.title}
        description={interpolate(admin.tasks.cancel.description, {
          taskCode: cancelling?.taskCode ?? '',
        })}
        confirmLabel={
          cancelTask.isPending ? admin.tasks.cancel.confirming : admin.tasks.cancel.confirm
        }
        // "Cancel" would be the dismissive AND the destructive word on this one
        // dialog, so the dismissive button says what it keeps instead.
        cancelLabel={admin.tasks.cancel.keep}
        onConfirm={confirmCancel}
        isPending={cancelTask.isPending}
        confirmDisabled={cancelReason.trim() === ''}
      >
        <Field label={admin.tasks.cancel.reasonLabel} required>
          <Textarea
            value={cancelReason}
            onChange={(event) => {
              setCancelReason(event.target.value);
            }}
            rows={3}
            placeholder={admin.tasks.cancel.reasonPlaceholder}
          />
        </Field>
      </ConfirmDialog>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={admin.tasks.delete.title}
        description={interpolate(admin.tasks.delete.description, {
          taskCode: deleting?.taskCode ?? '',
        })}
        confirmLabel={
          deleteTask.isPending ? admin.tasks.delete.confirming : admin.tasks.delete.confirm
        }
        onConfirm={confirmDelete}
        isPending={deleteTask.isPending}
      >
        <Field label={admin.tasks.delete.reasonLabel} required error={deleteReasonError}>
          <Textarea
            value={deleteReason}
            onChange={(event) => {
              setDeleteReason(event.target.value);
              setDeleteReasonError(undefined);
            }}
            rows={3}
            placeholder={admin.tasks.delete.reasonPlaceholder}
          />
        </Field>
      </ConfirmDialog>
    </section>
  );
}
