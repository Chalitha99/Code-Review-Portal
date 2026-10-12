import {
  forwardRef,
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import * as RadixCheckbox from '@radix-ui/react-checkbox';
import * as RadixRadioGroup from '@radix-ui/react-radio-group';
import * as RadixSwitch from '@radix-ui/react-switch';
import { Check, Search, X } from 'lucide-react';
import { cn } from './lib/cn.ts';
import common from '@/content/common.json';
import { useOptionalFieldControlProps } from './fieldContext.ts';

/**
 * Form controls from Components sheet "05 · Form Controls" and "04 · Buttons".
 *
 * `Field`/`Input` in `Field.tsx` cover labelled text inputs. These are the
 * controls that either stand alone (search) or need their own interaction model
 * (checkbox, radio, textarea, icon button).
 */

/** Kept in step with `Input` in `Field.tsx` — same box, different element. */
const CONTROL_BASE = [
  'block w-full rounded-control border bg-surface text-sm text-ink-900',
  'placeholder:text-ink-400',
  'transition-colors focus-visible:outline-2 focus-visible:outline-offset-0',
  'disabled:cursor-not-allowed disabled:bg-canvas disabled:text-ink-400',
].join(' ');

const CONTROL_OK = 'border-line-strong focus-visible:outline-violet-600';
const CONTROL_ERROR = 'border-danger focus-visible:outline-danger';

/* -------------------------------------------------------------------------- */
/* Search field                                                                */
/* -------------------------------------------------------------------------- */

export interface SearchFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type'
> {
  value: string;
  onValueChange: (value: string) => void;
  /** Accessible name. Required — a magnifier icon is not a label. */
  label: string;
}

/**
 * Standalone search input with a clear button.
 *
 * `type="search"` so browsers and assistive tech treat it as a search field,
 * but the native clear affordance is suppressed in favour of our own so the
 * control looks identical across browsers.
 */
export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(function SearchField(
  { value, onValueChange, label, className, placeholder, ...props },
  ref,
) {
  return (
    <div className={cn('relative', className)}>
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-400"
        aria-hidden="true"
      />
      <input
        ref={ref}
        type="search"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        aria-label={label}
        placeholder={placeholder ?? common.table.searchPlaceholder}
        className={cn(
          CONTROL_BASE,
          CONTROL_OK,
          'h-10 rounded-xl py-2 pr-9 pl-9',
          '[&::-webkit-search-cancel-button]:appearance-none',
        )}
        {...props}
      />
      {value !== '' ? (
        <button
          type="button"
          onClick={() => onValueChange('')}
          aria-label={common.actions.clear}
          className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 cursor-pointer place-items-center rounded text-ink-400 transition-colors hover:text-ink-700"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
});

/* -------------------------------------------------------------------------- */
/* Textarea                                                                    */
/* -------------------------------------------------------------------------- */

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Renders a live "n / max" counter. Requires `maxLength`. */
  showCount?: boolean;
  value?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, showCount = false, maxLength, value, ...props },
  ref,
) {
  const used = typeof value === 'string' ? value.length : 0;
  // Picks up label association and error wiring when wrapped in a `Field`, and
  // stays a plain textarea when it is not.
  const { controlProps, hasError } = useOptionalFieldControlProps();

  return (
    <div>
      <textarea
        ref={ref}
        maxLength={maxLength}
        value={value}
        {...controlProps}
        className={cn(
          CONTROL_BASE,
          hasError ? CONTROL_ERROR : CONTROL_OK,
          'min-h-24 resize-y px-3 py-2',
          className,
        )}
        {...props}
      />
      {showCount && maxLength !== undefined ? (
        // `aria-live="off"`: a counter that announces on every keystroke is
        // hostile to screen-reader users. It is a visual affordance.
        <p className="mt-1 text-right text-xs text-ink-400" aria-live="off">
          {used.toLocaleString()} / {maxLength.toLocaleString()}
        </p>
      ) : null}
    </div>
  );
});

/* -------------------------------------------------------------------------- */
/* Checkbox                                                                    */
/* -------------------------------------------------------------------------- */

export function Checkbox({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();

  // The whole row toggles through native label activation, so pointer and
  // keyboard users hit the same control and a click on the box never fires twice.
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex items-start gap-2.5',
        disabled ? 'cursor-not-allowed' : 'cursor-pointer',
        className,
      )}
    >
      <RadixCheckbox.Root
        id={id}
        checked={checked}
        onCheckedChange={(next) => onCheckedChange(next === true)}
        disabled={disabled}
        className={cn(
          'mt-0.5 grid size-4 shrink-0 place-items-center rounded border transition-colors',
          'border-line-strong bg-surface',
          'data-[state=checked]:border-violet-600 data-[state=checked]:bg-violet-600',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        <RadixCheckbox.Indicator>
          <Check className="size-3 text-white" aria-hidden="true" />
        </RadixCheckbox.Indicator>
      </RadixCheckbox.Root>
      <span className="min-w-0 flex-1 select-none">
        <span className="block text-sm text-ink-900">{label}</span>
        {description ? <span className="block text-xs text-ink-500">{description}</span> : null}
      </span>
    </label>
  );
}

/* -------------------------------------------------------------------------- */
/* Switch                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * On/off toggle for a setting that takes effect immediately, rather than one
 * collected and submitted with a form.
 *
 * A switch, not a checkbox, and the distinction is behavioural rather than
 * cosmetic: a checkbox is a value you submit with a form, a switch is a change
 * you make now. Everything this renders saves on change, so it is a switch.
 */
export function Switch({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();

  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <label htmlFor={id} className="min-w-0 cursor-pointer select-none">
        <span className="block text-sm font-semibold text-ink-900">{label}</span>
        {description ? <span className="block text-xs text-ink-500">{description}</span> : null}
      </label>
      <RadixSwitch.Root
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full border border-transparent transition-colors',
          'bg-line-strong data-[state=checked]:bg-violet-600',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        <RadixSwitch.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-[1.375rem]" />
      </RadixSwitch.Root>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Radio group                                                                 */
/* -------------------------------------------------------------------------- */

export interface RadioOption {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}

/**
 * Card-style radio group — the Review Ranking form (spec §2.9.2.5) renders each
 * option as a bordered block with a title and explanatory paragraph, not as a
 * bare radio in a list.
 */
export function RadioGroup({
  value,
  onValueChange,
  options,
  label,
  className,
}: {
  value: string | null;
  onValueChange: (value: string) => void;
  options: readonly RadioOption[];
  /** Group label for assistive tech. */
  label: string;
  className?: string;
}) {
  return (
    <RadixRadioGroup.Root
      value={value ?? ''}
      onValueChange={onValueChange}
      aria-label={label}
      className={cn('space-y-2', className)}
    >
      {options.map((option) => (
        <RadixRadioGroup.Item
          key={option.value}
          value={option.value}
          disabled={option.disabled ?? false}
          className={cn(
            'flex w-full items-start gap-3 rounded-card border p-3.5 text-left transition-colors',
            'border-line bg-surface hover:border-line-strong',
            'data-[state=checked]:border-violet-600 data-[state=checked]:bg-violet-50',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600',
            'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
          )}
        >
          <span
            className={cn(
              'mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border-2',
              'border-line-strong',
            )}
            aria-hidden="true"
          >
            <RadixRadioGroup.Indicator className="block size-2 rounded-full bg-violet-600" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-ink-900">{option.label}</span>
            {option.description ? (
              <span className="mt-0.5 block text-xs leading-relaxed text-ink-500">
                {option.description}
              </span>
            ) : null}
          </span>
        </RadixRadioGroup.Item>
      ))}
    </RadixRadioGroup.Root>
  );
}

/* -------------------------------------------------------------------------- */
/* Icon button                                                                 */
/* -------------------------------------------------------------------------- */

const ICON_BUTTON_TONES = {
  neutral: 'text-ink-400 hover:bg-canvas hover:text-ink-700',
  primary: 'text-brand-blue-600 hover:bg-brand-blue-50',
  danger: 'text-danger hover:bg-danger-surface',
  success: 'text-success hover:bg-success-surface',
  warning: 'text-warning hover:bg-warning-surface',
} as const;

const ICON_BUTTON_SIZES = {
  sm: 'size-7',
  md: 'size-9',
} as const;

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required: an icon alone has no accessible name. */
  label: string;
  icon: ReactNode;
  tone?: keyof typeof ICON_BUTTON_TONES;
  size?: keyof typeof ICON_BUTTON_SIZES;
}

/**
 * Icon-only button, used for the row action columns in the admin tables
 * (view, assign, cancel, delete) where a text label would not fit.
 *
 * `label` is mandatory rather than optional — the whole failure mode of an icon
 * button is shipping without an accessible name, so the type system requires it.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, tone = 'neutral', size = 'md', className, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'grid shrink-0 cursor-pointer place-items-center rounded-lg transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600',
        'disabled:pointer-events-none disabled:opacity-40',
        ICON_BUTTON_TONES[tone],
        ICON_BUTTON_SIZES[size],
        className,
      )}
      {...props}
    >
      {icon}
    </button>
  );
});
