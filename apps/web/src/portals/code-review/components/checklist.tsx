import { useState, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, ChevronDown, Info } from 'lucide-react';
import * as RadixRadioGroup from '@radix-ui/react-radio-group';
import { CHECKLIST_ANSWERS, type ChecklistAnswer } from '@sdp/contracts';
import { cn } from '@/components/ui';
import common from '@/content/common.json';
import { interpolate } from '@/lib/formatters.ts';

/**
 * Checklist presentation, from Components sheet "09 · Checklist & Review Forms"
 * and screens 21, 23 and 24.
 *
 * Two rows and one badge, shared by the developer's editor, the read-only review
 * step and the reviewer's view of the same checklist — so an answer looks
 * identical wherever it is read, and the "flagged" treatment means the same
 * thing in all three.
 */

/* -------------------------------------------------------------------------- */
/* Answer badge (read-only)                                                    */
/* -------------------------------------------------------------------------- */

const ANSWER_BADGE: Record<ChecklistAnswer, { className: string; Icon: typeof CheckCircle2 }> = {
  Yes: {
    className: 'bg-emerald-50 text-emerald-700 border border-emerald-200/80',
    Icon: CheckCircle2,
  },
  No: {
    className: 'bg-amber-50 text-amber-800 border border-amber-200/90',
    Icon: AlertCircle,
  },
  NA: { className: 'bg-canvas text-ink-600 border border-line', Icon: Info },
};

/** Internal: `ReadOnlyQuestionRow` is the only caller, and the only one wanted. */
function AnswerBadge({
  answer,
  className,
}: {
  answer: ChecklistAnswer | undefined;
  className?: string;
}) {
  if (answer === undefined) {
    return <span className={cn('text-xs text-ink-400', className)}>—</span>;
  }

  const { className: tone, Icon } = ANSWER_BADGE[answer];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-badge px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap shadow-2xs',
        tone,
        className,
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {common.answer[answer]}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Answer picker (editable)                                                    */
/* -------------------------------------------------------------------------- */

const ANSWER_ACTIVE: Record<ChecklistAnswer, string> = {
  Yes: 'bg-emerald-600 text-white shadow-xs',
  No: 'bg-amber-700 text-white shadow-xs',
  NA: 'bg-slate-700 text-white shadow-xs',
};

/**
 * The Yes / No / N/A control on each editable question.
 *
 * A radio group rather than three buttons: the answers are mutually exclusive,
 * and arrow-key navigation between them is what a keyboard user expects. The
 * accessible name carries the question text, because "Yes" on its own tells a
 * screen-reader user nothing about what they are answering.
 */
export function AnswerPicker({
  value,
  onValueChange,
  questionLabel,
  disabled = false,
}: {
  value: ChecklistAnswer | undefined;
  onValueChange: (answer: ChecklistAnswer) => void;
  questionLabel: string;
  disabled?: boolean;
}) {
  return (
    <RadixRadioGroup.Root
      value={value ?? null}
      onValueChange={(val) => {
        onValueChange(val as ChecklistAnswer);
      }}
      disabled={disabled}
      aria-label={questionLabel}
      onKeyDown={(event) => {
        const direction =
          event.key === 'ArrowRight' || event.key === 'ArrowDown'
            ? 1
            : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
              ? -1
              : 0;
        if (direction === 0 || !(event.target instanceof HTMLButtonElement)) return;
        const index = CHECKLIST_ANSWERS.indexOf(event.target.value as ChecklistAnswer);
        const next =
          CHECKLIST_ANSWERS[
            (index + direction + CHECKLIST_ANSWERS.length) % CHECKLIST_ANSWERS.length
          ];
        if (next !== undefined) onValueChange(next);
      }}
      className="inline-flex rounded-lg border border-line bg-canvas/80 p-1 shadow-2xs"
    >
      {CHECKLIST_ANSWERS.map((option) => {
        const isSelected = value === option;
        return (
          <RadixRadioGroup.Item
            key={option}
            value={option}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-semibold transition-all duration-150',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600',
              isSelected
                ? cn(ANSWER_ACTIVE[option], 'font-bold')
                : 'text-ink-600 hover:bg-surface hover:text-ink-900',
            )}
          >
            {common.answer[option]}
          </RadixRadioGroup.Item>
        );
      })}
    </RadixRadioGroup.Root>
  );
}

/* -------------------------------------------------------------------------- */
/* Question rows                                                               */
/* -------------------------------------------------------------------------- */

