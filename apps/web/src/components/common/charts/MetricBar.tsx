import { cn } from '@/components/ui';

/**
 * Horizontal progress meter — the "Approval Rate 25%" bar on each developer row
 * in the Reports screen, and the checklist section progress in the wizard.
 *
 * `role="progressbar"` with the aria-value trio rather than a bare styled div:
 * the fill width is the only visual cue, and a screen reader cannot measure it.
 */
export function MetricBar({
  value,
  max = 100,
  label,
  /** Right-aligned readout, e.g. "25%" or "4 of 12". */
  valueLabel,
  tone = 'brand',
  className,
}: {
  value: number;
  max?: number;
  label: string;
  valueLabel?: string;
  tone?: 'brand' | 'success' | 'warning' | 'danger';
  className?: string;
}) {
  const safeMax = max <= 0 ? 1 : max;
  const percent = Math.max(0, Math.min(100, (value / safeMax) * 100));

  const fill = {
    brand: 'bg-violet-600',
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
  }[tone];

  return (
    <div className={cn('min-w-0', className)}>
      <div className="flex items-center gap-3">
        <div
          role="progressbar"
          aria-label={label}
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={safeMax}
          {...(valueLabel === undefined ? {} : { 'aria-valuetext': valueLabel })}
          className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-canvas ring-1 ring-line ring-inset"
        >
          {/*
            `width` animates here, which standards §8 otherwise bans.

            The ban exists because animating width forces layout every frame and,
            on a reveal, transiently widens `scrollWidth`. Neither applies: this
            is a one-shot data-driven fill inside a fixed-height track that is
            already `overflow-hidden`, so nothing outside the track can be
            reflowed or pushed out, and it runs once when the figure lands rather
            than on every pointer move. `transform: scaleX` would be the
            compositor-friendly alternative and is worse — it stretches the
            rounded end cap into an ellipse.

            It is a CSS transition, so the global `prefers-reduced-motion` block
            in `global.css` neutralises it.
          */}
          <div
            className={cn('h-full rounded-full transition-[width] duration-500 ease-out', fill)}
            style={{ width: `${String(percent)}%` }}
          />
        </div>
        {valueLabel === undefined ? null : (
          <span className="shrink-0 text-xs font-semibold text-ink-900 tabular-nums">
            {valueLabel}
          </span>
        )}
      </div>
    </div>
  );
}
