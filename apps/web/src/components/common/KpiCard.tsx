import type { ReactNode } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/components/ui';
import common from '@/content/common.json';
import { interpolate } from '@/lib/formatters.ts';

/**
 * The metric cards from Components sheet "07 · Cards & Panels".
 *
 * The sheet shows two treatments and they are not interchangeable:
 * `StatCard` is the plain label + number used in dashboard rows, and `KpiCard`
 * adds a caption and a target indicator, which the Reports and Analytics screens
 * need for FL 2.4.3's below/on-target rule.
 */

const TILE_TONES = {
  violet: 'bg-violet-50 text-violet-600 border border-violet-100/60',
  blue: 'bg-blue-50 text-brand-blue-600 border border-blue-100/60',
  green: 'bg-emerald-50 text-emerald-600 border border-emerald-100/60',
  amber: 'bg-amber-50 text-amber-600 border border-amber-100/60',
  red: 'bg-rose-50 text-rose-600 border border-rose-100/60',
  neutral: 'bg-slate-50 text-slate-600 border border-slate-200/60',
} as const;

const ACTIVE_TONE_STYLES: Record<
  KpiTone,
  {
    card: string;
    iconTile: string;
    badge: string;
    dot: string;
  }
> = {
  blue: {
    card: 'border-brand-blue-500/80 bg-gradient-to-b from-blue-50/40 via-white to-surface ring-2 ring-brand-blue-500/20 shadow-[0_8px_24px_-4px_rgba(2,139,222,0.18),0_2px_8px_-2px_rgba(2,139,222,0.08)]',
    iconTile: 'bg-brand-blue-600 text-white shadow-xs ring-2 ring-blue-100',
    badge: 'bg-blue-50 text-brand-blue-700 border-blue-200/80',
    dot: 'bg-brand-blue-600',
  },
  amber: {
    card: 'border-amber-500/80 bg-gradient-to-b from-amber-50/40 via-white to-surface ring-2 ring-amber-500/20 shadow-[0_8px_24px_-4px_rgba(245,158,11,0.18),0_2px_8px_-2px_rgba(245,158,11,0.08)]',
    iconTile: 'bg-amber-500 text-white shadow-xs ring-2 ring-amber-100',
    badge: 'bg-amber-50 text-amber-800 border-amber-200/80',
    dot: 'bg-amber-500',
  },
  green: {
    card: 'border-emerald-500/80 bg-gradient-to-b from-emerald-50/40 via-white to-surface ring-2 ring-emerald-500/20 shadow-[0_8px_24px_-4px_rgba(16,185,129,0.18),0_2px_8px_-2px_rgba(16,185,129,0.08)]',
    iconTile: 'bg-emerald-600 text-white shadow-xs ring-2 ring-emerald-100',
    badge: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
    dot: 'bg-emerald-600',
  },
  violet: {
    card: 'border-violet-500/80 bg-gradient-to-b from-violet-50/40 via-white to-surface ring-2 ring-violet-500/20 shadow-[0_8px_24px_-4px_rgba(124,58,237,0.18),0_2px_8px_-2px_rgba(124,58,237,0.08)]',
    iconTile: 'bg-violet-600 text-white shadow-xs ring-2 ring-violet-100',
    badge: 'bg-violet-50 text-violet-800 border-violet-200/80',
    dot: 'bg-violet-600',
  },
  red: {
    card: 'border-rose-500/80 bg-gradient-to-b from-rose-50/40 via-white to-surface ring-2 ring-rose-500/20 shadow-[0_8px_24px_-4px_rgba(244,63,94,0.18),0_2px_8px_-2px_rgba(244,63,94,0.08)]',
    iconTile: 'bg-rose-600 text-white shadow-xs ring-2 ring-rose-100',
    badge: 'bg-rose-50 text-rose-800 border-rose-200/80',
    dot: 'bg-rose-600',
  },
  neutral: {
    card: 'border-slate-400 bg-gradient-to-b from-slate-50/40 via-white to-surface ring-2 ring-slate-400/20 shadow-[0_8px_24px_-4px_rgba(100,116,139,0.18),0_2px_8px_-2px_rgba(100,116,139,0.08)]',
    iconTile: 'bg-slate-700 text-white shadow-xs ring-2 ring-slate-200',
    badge: 'bg-slate-50 text-slate-800 border-slate-200',
    dot: 'bg-slate-600',
  },
};

export type KpiTone = keyof typeof TILE_TONES;

export interface StatCardProps {
  label: string;
  value: ReactNode;
  icon?: ReactNode | undefined;
  tone?: KpiTone | undefined;

