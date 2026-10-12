import { useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronsDownUp,
  ChevronsUpDown,
  ClipboardCheck,
  Filter,
} from 'lucide-react';
import { cn } from '@/components/ui';
import type { TaskChecklist } from '@sdp/contracts';
import {
  ChecklistSection,
  ReadOnlyQuestionRow,
} from '@/portals/code-review/components/checklist.tsx';
import { EmptyState } from '@/components/common/states.tsx';
import { Button } from '@/components/ui/Button.tsx';
import tasks from '@/content/tasks.json';
import { groupStoredAnswers } from '@/lib/storedChecklist.ts';

/**
 * Read-only rendering of a submitted checklist — Task Details, and the
 * reviewer's view of the same task.
 *
 * Renders from the stored checklist ALONE. It takes no template, because each
 * answer carries its own question wording and category name, snapshotted when
 * the developer saved. That is what makes this faithful: an admin rewording,
 * re-categorising or retiring a question afterwards cannot alter what a
 * completed review appears to say, and cannot make rows vanish from it.
 */
export function ChecklistSummary({ checklist }: { checklist: TaskChecklist | null }) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<'all' | 'needs-attention'>('all');

  const answers = useMemo(() => checklist?.answers ?? [], [checklist]);
  const groups = useMemo(() => groupStoredAnswers(answers), [answers]);
  const total = answers.length;
  const needsAttention = answers.filter((entry) => entry.answer === 'No').length;
  const met = total - needsAttention;

  if (checklist === null || total === 0) {
    return <EmptyState title={tasks.detail.noChecklist} />;
  }

  const displayedGroups =
    filter === 'needs-attention' ? groups.filter((group) => group.issueCount > 0) : groups;

  const allExpanded =
    displayedGroups.length > 0 &&
    displayedGroups.every((g) => openSections[g.categoryName] !== false);

  function toggleAll() {
    const nextState: Record<string, boolean> = { ...openSections };
    const target = !allExpanded;
    for (const group of displayedGroups) {
      nextState[group.categoryName] = target;
    }
    setOpenSections(nextState);
  }

  return (
    <div className="space-y-3.5">
      {/* Top Summary & Filters Card */}
      <div className="space-y-3 rounded-xl border border-line bg-canvas/40 p-3 sm:p-3.5">
        {/* Row 1: Badges / Chips Summary */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Badge 1: Answered */}
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200/80 bg-violet-50/70 px-2.5 py-1 text-xs font-semibold text-violet-700 shadow-2xs">
            <ClipboardCheck className="size-3.5 text-violet-600" aria-hidden="true" />
            {total} / {total} Answered
          </span>

          {/* Badge 2: Checks Met */}
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200/80 bg-emerald-50/70 px-2.5 py-1 text-xs font-semibold text-emerald-700 shadow-2xs">
            <CheckCircle2 className="size-3.5 text-emerald-600" aria-hidden="true" />
            {met} Checks Met
          </span>

          {/* Badge 3: Needs Attention */}
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold shadow-2xs transition-colors',
              needsAttention > 0
                ? 'border-amber-300 bg-amber-50 font-bold text-amber-900'
                : 'border-slate-200 bg-surface font-medium text-ink-500',
            )}
          >
            <AlertCircle
              className={cn('size-3.5', needsAttention > 0 ? 'text-amber-600' : 'text-ink-400')}
              aria-hidden="true"
            />
            {needsAttention === 0
              ? '0 Needs Attention'
              : needsAttention === 1
                ? '1 Needs Attention'
                : `${needsAttention} Need Attention`}
          </span>
        </div>

        {/* Row 2: Filter Tabs & Expand / Collapse All */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-line/60 pt-1">
          <div className="inline-flex rounded-lg border border-line bg-surface p-0.5 shadow-2xs">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-all',
                filter === 'all'
                  ? 'bg-canvas text-ink-900 shadow-2xs'
                  : 'hover:text-ink-800 text-ink-500 hover:bg-canvas/50',
              )}
            >
              All Questions ({total})
            </button>
            <button
              type="button"
              onClick={() => setFilter('needs-attention')}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-all',
                filter === 'needs-attention'
                  ? 'bg-amber-100 font-bold text-amber-900 shadow-2xs'
                  : 'hover:text-ink-800 text-ink-500 hover:bg-canvas/50',
              )}
            >
              <Filter className="size-3" aria-hidden="true" />
              Needs Attention ({needsAttention})
            </button>
          </div>

          {displayedGroups.length > 1 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleAll}
              className="text-ink-600 h-7 gap-1.5 text-xs hover:text-ink-900"
            >
              {allExpanded ? (
                <>
                  <ChevronsDownUp className="size-3.5" aria-hidden="true" />
                  Collapse All
                </>
              ) : (
                <>
                  <ChevronsUpDown className="size-3.5" aria-hidden="true" />
                  Expand All
                </>
              )}
            </Button>
          ) : null}
        </div>
      </div>

      {/* Sections List */}
      {filter === 'needs-attention' && needsAttention === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-surface/50 p-6 text-center">
          <CheckCircle2 className="mx-auto mb-1.5 size-6 text-emerald-600" />
          <p className="text-sm font-semibold text-ink-900">All checks addressed</p>
          <p className="mt-0.5 text-xs text-ink-500">
            No checklist items require additional reviewer attention.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {displayedGroups.map((group) => {
            const isOpen = openSections[group.categoryName] ?? true;
            const answersToRender =
              filter === 'needs-attention'
                ? group.answers.filter((entry) => entry.answer === 'No')
                : group.answers;

            return (
              <ChecklistSection
                key={group.categoryName}
                name={group.categoryName}
                questionCount={group.answers.length}
                issueCount={group.issueCount}
                listClassName="divide-y divide-line/60"
                isOpen={isOpen}
                onToggle={() =>
                  setOpenSections((prev) => ({
                    ...prev,
                    [group.categoryName]: !isOpen,
                  }))
                }
              >
                {answersToRender.map((entry) => (
                  <ReadOnlyQuestionRow
                    key={entry.questionId}
                    text={entry.questionText}
                    answer={entry.answer}
                  />
                ))}
              </ChecklistSection>
            );
          })}
        </div>
      )}

      {checklist.remarks.trim() === '' ? null : (
        <section
          aria-labelledby="checklist-remarks"
          className="rounded-xl border border-line bg-surface p-3.5 shadow-2xs"
        >
          <h4
            id="checklist-remarks"
            className="mb-1 text-xs font-bold tracking-wider text-ink-500 uppercase"
          >
            {tasks.detail.fields.remarks}
          </h4>
          {/* Rendered as text, never as HTML — developer remarks are untrusted. */}
          <p className="text-ink-800 text-sm leading-relaxed whitespace-pre-wrap">
            {checklist.remarks}
          </p>
        </section>
      )}
    </div>
  );
}
