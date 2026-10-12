import { useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  ListChecks,
  MessageSquare,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@/components/ui';
import { Tag } from '@/portals/code-review/components/badges.tsx';
import { EditableQuestionRow } from '@/portals/code-review/components/checklist.tsx';
import { ConfirmDialog } from '@/components/common/ConfirmDialog.tsx';
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/Card.tsx';
import { Textarea } from '@/components/ui/controls.tsx';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/states.tsx';
import { interpolate } from '@/lib/formatters.ts';
import tasks from '@/content/tasks.json';
import { checklistProgress, visibleCategories } from '../domain/checklistRules.ts';
import { useChecklistTemplate, useTaskTypes } from '../api/queries.ts';
import { findAnswer, useTaskDraft } from '../hooks/useTaskDraft.ts';

/**
 * Wizard step 2 (screen 23) — the dynamic quality checklist.
 *
 * Which questions appear is decided entirely by `checklistRules.visibleSections`
 * from the selected task types. This component never filters anything itself, so
 * the rule the reviewer's read-only view uses and the rule the developer answers
 * against are literally the same function.
 */
export function WizardChecklistStep() {
  const draft = useTaskDraft();
  const {
    data: template,
    isPending: templatePending,
    isError: templateFailed,
    refetch: refetchTemplate,
  } = useChecklistTemplate();
  const {
    data: taskTypes,
    isPending: taskTypesPending,
    isError: taskTypesFailed,
    refetch: refetchTaskTypes,
  } = useTaskTypes();

  /**
   * Sections collapse (screen 23 puts a chevron on each). Tracked as the set of
   * COLLAPSED ids rather than expanded ones, so a section added to the template
   * later defaults to open — the useful default for a form you must complete.
   */
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  /**
   * Clear All is destructive and unrecoverable — it discards up to 23 answers —
   * so it confirms first.
   *
   * It lives on THIS card, in the FOOTER, below the rows it wipes. Two earlier
   * placements were wrong for the same reason in opposite directions: the
   * Additional Remarks header in the right-hand column put it furthest from the
   * 23 rows it affects, and the card header put it inches from the progress tag,
   * where a rarely-wanted reset competed for attention with the primary flow and
   * read as if it were part of the progress readout. After the questions is
   * where an escape hatch belongs — the reading order is title, progress,
   * questions, then the way out.
   */
  const [confirmingClear, setConfirmingClear] = useState(false);

  if (templatePending || taskTypesPending) return <LoadingState />;

  if (templateFailed || taskTypesFailed) {
    return (
      <ErrorState
        onRetry={() => {
          void Promise.all([refetchTemplate(), refetchTaskTypes()]);
        }}
      />
    );
  }

  const categories = visibleCategories(template ?? [], draft.taskTypeIds);
  const progress = checklistProgress(template ?? [], draft.taskTypeIds, draft.answers);

  /*
    Task types are deliberately NOT part of this test — see `clearAnswers`.

    `progress.answered` rather than `draft.answers.length`, so the button's
    presence and the sentence beside it are counting the same thing. They are not
    the same number: the store keeps answers whose task type was later
    deselected, and `progress` only counts the questions currently on screen. Off
    `draft.answers.length` the footer could appear over a checklist with nothing
    visible answered and announce "Clears the additional remarks" when there are
    no remarks either. Those stale answers are cleared too and are stripped on
    save regardless, so nothing is stranded by counting what the user can see.
  */
  const hasSomethingToClear = progress.answered > 0 || draft.remarks.trim() !== '';

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title={tasks.wizard.checklist.settingsTitle}
          description="Select all applicable task types to load the required quality checklist questions"
        />
        <CardBody className="pt-4">
          <fieldset>
            <legend className="mb-3 text-sm font-semibold text-ink-900">
              {tasks.wizard.checklist.taskType}
              <span aria-hidden="true" className="ml-0.5 text-danger">
                *
              </span>
              <span className="sr-only"> (required)</span>
            </legend>

            {/*
              Checkboxes styled as compact clickable cards with visible square checkboxes.
            */}
            {(taskTypes ?? []).length === 0 ? (
              <EmptyState title={tasks.wizard.checklist.noTaskTypesAvailable} className="py-6" />
            ) : (
              <div className="grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-2.5">
                {(taskTypes ?? []).map((taskType) => {
                  const selected = draft.taskTypeIds.includes(taskType.id);
                  return (
                    <label
                      key={taskType.id}
                      className={cn(
                        'group flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 text-sm transition-all duration-200',
                        'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-violet-600',
                        selected
                          ? 'border-violet-600 bg-violet-50/70 font-semibold text-violet-950'
                          : 'text-ink-800 border-line bg-surface font-normal hover:border-line-strong hover:bg-canvas/50',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => {
                          draft.toggleTaskType(taskType.id);
                        }}
                        className="sr-only"
                      />
                      <span
                        className={cn(
                          'grid size-4.5 shrink-0 place-items-center rounded border transition-all duration-200',
                          selected
                            ? 'border-violet-600 bg-violet-600 text-white'
                            : 'border-line-strong bg-surface group-hover:border-ink-400',
                        )}
                        aria-hidden="true"
                      >
                        {selected ? <Check className="size-3 stroke-[3]" /> : null}
                      </span>
                      <span className="min-w-0 leading-tight">{taskType.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </fieldset>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={tasks.wizard.checklist.questionsTitle}
          description="Answer all required questions before proceeding to the final review step"
          action={
            progress.total === 0 ? null : progress.isComplete ? (
              <Tag className="border border-emerald-200 bg-emerald-50 font-semibold text-emerald-700">
                {tasks.wizard.checklist.allComplete}
              </Tag>
            ) : (
              <Tag className="border border-violet-200 bg-violet-50 font-semibold text-violet-700">
                {interpolate(tasks.wizard.checklist.answeredCount, {
                  answered: progress.answered,
                  total: progress.total,
                })}
              </Tag>
            )
          }
        />
        <CardBody className="space-y-6 pt-4">
          {categories.length === 0 ? (
            <EmptyState
              title={
                (template ?? []).length === 0
                  ? tasks.wizard.checklist.noQuestionsAvailable
                  : tasks.wizard.checklist.noTaskTypes
              }
            />
          ) : (
            categories.map((category) => {
              const categoryProgress = progress.categories.find(
                (entry) => entry.categoryId === category.id,
              );
              const answered = categoryProgress?.answered ?? 0;
              const total = categoryProgress?.total ?? 0;
              const unanswered = total - answered;
              const isCollapsed = collapsed.has(category.id);
              const panelId = `checklist-panel-${category.id}`;

              return (
                <section
                  key={category.id}
                  className="rounded-xl border border-line bg-canvas/30 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-display text-sm font-bold text-ink-900">{category.name}</h3>
                    <div className="flex items-center gap-2">
                      {unanswered === 0 ? (
                        <Tag className="border border-emerald-200 bg-emerald-50 text-xs font-semibold text-emerald-700">
                          {tasks.wizard.checklist.sectionComplete}
                        </Tag>
                      ) : (
                        <Tag className="text-ink-600 border border-line bg-surface text-xs font-medium">
                          {interpolate(tasks.wizard.checklist.sectionUnanswered, {
                            count: unanswered,
                          })}
                        </Tag>
                      )}
                      <button
                        type="button"
                        aria-expanded={!isCollapsed}
                        aria-controls={panelId}
                        onClick={() => {
                          setCollapsed((current) => {
                            const next = new Set(current);
                            if (next.has(category.id)) next.delete(category.id);
                            else next.add(category.id);
                            return next;
                          });
                        }}
                        className="grid size-7 place-items-center rounded-lg text-ink-400 transition-colors hover:bg-canvas hover:text-ink-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
                      >
                        <span className="sr-only">{category.name}</span>
                        <ChevronDown
                          className={cn(
                            'size-4 transition-transform duration-200',
                            isCollapsed && '-rotate-90',
                          )}
                          aria-hidden="true"
                        />
                      </button>
                    </div>
                  </div>

                  {isCollapsed ? null : (
                    <ul id={panelId} className="mt-3.5 space-y-2">
                      {category.questions.map((question, index) => (
                        <EditableQuestionRow
                          key={question.id}
                          index={index + 1}
                          text={question.text}
                          value={findAnswer(draft.answers, question.id)}
                          onValueChange={(answer) => {
                            draft.setAnswer(question.id, answer);
                          }}
                        />
                      ))}
                    </ul>
                  )}
                </section>
              );
            })
          )}
        </CardBody>

        {/*
          `static` overrides CardFooter's `sticky`. The wizard already pins its
          own action bar (Back / Cancel / Save Draft / Next) to the bottom of the
          viewport; a second sticky bar would stack on top of it and cover the
          last question row.
        */}
        {hasSomethingToClear ? (
          <CardFooter className="static justify-between border-t border-line bg-canvas/40 px-5 py-3">
            <p className="min-w-0 text-xs text-ink-500">
              {progress.answered === 0
                ? tasks.wizard.checklist.clearFooterRemarksOnly
                : progress.answered === 1
                  ? tasks.wizard.checklist.clearFooterAnswers
                  : interpolate(tasks.wizard.checklist.clearFooterAnswersPlural, {
                      count: progress.answered,
                    })}
            </p>

            <button
              type="button"
              onClick={() => {
                setConfirmingClear(true);
              }}
              className="group text-ink-600 inline-flex h-8 shrink-0 items-center gap-2 rounded-lg border border-line-strong/80 bg-surface px-3 text-xs font-medium transition-colors duration-200 hover:border-danger/40 hover:bg-danger-surface hover:text-danger focus-visible:border-danger/40 focus-visible:bg-danger-surface focus-visible:text-danger"
            >
              <RotateCcw
                className="size-3.5 transition-transform duration-200 group-hover:-rotate-180 group-focus-visible:-rotate-180"
                aria-hidden="true"
              />
              {tasks.wizard.checklist.clearAll}
            </button>
          </CardFooter>
        ) : null}
      </Card>

      <ConfirmDialog
        open={confirmingClear}
        onOpenChange={setConfirmingClear}
        title={tasks.wizard.checklist.clearConfirmTitle}
        description={tasks.wizard.checklist.clearConfirmBody}
        confirmLabel={tasks.wizard.checklist.clearAll}
        onConfirm={() => {
          draft.clearAnswers();
          setConfirmingClear(false);
        }}
      >
        <p className="text-sm text-ink-700">{tasks.wizard.checklist.clearConfirmDetail}</p>
      </ConfirmDialog>
    </div>
  );
}

/** Section progress and Additional Remarks — the step 2 right column. */
export function ChecklistSidePanels() {
  const draft = useTaskDraft();
  const { data: template } = useChecklistTemplate();
  const progress = checklistProgress(template ?? [], draft.taskTypeIds, draft.answers);

  const percent = progress.total > 0 ? Math.round((progress.answered / progress.total) * 100) : 0;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Section Progress"
          icon={<ListChecks className="size-4 text-violet-600" />}
        />
        <CardBody className="space-y-3 pt-3">
          {/* Overall progress summary & slim bar */}
          <div className="space-y-2 rounded-xl border border-line bg-canvas/40 p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-ink-800 font-semibold">
                {interpolate(tasks.wizard.checklist.answeredCount, {
                  answered: progress.answered,
                  total: progress.total,
                })}
              </span>
              <span
                className={cn(
                  'font-mono font-bold',
                  percent === 100 ? 'text-emerald-600' : 'text-violet-700',
                )}
              >
                {percent}%
              </span>
            </div>
            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-line"
              role="progressbar"
              aria-label={tasks.wizard.checklist.sectionProgressTitle}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              aria-valuetext={interpolate(tasks.wizard.checklist.answeredCount, {
                answered: progress.answered,
                total: progress.total,
              })}
            >
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-300',
                  percent === 100 ? 'bg-emerald-500' : 'bg-violet-600',
                )}
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>

          {/* Compact section rows */}
          {progress.categories.length === 0 ? (
            <p className="py-2 text-center text-xs text-ink-500">
              {tasks.wizard.checklist.noTaskTypes}
            </p>
          ) : (
            <ul className="divide-y divide-line/60 overflow-hidden rounded-xl border border-line/80 bg-surface">
              {progress.categories.map((category) => {
                const isComplete = category.isComplete;
                const isPartiallyDone = !isComplete && category.answered > 0;

                return (
                  <li
                    key={category.categoryId}
                    className={cn(
                      'flex items-center justify-between gap-2.5 px-3 py-2 text-xs transition-colors',
                      isComplete
                        ? 'bg-surface/60'
                        : isPartiallyDone
                          ? 'bg-violet-50/40'
                          : 'bg-surface hover:bg-canvas/40',
                    )}
                  >
                    <span className="sr-only">
                      {interpolate(tasks.wizard.checklist.sectionSummary, {
                        name: category.categoryName,
                        answered: category.answered,
                        total: category.total,
                      })}
                    </span>
                    <div className="flex min-w-0 flex-1 items-center gap-2" aria-hidden="true">
                      {isComplete ? (
                        <CheckCircle2
                          className="size-3.5 shrink-0 text-emerald-600"
                          aria-hidden="true"
                        />
                      ) : isPartiallyDone ? (
                        <AlertCircle
                          className="size-3.5 shrink-0 text-violet-600"
                          aria-hidden="true"
                        />
                      ) : (
                        <AlertCircle
                          className="size-3.5 shrink-0 text-amber-500"
                          aria-hidden="true"
                        />
                      )}
                      <span
                        className={cn(
                          'truncate leading-tight',
                          isComplete
                            ? 'font-medium text-ink-700'
                            : isPartiallyDone
                              ? 'font-semibold text-violet-950'
                              : 'text-ink-800 font-normal',
                        )}
                        title={category.categoryName}
                      >
                        {category.categoryName}
                      </span>
                    </div>

                    <span
                      aria-hidden="true"
                      className={cn(
                        'inline-grid h-5.5 w-13 shrink-0 place-items-center rounded-md border font-mono text-[11px] tabular-nums',
                        isComplete
                          ? 'border-emerald-200/70 bg-emerald-50 font-semibold text-emerald-700'
                          : isPartiallyDone
                            ? 'border-violet-200/70 bg-violet-50 font-semibold text-violet-700'
                            : 'border-line bg-canvas font-medium text-ink-500',
                      )}
                    >
                      {category.answered} / {category.total}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={tasks.wizard.checklist.remarksTitle}
          description={tasks.wizard.checklist.remarksSubtitle}
          icon={<MessageSquare className="size-4 text-violet-600" />}
        />
        <CardBody className="pt-3">
          <Textarea
            value={draft.remarks}
            onChange={(event) => {
              draft.setRemarks(event.target.value);
            }}
            placeholder={tasks.wizard.checklist.remarksPlaceholder}
            aria-label={tasks.wizard.checklist.remarksTitle}
            rows={4}
          />
        </CardBody>
      </Card>
    </div>
  );
}
