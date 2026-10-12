import { AlertCircle, Check, Circle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/components/ui';
import common from '@/content/common.json';
import { interpolate } from '@/lib/formatters.ts';

/**
 * Wizard chrome from Components sheet "11 · Workflow", used by the New Review
 * Task wizard (screens 22–25).
 *
 * The stepper is a *display* of progress, not the thing that decides it. Which
 * steps are complete and which requirements are outstanding comes from
 * `taskRules.missingRequirements()`; this component takes that answer and draws
 * it. Keeping the decision out of here is what stops the wizard growing a second
 * hardcoded copy of the submission rules.
 */

export type StepState = 'complete' | 'current' | 'upcoming' | 'error';

export interface Step {
  /** Stable key; also the wizard's route segment. */
  id: string;
  title: string;
  state: StepState;
}

const MARKER: Record<StepState, string> = {
  complete: 'bg-emerald-600 text-white shadow-xs',
  current: 'bg-violet-600 text-white ring-4 ring-violet-500/20 shadow-xs',
  upcoming: 'border border-line-strong bg-canvas/80 text-ink-400 font-medium',
  error: 'bg-danger text-white ring-4 ring-danger/20 shadow-xs',
};

const TITLE: Record<StepState, string> = {
  complete: 'text-ink-900 font-semibold',
  current: 'text-violet-700 font-bold',
  upcoming: 'text-ink-400 font-medium',
  error: 'text-danger font-bold',
};

export function Stepper({ steps, className }: { steps: readonly Step[]; className?: string }) {
  const currentIndex = steps.findIndex((step) => step.state === 'current');

  return (
    <nav
      className={cn(
        'rounded-2xl border border-line bg-surface px-4 py-3.5 shadow-card sm:px-6',
        className,
      )}
      aria-label={interpolate(common.stepper.progress, {
        current: currentIndex + 1,
        total: steps.length,
      })}
    >
      <ol className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {steps.map((step, index) => (
          <li key={step.id} className="flex min-w-0 items-center gap-3 sm:flex-1 sm:last:flex-none">
            <span
              className={cn(
                'grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold transition-all duration-200',
                MARKER[step.state],
              )}
              aria-hidden="true"
            >
              {step.state === 'complete' ? (
                <Check className="size-4 stroke-[2.5]" />
              ) : step.state === 'error' ? (
                <AlertCircle className="size-4" />
              ) : (
                index + 1
              )}
            </span>

            {/*
              `min-w-0` WITHOUT `shrink-0`. Both were set here, which is a
              contradiction `shrink-0` wins: the label block refused to give up
              any width, so a long step title squeezed the connector to nothing
              and then pushed the row past the card. Allowing it to shrink, with
              the title truncating, keeps every step on one line at any width.
            */}
            <span className="min-w-0">
              <span
                className={cn(
                  'block text-[11px] font-bold tracking-wider uppercase',
                  step.state === 'current' ? 'text-violet-600' : 'text-ink-400',
                )}
              >
                {interpolate(common.stepper.stepLabel, { number: index + 1 })}
              </span>
              <span className={cn('block truncate text-sm', TITLE[step.state])}>
                {step.title}
                {/*
                 * The colour and glyph carry the state visually; this is the
                 * same information for a screen reader, which sees neither.
                 */}
                {step.state !== 'upcoming' ? (
                  <span className="sr-only"> ({common.stepper[stateKey(step.state)]})</span>
                ) : null}
              </span>
            </span>

            {/*
              The connector turns green once the step behind it is complete, so
              progress reads at a glance across the whole bar rather than only
              from the markers. Hidden below `sm`, where the steps stack.
            */}
            {index < steps.length - 1 ? (
              <span
                className={cn(
                  'ml-3 hidden h-0.5 flex-1 rounded-full transition-colors duration-200 sm:block',
                  step.state === 'complete' ? 'bg-emerald-500' : 'bg-line',
                )}
                aria-hidden="true"
              />
            ) : null}
          </li>
        ))}
      </ol>
    </nav>
  );
}

function stateKey(state: Exclude<StepState, 'upcoming'>): 'completed' | 'current' | 'blocked' {
  if (state === 'complete') return 'completed';
  if (state === 'current') return 'current';
  return 'blocked';
}

export type RequirementState = 'met' | 'pending' | 'blocking';

export interface Requirement {
  id: string;
  label: string;
  state: RequirementState;
}

/**
 * The "Before you can continue" list on wizard steps.
 *
 * Rendered directly from `missingRequirements()`, so a rule change shows up here
 * with no edit to this file.
 */
export function RequirementList({
  requirements,
  className,
}: {
  requirements: readonly Requirement[];
  className?: string;
}) {
  return (
    <ul className={cn('space-y-2.5', className)}>
      {requirements.map((requirement) => (
        <li key={requirement.id} className="flex items-start gap-2.5 text-sm">
          {requirement.state === 'met' ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden="true" />
          ) : requirement.state === 'blocking' ? (
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden="true" />
          ) : (
            <Circle className="text-ink-300 mt-0.5 size-4 shrink-0" aria-hidden="true" />
          )}
          <span
            className={cn(
              'leading-tight',
              requirement.state === 'met' && 'text-ink-700',
              requirement.state === 'pending' && 'text-ink-500',
              requirement.state === 'blocking' && 'text-ink-800 font-medium',
            )}
          >
            {requirement.label}
          </span>
        </li>
      ))}
    </ul>
  );
}