  /**
   * `compact` shrinks the padding and the type ramp so six counters fit in one
   * row on the Admin dashboard, which is what the Power App reference shows.
   * The default is the four-across density every other dashboard uses.
   */
  size?: 'default' | 'compact' | undefined;

  /**
   * Makes the card a filter control.
   */
  onSelect?: (() => void) | undefined;
  isActive?: boolean | undefined;

  /** Explanatory secondary text under the metric number */
  subtitle?: ReactNode | undefined;

  trend?: string | { value: string; positive?: boolean } | undefined;
  trendPositive?: boolean | undefined;

  className?: string | undefined;
}

export function StatCard({
  label,
  value,
  icon,
  tone = 'violet',
  size = 'default',
  onSelect,
  isActive = false,
  subtitle,
  trend,
  trendPositive,
  className,
}: StatCardProps) {
  const compact = size === 'compact';
  const activeStyle = ACTIVE_TONE_STYLES[tone];

  const shell = cn(
    'group relative flex h-full flex-col justify-between rounded-2xl border text-left transition-all duration-200',
    compact ? 'p-4' : 'p-5',
    onSelect
      ? 'cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600'
      : '',
    isActive
      ? cn('scale-[1.02]', activeStyle.card)
      : 'border-line bg-surface shadow-card hover:scale-[1.02] hover:border-line-strong hover:shadow-card-hover active:scale-100',
    className,
  );

  const trendText = typeof trend === 'object' ? trend.value : trend;
  const isPositive = typeof trend === 'object' ? trend.positive : trendPositive;

  const body = compact ? (
    <>
      <div className="flex items-start justify-between gap-2">
        {icon ? (
          <span
            className={cn(
              'grid size-8.5 shrink-0 place-items-center rounded-xl transition-all duration-300',
              isActive ? activeStyle.iconTile : TILE_TONES[tone],
            )}
            aria-hidden="true"
          >
            {icon}
          </span>
        ) : null}

        {isActive ? (
          <span
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold shadow-2xs transition-all duration-200',
              activeStyle.badge,
            )}
          >
            <span
              className={cn('size-1.5 animate-pulse rounded-full', activeStyle.dot)}
              aria-hidden="true"
            />
            Active
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex-1">
        <p
          className={cn(
            'line-clamp-1 text-xs font-semibold tracking-tight transition-colors duration-200',
            isActive ? 'text-ink-950 font-bold' : 'text-ink-700',
          )}
          title={label}
        >
          {label}
        </p>
        <p
          className={cn(
            'mt-1 font-display text-2xl font-extrabold tracking-tight transition-colors duration-200 lg:text-3xl',
            isActive ? 'text-ink-950' : 'text-ink-900',
          )}
        >
          {value}
        </p>
      </div>

      {subtitle !== undefined ? (
        <p
          className={cn(
            'mt-2 line-clamp-2 text-[11px] leading-tight font-medium transition-colors duration-200',
            isActive ? 'font-semibold text-ink-700' : 'text-ink-500',
          )}
        >
          {subtitle}
        </p>
      ) : trendText ? (
        <p
          className={cn(
            'mt-2 flex items-center gap-1 text-[11px] font-medium transition-colors duration-200',
            isPositive
              ? 'font-semibold text-emerald-600'
              : trendText.includes('No change') || trendText.startsWith('—')
                ? isActive
                  ? 'text-ink-500'
                  : 'text-ink-400'
                : 'text-ink-500',
          )}
        >
          {isPositive ? (
            <span className="font-bold text-emerald-600" aria-hidden="true">
              ↗
            </span>
          ) : null}
          {trendText}
        </p>
      ) : null}
    </>
  ) : (
    <>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {icon ? (
            <span
              className={cn(
                'grid size-10 shrink-0 place-items-center rounded-full transition-all duration-300',
                isActive ? activeStyle.iconTile : TILE_TONES[tone],
              )}
              aria-hidden="true"
            >
              {icon}
            </span>
          ) : null}
          <p
            className={cn(
              'truncate text-sm font-semibold transition-colors duration-200',
              isActive ? 'text-ink-950 font-bold' : 'text-ink-700',
            )}
          >
            {label}
          </p>
        </div>

        {isActive ? (
          <span
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-bold transition-all duration-200',
              activeStyle.badge,
            )}
          >
            <span
              className={cn('size-1.5 animate-pulse rounded-full', activeStyle.dot)}
              aria-hidden="true"
            />
            Active
          </span>
        ) : null}
      </div>

      <div className="mt-3">
        <p
          className={cn(
            'font-display text-3xl font-extrabold tracking-tight transition-colors duration-200 sm:text-4xl',
            isActive ? 'text-ink-950' : 'text-ink-900',
          )}
        >
          {value}
        </p>

        {subtitle !== undefined ? (
          <p
            className={cn(
              'mt-2.5 text-xs font-medium transition-colors duration-200',
              isActive ? 'text-ink-600 font-semibold' : 'text-ink-500',
            )}
          >
            {subtitle}
          </p>
        ) : trendText ? (
          <p
            className={cn(
              'mt-2.5 flex items-center gap-1 text-xs font-medium transition-colors duration-200',
              isPositive
                ? 'font-semibold text-emerald-600'
                : trendText.includes('No change') || trendText.startsWith('—')
                  ? isActive
                    ? 'text-ink-500'
                    : 'text-ink-400'
                  : 'text-ink-500',
            )}
          >
            {isPositive ? (
              <span className="font-bold text-emerald-600" aria-hidden="true">
                ↗
              </span>
            ) : null}
            {trendText}
          </p>
        ) : null}
      </div>
    </>
  );

  if (!onSelect) {
    return <div className={shell}>{body}</div>;
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isActive}
      aria-label={interpolate(isActive ? common.kpi.clearFilter : common.kpi.filterBy, { label })}
      className={shell}
    >
      {body}
    </button>
  );
}

