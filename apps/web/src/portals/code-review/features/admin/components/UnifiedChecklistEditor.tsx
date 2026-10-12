import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import {
  AlertCircle,
  ChevronDown,
  ChevronsUpDown,
  Eye,
  Filter,
  GripVertical,
  Layers,
  ListChecks,
  Pencil,
  Plus,
  Power,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import {
  draggable,
  dropTargetForElements,
} from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import {
  attachClosestEdge,
  extractClosestEdge,
  type Edge,
} from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import type { ChecklistCategory, ChecklistQuestion, TaskTypeRecord } from '@sdp/contracts';
import { cn } from '@/components/ui';
import { ActiveBadge } from '@/portals/code-review/components/badges.tsx';
import { ConfirmDialog } from '@/components/common/ConfirmDialog.tsx';
import { Button } from '@/components/ui/Button.tsx';
import { Checkbox, IconButton } from '@/components/ui/controls.tsx';
import { Dialog } from '@/components/ui/Dialog.tsx';
import { Select } from '@/components/ui/Select.tsx';
import { visibleCategories } from '@/lib/checklistVisibility.ts';
import { moveRecordId } from '@/lib/checklistOrdering.ts';
import {
  useCreateCategory,
  useDeleteCategory,
  useDeleteQuestion,
  useReorderCategories,
  useReorderQuestions,
  useUpdateCategory,
} from '../api/checklistAdmin.ts';
import { NamedRecordDialog } from './NamedRecordDialog.tsx';
import { QuestionFormDialog } from './QuestionFormDialog.tsx';
import { TaskTypeManager } from './TaskTypeManager.tsx';
import { reportMutationError } from './reportMutationError.ts';

type StatusFilter = 'active' | 'inactive' | 'all';
type QuestionTarget = { question: ChecklistQuestion | null; categoryId: string } | null;

/** Visual insertion indicator line with a subtle 'Drop here' badge */
function DropIndicator({ edge }: { edge: Edge | null }) {
  if (!edge) return null;
  return (
    <div
      aria-hidden="true"
      data-testid="drop-indicator"
      className={cn(
        'pointer-events-none absolute right-0 left-0 z-30 flex items-center',
        edge === 'top' ? '-top-2' : '-bottom-2',
      )}
    >
      <div className="size-3.5 rounded-full border-2 border-violet-600 bg-white shadow-xs" />
      <div className="h-0.5 flex-1 bg-violet-600" />
      <span className="rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-bold tracking-wider text-white uppercase shadow-xs">
        Drop here
      </span>
      <div className="h-0.5 flex-1 bg-violet-600" />
      <div className="size-3.5 rounded-full border-2 border-violet-600 bg-white shadow-xs" />
    </div>
  );
}

/** Accessible drag handle with keyboard ArrowUp/ArrowDown reorder support */
const ReorderHandle = forwardRef<
  HTMLButtonElement,
  {
    label: string;
    isDragging: boolean;
    onNudge: (direction: 'up' | 'down') => void;
    className?: string;
  }
>(function ReorderHandle({ label, isDragging, onNudge, className }, ref) {
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
        className,
      )}
    >
      <GripVertical className="size-4" aria-hidden="true" />
    </button>
  );
});

function cloneCategories(cats: readonly ChecklistCategory[]): ChecklistCategory[] {
  return cats.map((cat) => ({
    ...cat,
    questions: cat.questions.map((q) => ({ ...q })),
  }));
}

