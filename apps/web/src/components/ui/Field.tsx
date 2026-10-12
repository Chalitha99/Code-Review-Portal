import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type LabelHTMLAttributes,
  type ReactNode,
} from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from './lib/cn.ts';
import { FieldContext, useFieldContext, type FieldContextValue } from './fieldContext.ts';

/**
 * Form field plumbing, done once.
 *
 * Wiring a label to its control, pointing `aria-describedby` at both the hint
 * and the error, and flipping `aria-invalid` is mechanical, easy to get subtly
 * wrong, and invisible on screen when it is wrong. Centralising it means every
 * form in Sprints 4–7 is accessible by construction rather than by remembering.
 */

export interface FieldProps {
  /**
   * `ReactNode`, not `string`: several labels carry a muted suffix —
   * "Version (optional)", "Title (auto-generated)" — which is styling inside the
   * label rather than a separate hint below it.
   */
  label: ReactNode;
  /** Validation message. Its presence is what puts the field into its error state. */
  error?: string | undefined;
  /** Persistent helper text, shown whether or not there is an error. */
  hint?: string | undefined;
  required?: boolean | undefined;
  className?: string | undefined;
  children: ReactNode;
}

export function Field({ label, error, hint, required = false, className, children }: FieldProps) {
  const id = useId();
  const value: FieldContextValue = {
    controlId: `field-${id}`,
    hintId: `field-hint-${id}`,
    errorId: `field-error-${id}`,
    hasError: error !== undefined && error !== '',
    hasHint: hint !== undefined && hint !== '',
    isRequired: required,
  };

  return (
    <FieldContext.Provider value={value}>
      <div className={cn('space-y-1.5', className)}>
        <FieldLabel>{label}</FieldLabel>
        {children}
        {value.hasHint ? (
          <p id={value.hintId} className="text-xs text-ink-500">
            {hint}
          </p>
        ) : null}
        {value.hasError ? (
          // `role="alert"` so the message is announced when it appears, rather
          // than only being found if the user navigates back to the field.
          <p
            id={value.errorId}
            role="alert"
            className="flex items-center gap-1.5 text-xs font-medium text-danger"
          >
            <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
            {error}
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}

export function FieldLabel({
  children,
  className,
  ...props
}: LabelHTMLAttributes<HTMLLabelElement>) {
  const { controlId, isRequired } = useFieldContext('FieldLabel');
  return (
    <label
      htmlFor={controlId}
      className={cn('block text-sm font-medium text-ink-900', className)}
      {...props}
    >
      {children}
      {isRequired ? (
        <>
          <span aria-hidden="true" className="ml-0.5 text-danger">
            *
          </span>
          {/* The asterisk alone means nothing to a screen reader. */}
          <span className="sr-only"> (required)</span>
        </>
      ) : null}
    </label>
  );
}

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'>;

/**
 * Text input bound to its surrounding `Field`.
 *
 * Takes no `id`: it comes from the Field, so a caller cannot break the label
 * association by passing a duplicate.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, ...props },
  ref,
) {
  const { controlId, errorId, hintId, hasError, hasHint } = useFieldContext('Input');

  const describedBy = [hasHint ? hintId : null, hasError ? errorId : null]
    .filter(Boolean)
    .join(' ');

  return (
    <input
      ref={ref}
      id={controlId}
      aria-invalid={hasError}
      {...(describedBy === '' ? {} : { 'aria-describedby': describedBy })}
      className={cn(
        'block w-full rounded-control border bg-surface px-3 py-2 text-sm text-ink-900',
        'placeholder:text-ink-400',
        'transition-colors focus-visible:outline-2 focus-visible:outline-offset-0',
        'disabled:cursor-not-allowed disabled:bg-canvas disabled:text-ink-400',
        hasError
          ? 'border-danger focus-visible:outline-danger'
          : 'border-line-strong focus-visible:outline-violet-600',
        className,
      )}
      {...props}
    />
  );
});
