import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  attachClosestEdge,
  extractClosestEdge,
  type Edge,
} from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import {
  draggable,
  dropTargetForElements,
} from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { AlertCircle, GripVertical, Layers, Pencil, Plus, Power, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { ChecklistCategory, TaskTypeRecord } from '@sdp/contracts';
import { cn } from '@/components/ui';
import { ActiveBadge } from '@/portals/code-review/components/badges.tsx';
import { ConfirmDialog } from '@/components/common/ConfirmDialog.tsx';
import { Button } from '@/components/ui/Button.tsx';
import { IconButton } from '@/components/ui/controls.tsx';
import { Dialog } from '@/components/ui/Dialog.tsx';
import { Field, Input } from '@/components/ui/Field.tsx';
import { ApiError } from '@/lib/apiClient.ts';
import { moveRecordId, resequenceRecords } from '@/lib/checklistOrdering.ts';
import { visibleQuestions } from '@/lib/checklistVisibility.ts';
import admin from '@/content/admin.json';
import common from '@/content/common.json';
import {
  useAdminTaskTypes,
  useCreateTaskType,
  useDeleteTaskType,
  useReorderTaskTypes,
  useUpdateTaskType,
} from '../api/checklistAdmin.ts';
import { reportMutationError } from './reportMutationError.ts';
import { useFocusOnMount } from '@/hooks/useFocusOnMount.ts';

function DropIndicator({ edge }: { edge: Edge | null }) {
  if (!edge) return null;
  return (
    <div
      aria-hidden="true"
      data-testid="drop-indicator"
      className={cn(
        'pointer-events-none absolute right-0 left-0 z-30 flex items-center',
        edge === 'top' ? '-top-1.5' : '-bottom-1.5',
      )}
    >
      <div className="size-2 rounded-full border-2 border-violet-600 bg-white shadow-xs" />
      <div className="h-0.5 flex-1 bg-violet-600" />
      <div className="size-2 rounded-full border-2 border-violet-600 bg-white shadow-xs" />
    </div>
  );
}

const ReorderHandle = forwardRef<
  HTMLButtonElement,
  {
    label: string;
    isDragging: boolean;
    onNudge: (direction: 'up' | 'down') => void;
  }
>(function ReorderHandle({ label, isDragging, onNudge }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
        event.preventDefault();
        onNudge(event.key === 'ArrowUp' ? 'up' : 'down');
      }}
      onClick={(event) => {
        event.stopPropagation();
      }}
      className={cn(
        'grid size-7 shrink-0 place-items-center rounded-lg text-ink-400 transition-colors',
        'active:bg-canvas-strong hover:bg-canvas hover:text-ink-700',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600',
        isDragging ? 'cursor-grabbing bg-violet-100 text-violet-700' : 'cursor-grab',
      )}
    >
      <GripVertical className="size-4" aria-hidden="true" />
    </button>
  );
});