export function UnifiedChecklistEditor({
  categories,
  taskTypes,
}: {
  categories: readonly ChecklistCategory[];
  taskTypes: readonly TaskTypeRecord[];
}) {
  const [search, setSearch] = useState('');
  const [taskTypeId, setTaskTypeId] = useState('');
  const [status, setStatus] = useState<StatusFilter>('active');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [categoryDialog, setCategoryDialog] = useState<ChecklistCategory | null | undefined>(
    undefined,
  );
  const [questionDialog, setQuestionDialog] = useState<QuestionTarget>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [taskTypesOpen, setTaskTypesOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{
    kind: 'category' | 'question';
    id: string;
    name: string;
  } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();
  const deleteQuestion = useDeleteQuestion();
  const reorderCategories = useReorderCategories();
  const reorderQuestions = useReorderQuestions();

  const activeTypes = useMemo(
    () => taskTypes.filter((type) => type.isActive).sort((a, b) => a.order - b.order),
    [taskTypes],
  );

  const sortedPersistedCategories = useMemo(
    () => [...categories].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)),
    [categories],
  );

  const [draftCategories, setDraftCategories] = useState<ChecklistCategory[]>(() =>
    cloneCategories(sortedPersistedCategories),
  );
  const [isSaving, setIsSaving] = useState(false);

  const isCategoryOrderDirty = useMemo(() => {
    if (draftCategories.length !== sortedPersistedCategories.length) return false;
    return draftCategories.some((cat, idx) => cat.id !== sortedPersistedCategories[idx]?.id);
  }, [draftCategories, sortedPersistedCategories]);

  const dirtyQuestionCategoryIds = useMemo(() => {
    const dirty = new Set<string>();
    for (const cat of draftCategories) {
      const persisted = sortedPersistedCategories.find((p) => p.id === cat.id);
      if (!persisted) continue;
      const sortedDraftQIds = [...cat.questions]
        .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
        .map((q) => q.id);
      const sortedPersistedQIds = [...persisted.questions]
        .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
        .map((q) => q.id);
      if (
        sortedDraftQIds.length === sortedPersistedQIds.length &&
        sortedDraftQIds.some((id, idx) => id !== sortedPersistedQIds[idx])
      ) {
        dirty.add(cat.id);
      }
    }
    return dirty;
  }, [draftCategories, sortedPersistedCategories]);

  const isDirty = isCategoryOrderDirty || dirtyQuestionCategoryIds.size > 0;

  // Keep the draft in sync with the persisted categories while no reorder is pending.
  const [draftSource, setDraftSource] = useState(sortedPersistedCategories);
  if (!isDirty && draftSource !== sortedPersistedCategories) {
    setDraftSource(sortedPersistedCategories);
    setDraftCategories(cloneCategories(sortedPersistedCategories));
  }

  // Warn if navigating away with unsaved ordering changes
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isDirty]);

  const needle = search.trim().toLowerCase();

  const displayed = useMemo(
    () =>
      draftCategories.filter((category) => {
        const statusMatch =
          status === 'all' || (status === 'active' ? category.isActive : !category.isActive);
        const taskTypeMatch =
          taskTypeId === '' || category.applicableTaskTypeIds.includes(taskTypeId);
        const searchMatch =
          needle === '' ||
          category.name.toLowerCase().includes(needle) ||
          category.questions.some((q) => q.text.toLowerCase().includes(needle));
        return statusMatch && taskTypeMatch && searchMatch;
      }),
    [draftCategories, status, taskTypeId, needle],
  );

  // Auto-expand every match while searching (adjusted during render, keyed on the result set).
  const searchExpandKey = needle === '' ? '' : `${needle}::${displayed.map((c) => c.id).join('|')}`;
  const [expandedForSearch, setExpandedForSearch] = useState('');
  if (searchExpandKey !== expandedForSearch) {
    setExpandedForSearch(searchExpandKey);
    if (needle !== '') {
      setExpanded((current) => new Set([...current, ...displayed.map((c) => c.id)]));
    }
  }

  // Expand the first category initially for friendly scanning
  const [initializedOpenState, setInitializedOpenState] = useState(false);
  if (!initializedOpenState && displayed[0] !== undefined) {
    setInitializedOpenState(true);
    setExpanded(new Set([displayed[0].id]));
  }

  function toggle(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function expandAll() {
    setExpanded(new Set(displayed.map((c) => c.id)));
  }

  function collapseAll() {
    setExpanded(new Set());
  }

  function clearFilters() {
    setSearch('');
    setTaskTypeId('');
    setStatus('active');
  }

  const isFiltered = search !== '' || taskTypeId !== '' || status !== 'active';

  const totalQuestionsCount = useMemo(
    () => displayed.reduce((sum, c) => sum + c.questions.length, 0),
    [displayed],
  );

  function reorderCategory(movedId: string, targetId: string, placement: 'before' | 'after') {
    if (isSaving || movedId === targetId) return;
    const visibleIds = displayed.map((c) => c.id);
    const newVisibleIds = moveRecordId(visibleIds, movedId, targetId, placement);
    const slots: number[] = [];
    draftCategories.forEach((cat, index) => {
      if (visibleIds.includes(cat.id)) slots.push(index);
    });
    const nextCategories = [...draftCategories];
    slots.forEach((slotIndex, k) => {
      nextCategories[slotIndex] = draftCategories.find((c) => c.id === newVisibleIds[k])!;
    });
    const canonicalWithUpdatedOrder = nextCategories.map((cat, idx) => ({
      ...cat,
      order: idx + 1,
    }));
    setDraftCategories(canonicalWithUpdatedOrder);
  }

  function nudgeCategory(categoryId: string, direction: 'up' | 'down') {
    if (isSaving) return;
    const visibleIds = displayed.map((c) => c.id);
    const index = visibleIds.indexOf(categoryId);
    if (index === -1) return;
    if (direction === 'up' && index > 0) {
      reorderCategory(categoryId, visibleIds[index - 1]!, 'before');
    } else if (direction === 'down' && index < visibleIds.length - 1) {
      reorderCategory(categoryId, visibleIds[index + 1]!, 'after');
    }
  }

  function reorderQuestion(
    category: ChecklistCategory,
    movedId: string,
    targetId: string,
    placement: 'before' | 'after',
  ) {
    if (isSaving || movedId === targetId) return;
    const visibleQuestions = category.questions
      .filter((q) => status === 'all' || (status === 'active' ? q.isActive : !q.isActive))
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    const visibleIds = visibleQuestions.map((q) => q.id);
    const newVisibleIds = moveRecordId(visibleIds, movedId, targetId, placement);

    const allQuestions = [...category.questions].sort(
      (a, b) => a.order - b.order || a.id.localeCompare(b.id),
    );
    const slots: number[] = [];
    allQuestions.forEach((q, idx) => {
      if (visibleIds.includes(q.id)) slots.push(idx);
    });
    const nextQuestions = [...allQuestions];
    slots.forEach((slotIdx, k) => {
      nextQuestions[slotIdx] = allQuestions.find((q) => q.id === newVisibleIds[k])!;
    });
    const updatedQuestions = nextQuestions.map((q, idx) => ({ ...q, order: idx + 1 }));

    setDraftCategories((current) =>
      current.map((cat) =>
        cat.id === category.id ? { ...cat, questions: updatedQuestions } : cat,
      ),
    );
  }

  function nudgeQuestion(
    category: ChecklistCategory,
    questionId: string,
    direction: 'up' | 'down',
  ) {
    if (isSaving) return;
    const visibleQuestions = category.questions
      .filter((q) => status === 'all' || (status === 'active' ? q.isActive : !q.isActive))
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    const visibleIds = visibleQuestions.map((q) => q.id);
    const index = visibleIds.indexOf(questionId);
    if (index === -1) return;
    if (direction === 'up' && index > 0) {
      reorderQuestion(category, questionId, visibleIds[index - 1]!, 'before');
    } else if (direction === 'down' && index < visibleIds.length - 1) {
      reorderQuestion(category, questionId, visibleIds[index + 1]!, 'after');
    }
  }

  async function handleSave() {
    setIsSaving(true);
    try {
      if (isCategoryOrderDirty) {
        await reorderCategories.mutateAsync({ ids: draftCategories.map((c) => c.id) });
      }
      for (const catId of dirtyQuestionCategoryIds) {
        const cat = draftCategories.find((c) => c.id === catId);
        if (cat) {
          const sortedQIds = [...cat.questions]
            .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
            .map((q) => q.id);
          await reorderQuestions.mutateAsync({ categoryId: cat.id, ids: sortedQIds });
        }
      }
      toast.success('Checklist order saved.');
    } catch (cause) {
      reportMutationError(cause);
    } finally {
      setIsSaving(false);
    }
  }

  function handleDiscard() {
    setDraftCategories(cloneCategories(sortedPersistedCategories));
    toast.success('Changes discarded.');
  }

  return (
    <>
      <div className="space-y-4">
        {/* Structured Toolbar Card */}
        <div className="space-y-3.5 rounded-2xl border border-line bg-surface p-4 shadow-xs">
          {/* Primary Controls Row: Search + Filters + Actions */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            {/* Search & Filters Group */}
            <div className="flex flex-1 flex-wrap items-center gap-2.5">
              {/* Search Bar */}
              <label className="relative min-w-64 flex-1">
                <span className="sr-only">Search categories or questions</span>
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-400" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search categories or questions..."
                  className="h-10 w-full rounded-control border border-line-strong bg-surface py-2 pr-9 pl-9 text-sm text-ink-900 transition-colors placeholder:text-ink-400 focus-visible:outline-2 focus-visible:outline-violet-600"
                />
                {search ? (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded p-1 text-ink-400 hover:text-ink-700"
                    aria-label="Clear search"
                  >
                    <X className="size-3.5" />
                  </button>
                ) : null}
              </label>

              {/* Task Type Filter Dropdown */}
              <div className="w-48">
                <Select
                  value={taskTypeId}
                  onValueChange={setTaskTypeId}
                  aria-label="Task Type filter"
                  options={[
                    { value: '', label: 'Task Type: All' },
                    ...activeTypes.map((type) => ({ value: type.id, label: type.name })),
                  ]}
                />
              </div>

              {/* Status Filter Dropdown */}
              <div className="w-36">
                <Select
                  value={status}
                  onValueChange={(value) => setStatus(value as StatusFilter)}
                  aria-label="Status filter"
                  options={[
                    { value: 'active', label: 'Active' },
                    { value: 'inactive', label: 'Inactive' },
                    { value: 'all', label: 'All' },
                  ]}
                />
              </div>
            </div>

            {/* Action Buttons Group */}
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                onClick={() => setPreviewOpen(true)}
                className="gap-1.5 text-ink-700"
              >
                <Eye className="size-4 text-ink-400" aria-hidden="true" />
                Preview Checklist
              </Button>

              <Button
                variant="secondary"
                onClick={() => setTaskTypesOpen(true)}
                className="gap-1.5 text-ink-700"
              >
                <Layers className="size-4 text-ink-400" aria-hidden="true" />
                Manage Task Types
              </Button>

              <Button variant="adminPrimary" onClick={() => setCategoryDialog(null)}>
                <Plus className="size-4" aria-hidden="true" />
                Add Category
              </Button>
            </div>
          </div>

          {/* Sub-bar: Summary Counts & Expand/Collapse Toggles */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/60 pt-3 text-xs text-ink-500">
            <div className="flex items-center gap-2">
              <span>
                Showing <strong className="font-semibold text-ink-900">{displayed.length}</strong>{' '}
                of {draftCategories.length} categories ({totalQuestionsCount} questions)
              </span>
              {isFiltered ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 font-medium text-violet-700">
                  <Filter className="size-3" /> Filtered
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="ml-1 cursor-pointer font-semibold text-violet-800 hover:underline"
                  >
                    Clear
                  </button>
                </span>
              ) : null}
            </div>

            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={expandAll}
                className="text-ink-600 h-7 gap-1 px-2 text-xs hover:text-ink-900"
              >
                <ChevronsUpDown className="size-3 text-ink-400" />
                Expand All
              </Button>
              <span className="text-line-strong">|</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={collapseAll}
                className="text-ink-600 h-7 px-2 text-xs hover:text-ink-900"
              >
                Collapse All
              </Button>
            </div>
          </div>
        </div>

        {/* Unsaved Changes Banner */}
        {isDirty ? (
          <aside
            aria-label="Unsaved ordering changes"
            data-testid="unsaved-changes-banner"
            className="sticky top-3 z-30 flex flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50/95 p-3.5 shadow-md backdrop-blur-xs sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
                <AlertCircle className="size-4" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xs font-bold text-amber-900">Unsaved changes</p>
                <p className="text-xs text-amber-800/90">
                  Category or question order has been modified.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={isSaving}
                onClick={handleDiscard}
                className="h-8 border-amber-300 bg-white text-xs font-semibold text-amber-900 hover:bg-amber-100/60"
              >
                Discard Changes
              </Button>
              <Button
                type="button"
                size="sm"
                variant="adminPrimary"
                disabled={isSaving}
                onClick={() => {
                  void handleSave();
                }}
                className="h-8 px-3.5 text-xs"
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </aside>
        ) : null}

        {/* Categories List */}
        <div className="space-y-3.5">
          {displayed.map((category) => {
            const persistedCategory = sortedPersistedCategories.find((p) => p.id === category.id);
            const persistedCatIndex = sortedPersistedCategories.findIndex(
              (p) => p.id === category.id,
            );
            const draftCatIndex = draftCategories.findIndex((d) => d.id === category.id);
            const isCategoryChanged =
              persistedCatIndex !== -1 && persistedCatIndex !== draftCatIndex;

            return (
              <CategoryCard
                key={category.id}
                category={category}
                taskTypes={taskTypes}
                status={status}
                isOpen={expanded.has(category.id)}
                isChanged={isCategoryChanged}
                persistedQuestions={persistedCategory?.questions ?? []}
                onToggle={() => toggle(category.id)}
                onEdit={() => setCategoryDialog(category)}
                onToggleActive={() =>
                  updateCategory.mutate(
                    { id: category.id, input: { isActive: !category.isActive } },
                    {
                      onSuccess: () =>
                        toast.success(
                          category.isActive ? 'Category deactivated.' : 'Category activated.',
                        ),
                      onError: reportMutationError,
                    },
                  )
                }
                onDelete={() =>
                  setPendingDelete({ kind: 'category', id: category.id, name: category.name })
                }
                onAddQuestion={() => setQuestionDialog({ question: null, categoryId: category.id })}
                onEditQuestion={(question) =>
                  setQuestionDialog({ question, categoryId: category.id })
                }
                onDeleteQuestion={(question) =>
                  setPendingDelete({ kind: 'question', id: question.id, name: question.text })
                }
                onReorderCategory={reorderCategory}
                onNudgeCategory={(direction) => nudgeCategory(category.id, direction)}
                onReorderQuestion={reorderQuestion}
                onNudgeQuestion={nudgeQuestion}
              />
            );
          })}

          {displayed.length === 0 ? (
            <div className="space-y-3 rounded-2xl border border-dashed border-line bg-surface p-12 text-center text-sm text-ink-500">
              <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-canvas text-ink-400">
                <Search className="size-6" />
              </div>
              <div>
                <p className="font-semibold text-ink-900">
                  No categories or questions match your filters
                </p>
                <p className="mt-1 text-xs text-ink-500">
                  Try modifying your search term or filter selections.
                </p>
              </div>
              <Button size="sm" variant="secondary" onClick={clearFilters}>
                Clear filters
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      {/* Category Creation / Edit Dialog */}
      {categoryDialog === undefined ? null : (
        <CategoryDialog
          category={categoryDialog}
          taskTypes={taskTypes}
          onClose={() => setCategoryDialog(undefined)}
        />
      )}

      {/* Question Creation / Edit Dialog */}
      {questionDialog === null ? null : (
        <QuestionFormDialog
          question={questionDialog.question}
          categories={draftCategories}
          defaultCategoryId={
            questionDialog.question === null ? questionDialog.categoryId : undefined
          }
          onClose={() => setQuestionDialog(null)}
        />
      )}

      {/* Task Type Manager Dialog */}
      {taskTypesOpen ? (
        <TaskTypeManager
          taskTypes={taskTypes}
          categories={draftCategories}
          onClose={() => setTaskTypesOpen(false)}
        />
      ) : null}

      {/* Deletion Confirmation Dialog */}
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(null);
            setDeleteError(null);
          }
        }}
        title={pendingDelete?.kind === 'category' ? 'Delete category?' : 'Delete question?'}
        description={
          pendingDelete?.kind === 'category'
            ? 'Categories containing questions cannot be safely deleted. Deactivate the category instead.'
            : 'This action cannot be undone unless the question is protected by checklist history.'
        }
        confirmLabel={pendingDelete?.kind === 'category' ? 'Delete Category' : 'Delete Question'}
        isPending={deleteCategory.isPending || deleteQuestion.isPending}
        onConfirm={() => {
          if (pendingDelete === null) return;
          const mutation = pendingDelete.kind === 'category' ? deleteCategory : deleteQuestion;
          mutation.mutate(pendingDelete.id, {
            onSuccess: () => {
              toast.success('Deleted.');
              setPendingDelete(null);
            },
            onError: (cause) =>
              setDeleteError(
                cause instanceof Error ? cause.message : 'Could not delete this record.',
              ),
          });
        }}
      >
        {deleteError === null ? null : (
          <p role="alert" className="text-sm text-danger">
            {deleteError}
          </p>
        )}
      </ConfirmDialog>

      {/* Checklist Preview Dialog */}
      {previewOpen ? (
        <PreviewChecklistDialog
          categories={draftCategories}
          taskTypes={activeTypes}
          onClose={() => setPreviewOpen(false)}
        />
      ) : null}

      {/* Navigation Blocker Confirmation Dialog */}
      <ConfirmDialog
        open={blocker.state === 'blocked'}
        onOpenChange={(open) => {
          if (!open) blocker.reset?.();
        }}
        title="Discard unsaved changes?"
        description="You have unsaved checklist ordering changes. If you leave this page, your changes will be discarded."
        confirmLabel="Discard & Leave"
        cancelLabel="Stay on Page"
        tone="danger"
        onConfirm={() => {
          blocker.proceed?.();
        }}
      />
    </>
  );
}

