import { createContext, useContext } from 'react';

/**
 * Shared plumbing for `Field` and the controls inside it.
 *
 * Split from `Field.tsx` so that file exports only components, which is what
 * React Fast Refresh needs to hot-reload a form without losing its state.
 */
export interface FieldContextValue {
  controlId: string;
  hintId: string;
  errorId: string;
  hasError: boolean;
  hasHint: boolean;
  isRequired: boolean;
}

export const FieldContext = createContext<FieldContextValue | null>(null);

export function useFieldContext(component: string): FieldContextValue {
  const context = useContext(FieldContext);
  if (!context) {
    throw new Error(`<${component}> must be rendered inside a <Field>.`);
  }
  return context;
}

/**
 * ARIA wiring for any control that is not a plain `<input>` — a password field
 * with a visibility toggle, a select, a textarea.
 *
 * Returns the id and description links the surrounding `Field` owns, so those
 * controls get identical accessibility behaviour without duplicating it.
 */
export function useFieldControlProps() {
  const { controlId, errorId, hintId, hasError, hasHint } = useFieldContext('useFieldControlProps');
  const describedBy = [hasHint ? hintId : null, hasError ? errorId : null]
    .filter(Boolean)
    .join(' ');

  return {
    id: controlId,
    'aria-invalid': hasError,
    ...(describedBy === '' ? {} : { 'aria-describedby': describedBy }),
    hasError,
  };
}

/**
 * Same wiring, but tolerant of being used outside a `Field`.
 *
 * Controls that are legitimately standalone as well as field-bound — a textarea
 * in a review form, a select in a filter bar — need this. Returns `null` when
 * there is no surrounding Field so the caller renders its own ids untouched;
 * `useFieldControlProps` keeps throwing, because a control that is *only* ever
 * used inside a Field should fail loudly if it escapes one.
 */
export interface OptionalFieldControl {
  /** Spread straight onto the control element. Empty outside a `Field`. */
  controlProps: {
    id?: string;
    'aria-invalid'?: boolean;
    'aria-describedby'?: string;
  };
  hasError: boolean;
}

export function useOptionalFieldControlProps(): OptionalFieldControl {
  const context = useContext(FieldContext);
  if (!context) return { controlProps: {}, hasError: false };

  const describedBy = [
    context.hasHint ? context.hintId : null,
    context.hasError ? context.errorId : null,
  ]
    .filter(Boolean)
    .join(' ');

  return {
    controlProps: {
      id: context.controlId,
      'aria-invalid': context.hasError,
      ...(describedBy === '' ? {} : { 'aria-describedby': describedBy }),
    },
    hasError: context.hasError,
  };
}