function TaskTypeRow({
  taskType,
  questionCount,
  onEdit,
  onToggleActive,
  onDelete,
  onReorder,
  onNudge,
}: {
  taskType: TaskTypeRecord;
  questionCount: number;
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
  onReorder: (movedId: string, targetId: string, placement: 'before' | 'after') => void;
  onNudge: (direction: 'up' | 'down') => void;
}) {
  const rowRef = useRef<HTMLLIElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [edge, setEdge] = useState<Edge | null>(null);

  useEffect(() => {
    const element = rowRef.current;
    const handle = handleRef.current;
    if (!element || !handle) return;

    return combine(
      draggable({
        element,
        dragHandle: handle,
        getInitialData: () => ({ type: 'task-type', id: taskType.id }),
        onDragStart: () => setIsDragging(true),
        onDrop: () => setIsDragging(false),
      }),
      dropTargetForElements({
        element,
        canDrop: ({ source }) =>
          source.data['type'] === 'task-type' && source.data['id'] !== taskType.id,
        getData: ({ input }) =>
          attachClosestEdge(
            { id: taskType.id },
            { element, input, allowedEdges: ['top', 'bottom'] },
          ),
        onDrag: ({ self }) => setEdge(extractClosestEdge(self.data)),
        onDragLeave: () => setEdge(null),
        onDrop: ({ self, source }) => {
          setEdge(null);
          const movedId = source.data['id'];
          if (typeof movedId !== 'string' || source.data['type'] !== 'task-type') return;
          const dropEdge = extractClosestEdge(self.data);
          onReorder(movedId, taskType.id, dropEdge === 'top' ? 'before' : 'after');
        },
      }),
    );
  }, [taskType.id, onReorder]);

  return (
    <li
      ref={rowRef}
      className={cn(
        'relative grid grid-cols-[auto_1fr_auto_auto] items-center gap-3.5 px-4 py-3 text-sm transition-all duration-150',
        isDragging
          ? 'border-dashed border-violet-400 bg-violet-50/30 opacity-30 shadow-none'
          : !taskType.isActive
            ? 'bg-canvas/25 text-ink-500 hover:bg-canvas/50'
            : 'bg-surface hover:bg-canvas/30',
      )}
    >
      <DropIndicator edge={edge} />

      {/* Drag handle */}
      <ReorderHandle
        ref={handleRef}
        label={`Reorder task type: ${taskType.name}`}
        isDragging={isDragging}
        onNudge={onNudge}
      />

      {/* Task type name & question count */}
      <div className="min-w-0 pr-2">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm leading-snug font-semibold text-ink-900">
            {taskType.name}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-ink-500 tabular-nums">
          {questionCount} {questionCount === 1 ? 'question' : 'questions'}
        </p>
      </div>

      {/* Status badge */}
      <div className="flex w-24 shrink-0 justify-center">
        <ActiveBadge isActive={taskType.isActive} />
      </div>

      {/* Action buttons */}
      <div className="flex w-24 shrink-0 items-center justify-end gap-0.5">
        <IconButton
          label={`Edit task type: ${taskType.name}`}
          icon={<Pencil className="size-4" />}
          size="sm"
          onClick={onEdit}
          title="Edit task type name"
        />
        <IconButton
          label={(taskType.isActive ? 'Deactivate' : 'Activate') + ` task type: ${taskType.name}`}
          icon={<Power className="size-4" />}
          tone={taskType.isActive ? 'neutral' : 'success'}
          size="sm"
          onClick={onToggleActive}
          title={taskType.isActive ? 'Deactivate task type' : 'Activate task type'}
        />
        <IconButton
          label={`Delete task type: ${taskType.name}`}
          icon={<Trash2 className="size-4" />}
          tone="danger"
          size="sm"
          onClick={onDelete}
          title="Permanently delete task type"
        />
      </div>
    </li>
  );
}

function TaskTypeFormDialog({
  initial,
  isPending,
  existingNames,
  onSubmit,
  onClose,
}: {
  initial: TaskTypeRecord | null;
  isPending: boolean;
  existingNames: readonly string[];
  onSubmit: (name: string) => void;
  onClose: () => void;
}) {
  const focusOnMount = useFocusOnMount<HTMLInputElement>();
  const [name, setName] = useState(initial?.name ?? '');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Name is required');
      return;
    }
    const isTaken = existingNames.some(
      (existing) =>
        existing.toLowerCase() === trimmed.toLowerCase() &&
        existing.toLowerCase() !== initial?.name.toLowerCase(),
    );
    if (isTaken) {
      setError('A task type with that name already exists.');
      return;
    }
    onSubmit(trimmed);
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={initial === null ? 'Add Task Type' : 'Edit Task Type'}
      description={
        initial === null
          ? 'A new kind of work developers can select for their tasks.'
          : 'Rename this task type. Existing tasks and questions will reflect the new name.'
      }
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            {common.actions.cancel}
          </Button>
          <Button variant="adminPrimary" onClick={handleSubmit} isLoading={isPending}>
            {initial === null ? 'Add Task Type' : common.actions.save}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Task Type Name" required error={error ?? undefined}>
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError(null);
            }}
            placeholder="e.g. Upgrade Service"
            ref={focusOnMount}
          />
        </Field>
      </form>
    </Dialog>
  );
}