export function EditableQuestionRow({
  index,
  text,
  value,
  onValueChange,
}: {
  index: number;
  text: string;
  value: ChecklistAnswer | undefined;
  onValueChange: (answer: ChecklistAnswer) => void;
}) {
  return (
    <li
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3.5 py-3 transition-colors duration-150',
        value !== undefined
          ? 'border-line bg-surface shadow-2xs'
          : 'border-line/80 bg-surface/70 hover:border-line hover:bg-surface',
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        <span className="mt-0.5 w-5 shrink-0 text-right text-xs font-bold text-ink-400">
          {index}.
        </span>
        <span className="text-ink-800 min-w-0 flex-1 text-sm leading-snug font-medium">{text}</span>
      </div>
      <AnswerPicker
        value={value}
        onValueChange={onValueChange}
        questionLabel={interpolate(common.checklist.questionLabel, {
          n: index,
          text,
        })}
      />
    </li>
  );
}

/**
 * Read-only question row.
 *
 * `flagged` highlights the row with a soft amber attention styling.
 */
export function ReadOnlyQuestionRow({
  text,
  answer,
  flagged = false,
  index,
}: {
  text: string;
  answer: ChecklistAnswer | undefined;
  flagged?: boolean;
  index?: number;
}) {
  return (
    <li
      className={cn(
        'flex flex-wrap items-center justify-between gap-2.5 rounded-lg border px-3 py-2 transition-colors duration-150',
        flagged
          ? 'border-amber-200/80 bg-amber-50/20 text-ink-900 shadow-2xs'
          : 'text-ink-800 border-line bg-surface shadow-2xs',
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-2">
        {index !== undefined ? (
          <span className="mt-0.5 w-4 shrink-0 text-right text-xs font-bold text-ink-400">
            {index}.
          </span>
        ) : null}
        <span
          className={cn(
            'min-w-0 flex-1 text-xs leading-snug font-medium sm:text-sm',
            flagged ? 'font-semibold text-amber-950' : 'text-ink-800',
          )}
        >
          {text}
        </span>
      </div>
      <AnswerBadge answer={answer} />
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/* Section wrapper                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Groups a section's rows under its name and count.
 *
 * A section containing a No answer is wrapped in a soft amber attention box.
 */
export function ChecklistSection({
  name,
  questionCount,
  issueCount = 0,
  children,
  defaultOpen = true,
  isOpen: controlledOpen,
  onToggle,
  listClassName = 'space-y-1.5',
}: {
  name: string;
  questionCount: number;
  issueCount?: number;
  children: ReactNode;
  defaultOpen?: boolean;
  isOpen?: boolean;
  onToggle?: () => void;
  /**
   * Applied to the `<ul>` itself.
   *
   * Exists so a caller that wants dividers rather than gaps can say so without
   * wrapping the rows in a `<div>`. A `<ul>` may only contain `<li>`, and axe
   * reports the wrapper as two serious violations — `list` and `listitem`.
   */
  listClassName?: string;
}) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isExpanded = controlledOpen ?? internalOpen;
  const toggle = onToggle ?? (() => setInternalOpen((prev) => !prev));
  const flagged = issueCount > 0;

  return (
    <section
      aria-label={name}
      className={cn(
        'overflow-hidden rounded-xl border transition-all duration-150',
        flagged ? 'border-amber-200/80 bg-amber-50/15' : 'border-line bg-surface shadow-2xs',
      )}
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={isExpanded}
        className="flex w-full flex-wrap items-center justify-between gap-3 p-3 text-left transition-colors hover:bg-canvas/50 sm:p-3.5"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <ChevronDown
            className={cn(
              'size-4 shrink-0 text-ink-400 transition-transform duration-200',
              isExpanded && 'rotate-180',
            )}
            aria-hidden="true"
          />
          <span
            className={cn(
              'rounded-md px-2.5 py-0.5 text-xs font-bold tracking-tight',
              flagged
                ? 'border border-amber-200 bg-amber-100 text-amber-900'
                : 'border border-line bg-canvas text-ink-900',
            )}
          >
            {name}
          </span>
          <span className="text-xs font-semibold text-ink-500">
            {questionCount} / {questionCount}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {flagged ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200/60 bg-amber-100/90 px-2 py-0.5 text-xs font-semibold text-amber-800">
              <AlertCircle className="size-3.5 text-amber-600" aria-hidden="true" />
              {interpolate(
                issueCount === 1
                  ? common.checklist.issueInSection
                  : common.checklist.issuesInSection,
                { count: issueCount },
              )}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200/60 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
              <CheckCircle2 className="size-3.5 text-emerald-600" aria-hidden="true" />
              {common.checklist.allAddressed}
            </span>
          )}
        </div>
      </button>

      {isExpanded ? (
        <div className="px-3 pt-0.5 pb-3 sm:px-3.5 sm:pb-3.5">
          <ul className={listClassName}>{children}</ul>
        </div>
      ) : null}
    </section>
  );
}
