import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from './lib/cn.ts';

/**
 * Segmented single-choice control, from Components sheet "05 · Form Controls"
 * and the Priority field on screen 22.
 *
 * A `Select` would also work, and that is what this replaced — but the sheet
 * draws three side-by-side pills with a coloured dot each, and it is the better
 * control here: three options, all worth seeing at once, each carrying a colour
 * that is part of its meaning. Hiding them behind a dropdown costs a click and
 * the colour cue.
 *
 * Built as a real radio group so arrow keys move between options and a screen
 * reader announces "2 of 3".
 */

export interface SegmentedOption<TValue extends string> {
  value: TValue;
  label: string;
  /** Small leading dot — the priority colour. */
  dotClassName?: string;
  disabled?: boolean;
}

export function SegmentedOptions<TValue extends string>({
  value,
  onValueChange,
  options,
  label,
  required = false,
  className,
  size = 'md',
  labelClassName,
}: {
  value: TValue | '';
  onValueChange: (value: TValue) => void;
  options: readonly SegmentedOption<TValue>[];
  /** Visible group label. */
  label: ReactNode;
  required?: boolean;
  className?: string;
  size?: 'sm' | 'md';
  labelClassName?: string;
}) {
  const groupId = useId();
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const isCompact = size === 'sm';

  function moveSelection(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const direction =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0;
    if (direction === 0) return;

    event.preventDefault();
    let nextIndex = index;
    do {
      nextIndex = (nextIndex + direction + options.length) % options.length;
    } while (options[nextIndex]?.disabled && nextIndex !== index);

    const next = options[nextIndex];
    if (next === undefined || next.disabled) return;
    onValueChange(next.value);
    buttonRefs.current[nextIndex]?.focus();
  }

  return (
    <div className={className}>
      <p
        id={groupId}
        className={cn(
          'block text-sm font-medium text-ink-900',
          labelClassName?.includes('sr-only') ? 'sr-only' : 'mb-1.5',
          labelClassName,
        )}
      >
        {label}
        {required ? (
          <>
            <span aria-hidden="true" className="ml-0.5 text-danger">
              *
            </span>
            <span className="sr-only"> (required)</span>
          </>
        ) : null}
      </p>

      <div
        role="radiogroup"
        aria-labelledby={groupId}
        className={cn('flex flex-wrap', isCompact ? 'gap-1.5' : 'gap-2')}
      >
        {options.map((option, index) => {
          const selected = option.value === value;
          const firstEnabled = options.findIndex((candidate) => !candidate.disabled);
          return (
            <button
              ref={(node) => {
                buttonRefs.current[index] = node;
              }}
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={option.disabled ?? false}
              tabIndex={selected || (value === '' && index === firstEnabled) ? 0 : -1}
              onClick={() => {
                onValueChange(option.value);
              }}
              onKeyDown={(event) => moveSelection(event, index)}
              className={cn(
                'inline-flex items-center rounded-control border transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600',
                'disabled:pointer-events-none disabled:opacity-50',
                isCompact ? 'gap-1.5 px-3 py-1.5 text-xs' : 'gap-2 px-4 py-2.5 text-sm',
                selected
                  ? 'border-violet-600 bg-violet-50 font-semibold text-violet-700'
                  : 'border-line-strong bg-surface text-ink-700 hover:bg-canvas',
              )}
            >
              {option.dotClassName === undefined ? null : (
                <span
                  className={cn(
                    'shrink-0 rounded-full',
                    isCompact ? 'size-1.5' : 'size-2',
                    option.dotClassName,
                  )}
                  aria-hidden="true"
                />
              )}
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