/** Redesigned, polished modal for managing Task Types */
export function TaskTypeManager({
  taskTypes: propTaskTypes,
  categories,
  onClose,
}: {
  taskTypes: readonly TaskTypeRecord[];
  categories: readonly ChecklistCategory[];
  onClose: () => void;
}) {
  const { data: fetchedTaskTypes } = useAdminTaskTypes();
  const taskTypes = fetchedTaskTypes ?? propTaskTypes;
  const [draftOrder, setDraftOrder] = useState<string[] | null>(null);
  const [editingTaskType, setEditingTaskType] = useState<TaskTypeRecord | null | undefined>(
    undefined,
  );
  const [deactivatingTaskType, setDeactivatingTaskType] = useState<TaskTypeRecord | null>(null);
  const [deletingTaskType, setDeletingTaskType] = useState<TaskTypeRecord | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const create = useCreateTaskType();
  const update = useUpdateTaskType();
  const remove = useDeleteTaskType();
  const reorder = useReorderTaskTypes();

  const orderedTaskTypes = useMemo(() => {
    const rawIds = draftOrder ?? taskTypes.map((t) => t.id);
    return resequenceRecords(taskTypes, rawIds) ?? [...taskTypes].sort((a, b) => a.order - b.order);
  }, [taskTypes, draftOrder]);

  const handleReorder = useCallback(
    (movedId: string, targetId: string, placement: 'before' | 'after') => {
      const current = draftOrder ?? orderedTaskTypes.map((t) => t.id);
      const next = moveRecordId(current, movedId, targetId, placement);
      if (next !== null) setDraftOrder(next);
    },
    [draftOrder, orderedTaskTypes],
  );

  const handleNudge = useCallback(
    (id: string, direction: 'up' | 'down') => {
      const current = draftOrder ?? orderedTaskTypes.map((t) => t.id);
      const index = current.indexOf(id);
      if (index === -1) return;
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= current.length) return;
      const next = [...current];
      const [moved] = next.splice(index, 1);
      if (moved) {
        next.splice(targetIndex, 0, moved);
        setDraftOrder(next);
      }
    },
    [draftOrder, orderedTaskTypes],
  );

  function handleSaveOrder() {
    if (!draftOrder) return;
    reorder.mutate(
      { ids: draftOrder },
      {
        onSuccess: () => {
          toast.success(admin.checklist.taskTypes.reorder.saved || 'Task type order saved.');
          setDraftOrder(null);
        },
        onError: reportMutationError,
      },
    );
  }

  function handleToggleActive(type: TaskTypeRecord) {
    if (type.isActive) {
      setDeactivatingTaskType(type);
    } else {
      update.mutate(
        { id: type.id, input: { isActive: true } },
        {
          onSuccess: () => {
            toast.success(`${type.name} activated.`);
          },
          onError: reportMutationError,
        },
      );
    }
  }

  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        title="Manage Task Types"
        description="Task types determine which checklist categories and questions developers receive."
        size="lg"
      >
        <div className="space-y-4">
          {/* Action Header Bar */}
          <div className="flex flex-col gap-2 border-b border-line/60 pb-3.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-ink-500">
              Drag rows using the handle to reorder how task types appear across the portal.
            </p>
            <Button
              size="sm"
              variant="adminPrimary"
              onClick={() => setEditingTaskType(null)}
              className="shrink-0 self-start sm:self-auto"
            >
              <Plus className="size-4" aria-hidden="true" />
              Add Task Type
            </Button>
          </div>

          {/* Unsaved Order Changes Alert */}
          {draftOrder !== null ? (
            <aside
              aria-label="Unsaved ordering changes"
              data-testid="task-type-unsaved-banner"
              className="flex flex-col gap-2.5 rounded-xl border border-amber-300 bg-amber-50/95 p-3.5 shadow-xs sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="size-4 shrink-0 text-amber-800" aria-hidden="true" />
                <div className="text-xs">
                  <span className="font-bold text-amber-900">Unsaved order. </span>
                  <span className="text-amber-800">
                    Keep rearranging as long as you like — nothing is written until you save.
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={reorder.isPending}
                  onClick={() => setDraftOrder(null)}
                  className="h-8 border-amber-300 bg-white text-xs font-semibold text-amber-900 hover:bg-amber-100/60"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="adminPrimary"
                  disabled={reorder.isPending}
                  onClick={handleSaveOrder}
                  className="h-8 px-3 text-xs"
                >
                  <Save className="size-3.5" aria-hidden="true" />
                  {reorder.isPending ? 'Saving...' : 'Save Order'}
                </Button>
              </div>
            </aside>
          ) : null}

          {/* Task Types List Container */}
          {orderedTaskTypes.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line p-10 text-center">
              <Layers className="text-ink-300 mb-2 size-8" aria-hidden="true" />
              <p className="text-sm font-semibold text-ink-900">No task types yet</p>
              <p className="mt-0.5 text-xs text-ink-500">
                Add a task type to begin configuring questions.
              </p>
              <Button
                size="sm"
                variant="adminPrimary"
                onClick={() => setEditingTaskType(null)}
                className="mt-4"
              >
                <Plus className="size-4" aria-hidden="true" />
                Add Task Type
              </Button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-2xs">
              {/* Header */}
              <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3.5 border-b border-line bg-canvas/40 px-4 py-2.5 text-xs font-semibold tracking-wider text-ink-500 uppercase select-none">
                <span className="sr-only w-7">Reorder</span>
                <span>Task Type</span>
                <span className="w-24 text-center">Status</span>
                <span className="w-24 text-right">Actions</span>
              </div>

              {/* Items */}
              <ol className="divide-y divide-line/60">
                {orderedTaskTypes.map((type) => {
                  const qCount = visibleQuestions(categories, [type.id]).length;
                  return (
                    <TaskTypeRow
                      key={type.id}
                      taskType={type}
                      questionCount={qCount}
                      onEdit={() => setEditingTaskType(type)}
                      onToggleActive={() => handleToggleActive(type)}
                      onDelete={() => {
                        setDeletingTaskType(type);
                        setDeleteError(null);
                      }}
                      onReorder={handleReorder}
                      onNudge={(direction) => handleNudge(type.id, direction)}
                    />
                  );
                })}
              </ol>
            </div>
          )}
        </div>
      </Dialog>

      {/* Add / Edit Task Type Dialog */}
      {editingTaskType !== undefined ? (
        <TaskTypeFormDialog
          initial={editingTaskType}
          isPending={create.isPending || update.isPending}
          existingNames={taskTypes.map((t) => t.name)}
          onSubmit={(name) => {
            if (editingTaskType === null) {
              create.mutate(
                { name },
                {
                  onSuccess: () => {
                    toast.success(`${name} added.`);
                    setEditingTaskType(undefined);
                  },
                  onError: reportMutationError,
                },
              );
            } else {
              update.mutate(
                { id: editingTaskType.id, input: { name } },
                {
                  onSuccess: () => {
                    toast.success(`${name} updated.`);
                    setEditingTaskType(undefined);
                  },
                  onError: reportMutationError,
                },
              );
            }
          }}
          onClose={() => setEditingTaskType(undefined)}
        />
      ) : null}

      {/* Deactivate Task Type Confirmation Dialog */}
      <ConfirmDialog
        open={deactivatingTaskType !== null}
        onOpenChange={(open) => {
          if (!open) setDeactivatingTaskType(null);
        }}
        title="Deactivate this task type?"
        description={`${deactivatingTaskType?.name ?? ''} can no longer be chosen on new tasks. Existing tasks keep it.`}
        confirmLabel="Deactivate Task Type"
        isPending={update.isPending}
        onConfirm={() => {
          if (!deactivatingTaskType) return;
          const subject = deactivatingTaskType;
          update.mutate(
            { id: subject.id, input: { isActive: false } },
            {
              onSuccess: () => {
                toast.success(`${subject.name} deactivated.`);
                setDeactivatingTaskType(null);
              },
              onError: reportMutationError,
            },
          );
        }}
      />

      {/* Delete Task Type Confirmation Dialog */}
      <ConfirmDialog
        open={deletingTaskType !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeletingTaskType(null);
            setDeleteError(null);
          }
        }}
        title="Delete this task type?"
        description={`${deletingTaskType?.name ?? ''} is removed permanently. This is only possible when no task and no question refers to it.`}
        confirmLabel="Delete Task Type"
        tone="danger"
        isPending={remove.isPending}
        onConfirm={() => {
          if (!deletingTaskType) return;
          const subject = deletingTaskType;
          setDeleteError(null);
          remove.mutate(subject.id, {
            onSuccess: () => {
              toast.success(`${subject.name} deleted.`);
              setDeletingTaskType(null);
            },
            onError: (cause) => {
              setDeleteError(
                cause instanceof ApiError
                  ? cause.message
                  : cause instanceof Error
                    ? cause.message
                    : 'Could not delete task type.',
              );
            },
          });
        }}
      >
        {deleteError ? (
          <p role="alert" className="mt-2 text-sm text-danger">
            {deleteError}
          </p>
        ) : null}
      </ConfirmDialog>
    </>
  );
}
