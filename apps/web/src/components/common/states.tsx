import type { ReactNode } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/components/ui';
import common from '@/content/common.json';

/**
 * Shared loading / empty / error presentations.
 *
 * Every async surface uses these three rather than inventing its own, so a user
 * who has learned what a failed panel looks like in one place recognises it
 * everywhere.
 */

export function LoadingState({ label, className }: { label?: string; className?: string }) {
  return (
    <div
      className={cn('flex items-center justify-center gap-2 py-12', className)}
      role="status"
      aria-live="polite"
    >
      <Loader2 className="size-4 animate-spin text-ink-400" aria-hidden="true" />
      <span className="text-sm text-ink-500">{label ?? common.states.loading}</span>
    </div>
  );
}

/**
 * An empty-state icon on a tinted tile.
 *
 * The plain `icon` slot below draws a bare glyph, which disappears in the middle
 * of a large empty card. The tile gives it a shape to sit in and a size the eye
 * finds — the treatment the Power App reference uses, and now available to any
 * empty state that wants it: `icon={<EmptyStateIcon><Foo /></EmptyStateIcon>}`.
 */
export function EmptyStateIcon({ children }: { children: ReactNode }) {
  return (
    <span className="grid size-14 place-items-center rounded-card bg-canvas text-ink-400">
      {children}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
  className,
}: {
  /**
   * Optionals are spelled `?: T | undefined` rather than `?: T` because the
   * project runs `exactOptionalPropertyTypes`. Without the explicit `undefined`,
   * callers cannot forward a value that may be absent (`hint={maybeValue}`) and
   * are forced into conditional spreads at every call site.
   */
  icon?: ReactNode | undefined;
  title: string;
  hint?: string | undefined;
  action?: ReactNode | undefined;
  className?: string | undefined;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 px-6 py-12', className)}>
      {icon ? (
        <div className="mb-2 text-ink-400" aria-hidden="true">
          {icon}
        </div>
      ) : null}
      {/*
        The title carries the weight, the hint explains.

        Both were a step lighter (`text-sm`/`text-xs`), which left an empty panel
        looking like a caption someone had forgotten to remove rather than a
        deliberate state. This ramp matches the Power App reference and reads at
        arm's length.
      */}
      <p className="text-base font-semibold text-ink-900">{title}</p>
      {hint ? <p className="max-w-sm text-center text-sm text-ink-500">{hint}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title,
  message,
  onRetry,
  /**
   * Overrides "Try again" when that would be a lie — for example when only a
   * reload can recover, the label should say so.
   */
  retryLabel,
  className,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center gap-2 px-6 py-12', className)}
      role="alert"
    >
      <AlertCircle className="size-5 text-danger" aria-hidden="true" />
      <p className="text-sm font-semibold text-ink-900">{title ?? common.errors.boundaryTitle}</p>
      <p className="max-w-sm text-center text-xs text-ink-500">
        {message ?? common.errors.generic}
      </p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 text-xs font-semibold text-brand-blue-600 hover:text-brand-blue-500"
        >
          {retryLabel ?? common.actions.retry}
        </button>
      ) : null}
    </div>
  );
}