function QuestionRow({
  question,
  index,
  categoryId,
  isChanged,
  onEdit,
  onDelete,
  onReorder,
  onNudge,
}: {
  question: ChecklistQuestion;
  index: number;
  categoryId: string;
  isChanged?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onReorder: (movedId: string, targetId: string, placement: 'before' | 'after') => void;
  onNudge: (direction: 'up' | 'down') => void;
}) {
  const rowRef = useRef<HTMLLIElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);
  const [isDragging, setDragging] = useState(false);
  const [edge, setEdge] = useState<Edge | null>(null);

  useEffect(() => {
    const element = rowRef.current;
    const handle = handleRef.current;
    if (!element || !handle) return;

    return combine(
      draggable({
        element,
        dragHandle: handle,
        getInitialData: () => ({ type: 'question', categoryId, id: question.id }),
        onDragStart: () => setDragging(true),
        onDrop: () => setDragging(false),
      }),
      dropTargetForElements({
        element,
        canDrop: ({ source }) => {
          return (
            source.data['type'] === 'question' &&
            source.data['categoryId'] === categoryId &&
            source.data['id'] !== question.id
          );
        },
        getData: ({ input }) =>
          attachClosestEdge(
            { id: question.id },
            { element, input, allowedEdges: ['top', 'bottom'] },
          ),
        onDrag: ({ self }) => {
          setEdge(extractClosestEdge(self.data));
        },
        onDragLeave: () => {
          setEdge(null);
        },
        onDrop: ({ self, source }) => {
          setEdge(null);
          const movedId = source.data['id'];
          if (typeof movedId !== 'string' || source.data['type'] !== 'question') return;
          const dropEdge = extractClosestEdge(self.data);
          onReorder(movedId, question.id, dropEdge === 'top' ? 'before' : 'after');
        },
      }),
    );
  }, [categoryId, question.id, onReorder]);

  return (
    <li
      ref={rowRef}
      className={cn(
        'group relative flex items-start gap-3 rounded-xl border bg-surface px-4 py-3 text-sm shadow-2xs transition-all duration-150',
        'hover:border-line hover:shadow-xs',
        isDragging
          ? 'border-dashed border-violet-400 bg-violet-50/20 opacity-30 shadow-none'
          : !question.isActive
            ? 'border-line/60 bg-canvas/60 text-ink-500'
            : 'border-line/60',
      )}
    >
      <DropIndicator edge={edge} />

      <ReorderHandle
        ref={handleRef}
        label={`Reorder question ${index + 1}: ${question.text}`}
        isDragging={isDragging}
        onNudge={onNudge}
        className="mt-0.5"
      />

      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-line/60 bg-canvas font-mono text-[11px] font-bold text-ink-500 select-none">
        {index + 1}
      </span>

      <div className="min-w-0 flex-1 pr-2">
        <p className="text-sm leading-relaxed font-medium break-words whitespace-normal text-ink-900">
          {question.text}
        </p>
      </div>

      {isChanged ? (
        <span
          data-testid="question-changed-badge"
          className="shrink-0 rounded bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200/80 select-none"
        >
          Changed
        </span>
      ) : null}

      {!question.isActive ? (
        <span className="shrink-0 rounded border border-line/40 bg-canvas px-2 py-0.5 text-[11px] font-medium text-ink-500 select-none">
          Inactive
        </span>
      ) : null}

      <div className="flex shrink-0 items-center gap-1 opacity-70 transition-opacity group-hover:opacity-100">
        <IconButton
          label={'Edit question: ' + question.text}
          icon={<Pencil className="size-3.5" />}
          size="sm"
          onClick={onEdit}
          title="Edit question text and position"
        />
        <IconButton
          label={'Delete question: ' + question.text}
          icon={<Trash2 className="size-3.5" />}
          tone="danger"
          size="sm"
          onClick={onDelete}
          title="Delete question"
        />
      </div>
    </li>
  );
}