const KPI_ACCENT_TONES: Record<KpiTone, string> = {
  violet: 'from-violet-500/20 to-purple-400/5',
  blue: 'from-brand-blue-500/20 to-sky-400/5',
  green: 'from-emerald-500/20 to-teal-400/5',
  amber: 'from-amber-500/20 to-yellow-400/5',
  red: 'from-rose-500/20 to-pink-400/5',
  neutral: 'from-slate-400/20 to-slate-300/5',
};

export function KpiCard({
  label,
  value,
  caption,
  icon,
  tone = 'neutral',
  /**
   * `null` means "no target defined" and renders nothing. FL 2.4.3 Logic 2 needs
   * the below/on-target line, but the target itself is still an open business
   * question, so the component must handle its absence rather than assume a
   * number.
   *
   * `note` is for the case in between: a threshold IS being compared against,
   * but nobody has signed it off. A verdict shown without that caveat reads as
   * authoritative, which is how the same figure came to be presented as a pass
   * on one screen and a failure on another. See `lib/analyticsTargets.ts`.
   */
  target = null,
  className,
}: {
  label: string;
  value: ReactNode;
  caption?: ReactNode | undefined;
  icon?: ReactNode | undefined;
  tone?: KpiTone | undefined;
  target?: { met: boolean; note?: string | undefined } | null | undefined;
  className?: string | undefined;
}) {
  return (
    <div
      className={cn(
        'group relative h-full overflow-hidden rounded-2xl border border-line bg-surface p-5 shadow-card transition-all duration-300 hover:border-line-strong hover:shadow-lg',
        className,
      )}
    >
      {/* Decorative ambient circle/accent in the top-right corner */}
      <div
        className={cn(
          'pointer-events-none absolute -top-8 -right-8 size-28 rounded-full bg-gradient-to-br opacity-50 blur-xl transition-opacity duration-300 group-hover:opacity-100',
          KPI_ACCENT_TONES[tone],
        )}
        aria-hidden="true"
      />

      <div className="relative z-1 flex items-start justify-between gap-3">
        <p className="text-xs font-semibold tracking-wide text-ink-500 uppercase">{label}</p>
        {icon ? (
          <span
            className={cn(
              'grid size-9 shrink-0 place-items-center rounded-full transition-transform duration-300',
              TILE_TONES[tone],
            )}
            aria-hidden="true"
          >
            {icon}
          </span>
        ) : null}
      </div>

      <p className="relative z-1 mt-3 font-display text-3xl font-bold text-ink-900">{value}</p>
      {caption ? <p className="relative z-1 mt-1 text-sm text-ink-500">{caption}</p> : null}

      {target ? (
        <div className="relative z-1">
          <p
            className={cn(
              'mt-2 flex items-center gap-1.5 text-sm font-medium',
              target.met ? 'text-success' : 'text-danger',
            )}
          >
            {target.met ? (
              <TrendingUp className="size-4" aria-hidden="true" />
            ) : (
              <TrendingDown className="size-4" aria-hidden="true" />
            )}
            {target.met ? common.kpi.onTarget : common.kpi.belowTarget}
          </p>
          {target.note ? <p className="mt-1 text-xs text-ink-500">{target.note}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
