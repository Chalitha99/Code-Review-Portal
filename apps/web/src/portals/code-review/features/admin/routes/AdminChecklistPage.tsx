import { useMemo } from 'react';
import { ClipboardCheck, HelpCircle, Layers, ListChecks } from 'lucide-react';
import { Alert } from '@/components/ui/Alert.tsx';
import { Button } from '@/components/ui/Button.tsx';
import admin from '@/content/admin.json';
import { useAdminChecklistTemplate, useAdminTaskTypes } from '../api/checklistAdmin.ts';
import { UnifiedChecklistEditor } from '../components/UnifiedChecklistEditor.tsx';

/** The single category-first Quality Checklist administration screen. */
export function AdminChecklistPage() {
  const template = useAdminChecklistTemplate();
  const taskTypes = useAdminTaskTypes();

  const retry = () => {
    void template.refetch();
    void taskTypes.refetch();
  };

  const error = template.error ?? taskTypes.error;

  const categories = useMemo(() => template.data ?? [], [template.data]);
  const types = useMemo(() => taskTypes.data ?? [], [taskTypes.data]);

  const metrics = useMemo(() => {
    const activeCategories = categories.filter((c) => c.isActive);
    const allQuestions = categories.flatMap((c) => c.questions);
    const activeQuestions = activeCategories.flatMap((c) => c.questions.filter((q) => q.isActive));
    const activeTaskTypes = types.filter((t) => t.isActive);

    return {
      totalCategories: categories.length,
      activeCategories: activeCategories.length,
      totalQuestions: allQuestions.length,
      activeQuestions: activeQuestions.length,
      activeTaskTypes: activeTaskTypes.length,
    };
  }, [categories, types]);

  if (template.isPending || taskTypes.isPending) {
    return (
      <section aria-labelledby="admin-checklist-heading" className="space-y-6">
        <div className="flex items-start gap-4">
          <div className="size-12 animate-pulse rounded-2xl bg-canvas" />
          <div className="flex-1 space-y-2">
            <h2
              id="admin-checklist-heading"
              className="font-display text-xl font-bold text-ink-900"
            >
              {admin.checklist.title}
            </h2>
            <div className="h-4 w-72 animate-pulse rounded bg-canvas" />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-2xl border border-line bg-surface p-4"
            />
          ))}
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-2xl border border-line bg-surface p-4"
            />
          ))}
        </div>
      </section>
    );
  }

  if (error !== null && error !== undefined) {
    return (
      <section aria-labelledby="admin-checklist-heading" className="space-y-4">
        <h2 id="admin-checklist-heading" className="font-display text-xl font-bold text-ink-900">
          {admin.checklist.title}
        </h2>
        <Alert tone="danger" title="Could not load the checklist">
          An error occurred while fetching the quality checklist structure.
        </Alert>
        <Button variant="adminPrimary" onClick={retry}>
          Try again
        </Button>
      </section>
    );
  }

  return (
    <section aria-labelledby="admin-checklist-heading" className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3.5">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-700 shadow-2xs">
            <ClipboardCheck className="size-6" aria-hidden="true" />
          </div>
          <div>
            <h2
              id="admin-checklist-heading"
              className="font-display text-xl font-bold tracking-tight text-ink-900 sm:text-2xl"
            >
              {admin.checklist.title}
            </h2>
            <p className="mt-0.5 text-sm text-ink-500">
              Organize checklist categories, sequence questions, and configure applicable task
              types.
            </p>
          </div>
        </div>
      </div>

      {/* Checklist Health & Overview Stat Strip */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex items-center gap-3.5 rounded-2xl border border-line bg-surface p-4 shadow-2xs">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
            <ListChecks className="size-5" />
          </div>
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-display text-2xl font-bold text-ink-900">
                {metrics.totalCategories}
              </span>
              <span className="text-xs font-medium text-emerald-700">
                ({metrics.activeCategories} active)
              </span>
            </div>
            <p className="text-xs font-medium text-ink-500">Checklist Categories</p>
          </div>
        </div>

        <div className="flex items-center gap-3.5 rounded-2xl border border-line bg-surface p-4 shadow-2xs">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <HelpCircle className="size-5" />
          </div>
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-display text-2xl font-bold text-ink-900">
                {metrics.totalQuestions}
              </span>
              <span className="text-xs font-medium text-emerald-700">
                ({metrics.activeQuestions} active)
              </span>
            </div>
            <p className="text-xs font-medium text-ink-500">Quality Questions</p>
          </div>
        </div>

        <div className="flex items-center gap-3.5 rounded-2xl border border-line bg-surface p-4 shadow-2xs">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <Layers className="size-5" />
          </div>
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-display text-2xl font-bold text-ink-900">
                {metrics.activeTaskTypes}
              </span>
              <span className="text-xs font-medium text-ink-400">types enabled</span>
            </div>
            <p className="text-xs font-medium text-ink-500">Applicable Task Types</p>
          </div>
        </div>
      </div>

      {/* Immutability Notice Banner */}
      <Alert tone="info">
        Changes made here affect future editable checklists only. Previously submitted checklist
        versions remain frozen and immutable.
      </Alert>

      {/* Main Unified Category & Question Editor */}
      <UnifiedChecklistEditor categories={categories} taskTypes={types} />
    </section>
  );
}
