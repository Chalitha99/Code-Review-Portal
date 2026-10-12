import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/components/ui';
import { WORKSPACE_THEME } from '@/config/workspaceTheme.ts';

/**
 * Page chrome from Components sheet "06 · Navigation & Chrome": a tinted icon
 * tile, a large navy title, a muted subtitle, and optional actions on the right.
 *
 * The tile tone is a fixed set rather than a free colour prop — every screen in
 * the wireframes uses one of these five, and an open prop invites a sixth that
 * matches nothing.
 *
 * The three workspace tones come from `WORKSPACE_THEME`, so this tile is
 * literally the same gradient as the Home card that leads here. They used to be
 * flat fills of the accent colour while the Home cards were gradients, which is
 * how the same role ended up two different colours one click apart.
 */

const TILE_TONES = {
  developer: `${WORKSPACE_THEME.developer.gradient} text-white`,
  reviewer: `${WORKSPACE_THEME.reviewer.gradient} text-white`,
  admin: `${WORKSPACE_THEME.admin.gradient} text-white`,
  success: 'bg-success text-white',
  neutral: 'bg-ink-900 text-white',
} as const;

export type PageHeaderTone = keyof typeof TILE_TONES;

export function PageHeader({
  title,
  subtitle,
  icon,
  tone = 'neutral',
  actions,
  className,
}: {
  title: string;
  subtitle?: ReactNode | undefined;
  icon?: ReactNode | undefined;
  tone?: PageHeaderTone | undefined;
  actions?: ReactNode | undefined;
  className?: string | undefined;
}) {
  return (
    <div className={cn('flex flex-wrap items-start gap-4', className)}>
      {icon ? (
        <span
          className={cn(
            'grid size-12 shrink-0 place-items-center rounded-card sm:size-14',
            TILE_TONES[tone],
          )}
          aria-hidden="true"
        >
          {icon}
        </span>
      ) : null}

      {/*
        The ramp steps down on phones rather than holding one size. Measured off
        the wireframes, where the page title runs about 30px against a 16px
        subtitle — the previous flat `text-2xl`/`text-sm` pair read as a section
        heading rather than the page title.
      */}
      <div className="min-w-0 flex-1">
        <h1 className="font-display text-2xl font-bold break-words text-ink-900 sm:text-3xl">
          {title}
        </h1>
        {subtitle ? (
          typeof subtitle === 'string' ? (
            <p className="mt-1 text-sm text-ink-500 sm:text-base">{subtitle}</p>
          ) : (
            <div className="mt-1">{subtitle}</div>
          )
        ) : null}
      </div>

      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export interface Crumb {
  label: string;
  /** Omit on the last crumb — the current page is not a link to itself. */
  to?: string | undefined;
}

export function Breadcrumbs({ items, className }: { items: readonly Crumb[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-1 text-xs text-ink-500">
        {items.map((crumb, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${crumb.label}-${String(index)}`} className="flex items-center gap-1">
              {index > 0 ? (
                <ChevronRight className="size-3 text-ink-400" aria-hidden="true" />
              ) : null}
              {crumb.to !== undefined && !isLast ? (
                <Link
                  to={crumb.to}
                  className="rounded transition-colors hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
                >
                  {crumb.label}
                </Link>
              ) : (
                // `aria-current="page"` is the part assistive tech uses to know
                // where in the trail the user actually is.
                <span
                  aria-current={isLast ? 'page' : undefined}
                  className="font-medium text-ink-700"
                >
                  {crumb.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** The "← Back to My Tasks" link that opens every detail screen. */
export function BackLink({
  to,
  label,
  className,
}: {
  to: string;
  label: string;
  className?: string;
}) {
  return (
    <Link
      to={to}
      className={cn(
        'inline-flex items-center gap-1 rounded text-sm font-medium text-ink-500 transition-colors',
        'hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600',
        className,
      )}
    >
      <ChevronLeft className="size-4" aria-hidden="true" />
      {label}
    </Link>
  );
}
