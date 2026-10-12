import type { ReactNode } from 'react';
import { Eye } from 'lucide-react';
import { cn } from '@/components/ui';
import { CycleBadge, StatusBadge } from './badges.tsx';
import type { TaskStatus } from '@sdp/contracts';
import { Tooltip } from '@/components/ui/Tooltip.tsx';

/**
 * Cell renderers shared by every grid, from Components sheets "08 · Tables" and
 * "10 · Detail, Feedback & Rows".
 *
 * These exist so the same datum looks the same everywhere: a Task ID is mono and
 * muted in all six grids and a status always carries its cycle badge. Column
 * definitions then differ only in
 * which cells they use and in what order.
 */

/** Task ID and CRIM ID: monospace so the digits line up down the column. */
export function MonoId({ value, className }: { value: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-block max-w-[11rem] truncate align-bottom font-mono text-xs font-medium whitespace-nowrap text-ink-500',
        className,
      )}
    >
      {value}
    </span>
  );
}

/** Compact single-line task title with an accessible full-title tooltip. */
export function TitleCell({ title, className }: { title: string; className?: string }) {
  return (
    <span
      className={cn(
        'flex min-w-0 max-w-full items-center gap-2',
        className,
      )}
    >
      <Tooltip content={title} side="top" align="start">
        <span
          // A tooltip trigger must be reachable without a pointer. This remains
          // plain text so it does not introduce a fake button inside clickable rows.
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
          tabIndex={0}
          className="min-w-0 flex-1 cursor-help truncate font-bold whitespace-nowrap text-ink-900 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
        >
          {title}
        </span>
      </Tooltip>
    </span>
  );
}

/**
 * Status plus the cycle badge, which the grids always show together.
 * `CycleBadge` renders nothing at cycle 1, so this collapses to a single badge
 * on the common case without the caller needing to know that.
 */
export function StatusCell({
  status,
  cycle,
  className,
}: {
  status: TaskStatus;
  cycle: number;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex flex-col items-start gap-1', className)}>
      <StatusBadge status={status} />
      <CycleBadge cycle={cycle} />
    </span>
  );
}

/** Emphasised date, as the grids draw the Created column. */
export function DateCell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('text-sm font-medium whitespace-nowrap text-brand-blue-700', className)}>{children}</span>
  );
}

/** Value with a muted em dash when absent, so empty cells are never blank. */
export function OptionalCell({
  value,
  fallback = '—',
  className,
}: {
  value: ReactNode;
  fallback?: string;
  className?: string;
}) {
  const isEmpty = value === null || value === undefined || value === '';
  return (
    <span className={cn(isEmpty && 'text-ink-400', className)}>{isEmpty ? fallback : value}</span>
  );
}

/**
 * The trailing action button that navigates to a row's details (clear View Task button with Eye icon).
 */
export function RowArrowAction({
  label,
  onClick,
  text = 'View Task',
}: {
  label: string;
  onClick: () => void;
  text?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="hover:border-brand-blue-300 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line/80 bg-surface px-2.5 py-1 text-xs font-semibold text-ink-700 shadow-2xs transition-all hover:bg-brand-blue-50/50 hover:text-brand-blue-700 hover:shadow-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-600"
    >
      <Eye className="size-3.5 text-ink-400 group-hover:text-brand-blue-600" aria-hidden="true" />
      <span>{text}</span>
    </button>
  );
}

export const RowViewAction = RowArrowAction;

/**
 * Label-over-value pair used throughout the Task Details and Review screens.
 *
 * A `<dl>` at the group level with `<dt>`/`<dd>` inside would be more semantic,
 * but these are laid out individually in grids of varying shape across the
 * wireframes; `DetailList` below provides the semantic wrapper where a group
 * genuinely exists.
 */
export function DetailRow({
  label,
  icon,
  children,
  className,
}: {
  label: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="flex items-center gap-1.5 text-xs font-medium text-ink-500">
        {icon ? (
          <span className="shrink-0 text-ink-400" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        {label}
      </dt>
      {/*
        `break-words`: the values here include CRIM ids, branch names and — on
        the review screens — repository URLs, none of which contain a space.
        `min-w-0` above lets the grid TRACK shrink; without a break rule the
        unbroken string still paints straight out of it.
      */}
      <dd className="mt-0.5 text-sm font-medium break-words text-ink-900">{children}</dd>
    </div>
  );
}

export function DetailList({ children, className }: { children: ReactNode; className?: string }) {
  return <dl className={cn('grid gap-4 sm:grid-cols-2', className)}>{children}</dl>;
}