function CategoryCard(props: {
  category: ChecklistCategory;
  taskTypes: readonly TaskTypeRecord[];
  status: StatusFilter;
  isOpen: boolean;
  isChanged?: boolean;
  persistedQuestions?: readonly ChecklistQuestion[];
  onToggle: () => void;
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
  onAddQuestion: () => void;
  onEditQuestion: (question: ChecklistQuestion) => void;
  onDeleteQuestion: (question: ChecklistQuestion) => void;
  onReorderCategory: (movedId: string, targetId: string, placement: 'before' | 'after') => void;
  onNudgeCategory: (direction: 'up' | 'down') => void;
  onReorderQuestion: (
    category: ChecklistCategory,
    movedId: string,
    targetId: string,
    placement: 'before' | 'after',
  ) => void;
  onNudgeQuestion: (
    category: ChecklistCategory,
    questionId: string,
    direction: 'up' | 'down',
  ) => void;
}) {
  const { category, onReorderCategory } = props;
  const cardRef = useRef<HTMLElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);
  const [isDragging, setDragging] = useState(false);
  const [edge, setEdge] = useState<Edge | null>(null);

  useEffect(() => {
    const element = cardRef.current;
    const handle = handleRef.current;
    if (!element || !handle) return;

    return combine(
      draggable({
        element,
        dragHandle: handle,
        getInitialData: () => ({ type: 'category', id: category.id }),
        onDragStart: () => setDragging(true),
        onDrop: () => setDragging(false),
      }),
      dropTargetForElements({
        element,
        canDrop: ({ source }) => {
          return source.data['type'] === 'category' && source.data['id'] !== category.id;
        },
        getData: ({ input }) =>
          attachClosestEdge(
            { id: category.id },
            { element, input, allowedEdges: ['top', 'bottom'] },
          ),
        onDrag: ({ self }) => {
          setEdge(extractClosestEdge(self.data));
        },
        onDragLeave: () => {
          setEdge(null);
        },
        onDrop: ({ self, source }) => {
          setEdge(null);
          const movedId = source.data['id'];
          if (typeof movedId !== 'string' || source.data['type'] !== 'category') return;
          const dropEdge = extractClosestEdge(self.data);
          onReorderCategory(movedId, category.id, dropEdge === 'top' ? 'before' : 'after');
        },
      }),
    );
  }, [category.id, onReorderCategory]);

  const questions = category.questions
    .filter((q) => props.status === 'all' || (props.status === 'active' ? q.isActive : !q.isActive))
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));

  const sortedPersistedQIds = useMemo(
    () =>
      [...(props.persistedQuestions ?? [])]
        .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
        .map((q) => q.id),
    [props.persistedQuestions],
  );

  const allDraftQuestions = useMemo(
    () => [...category.questions].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)),
    [category.questions],
  );

  return (
    <section
      ref={cardRef}
      className={cn(
        'relative overflow-visible rounded-2xl border bg-surface shadow-xs transition-all duration-200',
        isDragging
          ? 'border-dashed border-violet-400 bg-violet-50/20 opacity-30 shadow-none'
          : !category.isActive
            ? 'border-line bg-canvas/30 opacity-80 hover:border-line-strong hover:shadow-card'
            : 'border-line hover:border-line-strong hover:shadow-card',
      )}
    >
      <DropIndicator edge={edge} />

      {/* Category Header Bar */}
      {/* Pointer shortcut only: the chevron button below is the accessible toggle. */}
      <header
        role="presentation"
        onClick={props.onToggle}
        className="flex min-w-0 cursor-pointer items-center justify-between gap-3 rounded-2xl bg-surface p-4 transition-colors select-none hover:bg-canvas/30 sm:p-5"
      >
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {/* Drag Handle */}
          <ReorderHandle
            ref={handleRef}
            label={`Reorder category: ${category.name}`}
            isDragging={isDragging}
            onNudge={props.onNudgeCategory}
            className="mt-0.5"
          />

          {/* Expand/Collapse Chevron Button */}
          <button
            type="button"
            aria-expanded={props.isOpen}
            aria-label={(props.isOpen ? 'Collapse ' : 'Expand ') + category.name}
            onClick={(e) => {
              e.stopPropagation();
              props.onToggle();
            }}
            className="hover:bg-canvas-strong mt-0.5 grid size-7 shrink-0 cursor-pointer place-items-center rounded-lg bg-canvas text-ink-500 transition-colors hover:text-ink-900"
          >
            <ChevronDown
              className={`size-4 transition-transform duration-200 ${
                props.isOpen ? 'rotate-0' : '-rotate-90'
              }`}
            />
          </button>

          {/* Category Info Stack */}
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-base font-bold text-ink-900 transition-colors">
                {category.name}
              </h3>
              <span className="rounded-md border border-line/60 bg-canvas px-1.5 py-0.5 font-mono text-[11px] font-semibold text-ink-400">
                #{category.order}
              </span>
              {props.isChanged ? (
                <span
                  data-testid="category-changed-badge"
                  className="inline-flex items-center rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200/80 select-none"
                >
                  Changed
                </span>
              ) : null}
              <ActiveBadge isActive={category.isActive} />
              <span className="text-ink-600 inline-flex items-center gap-1 rounded-full border border-line/50 bg-canvas/80 px-2.5 py-0.5 text-xs font-medium">
                <ListChecks className="size-3 text-violet-600" />
                {category.questions.length}{' '}
                {category.questions.length === 1 ? 'question' : 'questions'}
              </span>
            </div>

            {/* Linked Task Types Chips */}
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <span className="text-[11px] font-semibold tracking-wider text-ink-400 uppercase">
                Applies to:
              </span>
              {category.applicableTaskTypeIds.length === 0 ? (
                <span className="text-xs text-ink-400 italic">None configured</span>
              ) : (
                category.applicableTaskTypeIds.map((id) => (
                  <span
                    key={id}
                    className="inline-flex items-center rounded-md bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-violet-200/60"
                  >
                    {props.taskTypes.find((type) => type.id === id)?.name ?? id}
                  </span>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Category Row Action Controls */}
        <div
          role="presentation"
          onClick={(e) => e.stopPropagation()}
          className="flex shrink-0 items-center gap-1"
        >
          <IconButton
            label={'Edit category: ' + category.name}
            icon={<Pencil className="size-4" />}
            size="sm"
            onClick={props.onEdit}
            title="Edit category name and task types"
          />
          <IconButton
            label={(category.isActive ? 'Deactivate' : 'Activate') + ' category: ' + category.name}
            icon={<Power className="size-4" />}
            tone={category.isActive ? 'neutral' : 'success'}
            size="sm"
            onClick={props.onToggleActive}
            title={category.isActive ? 'Deactivate this category' : 'Activate this category'}
          />
          <IconButton
            label={'Delete category: ' + category.name}
            icon={<Trash2 className="size-4" />}
            tone="danger"
            size="sm"
            onClick={props.onDelete}
            title="Permanently delete category"
          />
        </div>
      </header>

      {/* Expanded Questions Section */}
      {!props.isOpen ? null : (
        <div className="space-y-3 border-t border-line/70 bg-canvas/25 px-5 py-4">
          <div className="flex items-center justify-between text-xs font-semibold tracking-wider text-ink-500 uppercase">
            <span>Questions ({questions.length})</span>
            <span className="text-[11px] font-normal text-ink-400">
              Drag handle or use Arrow keys to reorder inside category
            </span>
          </div>

          {questions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line bg-surface/60 px-4 py-7 text-center text-sm text-ink-500">
              No questions in this category yet. Add the first question below.
            </div>
          ) : (
            <ol className="space-y-2.5 py-1">
              {questions.map((question, index) => {
                const draftQIndex = allDraftQuestions.findIndex((q) => q.id === question.id);
                const persistedQIndex = sortedPersistedQIds.indexOf(question.id);
                const isQuestionChanged = persistedQIndex !== -1 && persistedQIndex !== draftQIndex;

                return (
                  <QuestionRow
                    key={question.id}
                    question={question}
                    index={index}
                    categoryId={category.id}
                    isChanged={isQuestionChanged}
                    onEdit={() => props.onEditQuestion(question)}
                    onDelete={() => props.onDeleteQuestion(question)}
                    onReorder={(movedId, targetId, placement) =>
                      props.onReorderQuestion(category, movedId, targetId, placement)
                    }
                    onNudge={(direction) => props.onNudgeQuestion(category, question.id, direction)}
                  />
                );
              })}
            </ol>
          )}

          <Button variant="adminPrimary" size="sm" fullWidth onClick={props.onAddQuestion}>
            <Plus className="size-4" aria-hidden="true" />
            Add Question
          </Button>
        </div>
      )}
    </section>
  );
}

function CategoryDialog({
  category,
  taskTypes,
  onClose,
}: {
  category: ChecklistCategory | null;
  taskTypes: readonly TaskTypeRecord[];
  onClose: () => void;
}) {
  const create = useCreateCategory();
  const update = useUpdateCategory();

  return (
    <NamedRecordDialog
      title={category === null ? 'Add Category' : 'Edit Category'}
      description="Changes affect future editable checklists only; submitted versions remain unchanged."
      nameLabel="Category Name"
      namePlaceholder="e.g. Reservation"
      orderLabel="Order"
      orderHint="Reorder categories directly in the checklist structure."
      submitLabel={category === null ? 'Add Category' : 'Save'}
      initial={
        category === null
          ? null
          : {
              name: category.name,
              order: category.order,
              questionCount: category.questions.length,
              applicableTaskTypeIds: category.applicableTaskTypeIds,
            }
      }
      taskTypes={taskTypes}
      hideOrder
      isPending={create.isPending || update.isPending}
      onSubmit={(values) => {
        if (category === null) {
          create.mutate(
            {
              name: values.name,
              applicableTaskTypeIds: values.applicableTaskTypeIds ?? [],
            },
            {
              onSuccess: () => {
                toast.success('Category added.');
                onClose();
              },
              onError: reportMutationError,
            },
          );
        } else {
          update.mutate(
            {
              id: category.id,
              input: {
                name: values.name,
                applicableTaskTypeIds: values.applicableTaskTypeIds,
              },
            },
            {
              onSuccess: () => {
                toast.success('Category updated.');
                onClose();
              },
              onError: reportMutationError,
            },
          );
        }
      }}
      onClose={onClose}
    />
  );
}

function PreviewChecklistDialog({
  categories,
  taskTypes,
  onClose,
}: {
  categories: readonly ChecklistCategory[];
  taskTypes: readonly TaskTypeRecord[];
  onClose: () => void;
}) {
  const [selectedTaskTypeIds, setSelectedTaskTypeIds] = useState<string[]>([]);

  const preview = useMemo(
    () => visibleCategories(categories, selectedTaskTypeIds),
    [categories, selectedTaskTypeIds],
  );

  const totalQuestions = useMemo(
    () => preview.reduce((acc, cat) => acc + cat.questions.length, 0),
    [preview],
  );

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Preview Checklist"
      description="Simulate the consolidated quality checklist developers receive for specific task types."
      size="lg"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close Preview
        </Button>
      }
    >
      <div className="space-y-6">
        {/* Task Type Selection Area */}
        <fieldset>
          <div className="flex items-center justify-between">
            <legend className="text-sm font-semibold text-ink-900">
              Select Task Types to Preview
            </legend>
            {selectedTaskTypeIds.length > 0 ? (
              <button
                type="button"
                onClick={() => setSelectedTaskTypeIds([])}
                className="cursor-pointer text-xs font-semibold text-violet-600 hover:text-violet-800 hover:underline"
              >
                Clear selection
              </button>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-ink-500">
            Combine multiple task types to see how overlapping categories deduplicate and merge
            questions.
          </p>

          <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
            {taskTypes.map((type) => {
              const isSelected = selectedTaskTypeIds.includes(type.id);
              return (
                <div
                  key={type.id}
                  className={cn(
                    'cursor-pointer rounded-xl border p-3 transition-all duration-150 select-none',
                    isSelected
                      ? 'border-violet-300 bg-violet-50/70 text-violet-950 shadow-2xs ring-1 ring-violet-200/80'
                      : 'border-line bg-surface text-ink-700 hover:border-line-strong hover:bg-canvas/40',
                  )}
                >
                  <Checkbox
                    label={type.name}
                    checked={isSelected}
                    onCheckedChange={(checked) =>
                      setSelectedTaskTypeIds((current) =>
                        checked ? [...current, type.id] : current.filter((id) => id !== type.id),
                      )
                    }
                    className="w-full cursor-pointer text-sm font-medium"
                  />
                </div>
              );
            })}
          </div>
        </fieldset>

        {/* Consolidated Preview Content */}
        <div className="space-y-4">
          {selectedTaskTypeIds.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong/60 bg-canvas/30 px-6 py-12 text-center">
              <div className="mb-3 flex size-12 items-center justify-center rounded-2xl border border-violet-100 bg-violet-50 text-violet-600">
                <Eye className="size-6 text-violet-600" aria-hidden="true" />
              </div>
              <p className="font-semibold text-ink-900">
                Select one or more task types to preview the checklist.
              </p>
              <p className="mt-1 max-w-sm text-xs text-ink-500">
                Select one or more task types above to preview the resulting unified checklist.
              </p>
            </div>
          ) : (
            <div className="space-y-3.5">
              <div className="flex items-center justify-between px-1 text-xs text-ink-500">
                <span>
                  Result: <strong className="font-semibold text-ink-900">{preview.length}</strong>{' '}
                  {preview.length === 1 ? 'category' : 'categories'} ({totalQuestions}{' '}
                  {totalQuestions === 1 ? 'question' : 'questions'})
                </span>
                <span className="rounded-full border border-violet-100 bg-violet-50 px-2 py-0.5 font-medium text-violet-700">
                  Developer simulation
                </span>
              </div>

              {preview.map((cat) => (
                <section
                  key={cat.id}
                  className="space-y-3 rounded-2xl border border-line bg-surface p-4 shadow-2xs"
                >
                  <div className="flex items-center justify-between border-b border-line pb-2.5">
                    <div className="flex items-center gap-2">
                      <h4 className="font-display text-sm font-bold text-ink-900">{cat.name}</h4>
                      <span className="rounded-md border border-line/60 bg-canvas px-1.5 py-0.5 font-mono text-[11px] font-semibold text-ink-400">
                        #{cat.order}
                      </span>
                    </div>
                    <span className="text-xs font-medium text-ink-500">
                      {cat.questions.length} {cat.questions.length === 1 ? 'question' : 'questions'}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {cat.questions.map((q, idx) => (
                      <div
                        key={q.id}
                        className="flex items-start gap-3 rounded-xl border border-line/60 bg-canvas/30 p-3 text-sm"
                      >
                        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-line/60 bg-surface font-mono text-[11px] font-bold text-ink-400">
                          {idx + 1}
                        </span>
                        <div className="min-w-0 flex-1 space-y-2">
                          <p className="text-ink-800 text-sm leading-relaxed font-medium">
                            {q.text}
                          </p>
                          <div className="flex gap-4 text-xs text-ink-500">
                            <label className="flex cursor-pointer items-center gap-1.5">
                              <input
                                type="radio"
                                name={`preview-${q.id}`}
                                className="size-3.5 text-violet-600"
                              />
                              <span>Yes</span>
                            </label>
                            <label className="flex cursor-pointer items-center gap-1.5">
                              <input
                                type="radio"
                                name={`preview-${q.id}`}
                                className="size-3.5 text-violet-600"
                              />
                              <span>No</span>
                            </label>
                            <label className="flex cursor-pointer items-center gap-1.5">
                              <input
                                type="radio"
                                name={`preview-${q.id}`}
                                className="size-3.5 text-violet-600"
                              />
                              <span>N/A</span>
                            </label>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
