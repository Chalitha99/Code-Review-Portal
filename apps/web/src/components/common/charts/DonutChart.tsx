import { useId, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { cn } from '@/components/ui';
import { useMediaQuery } from '@/hooks/useMediaQuery.ts';
import { ChartTooltip } from './ChartTooltip.tsx';
import {
  CHART_TOOLTIP_ESCAPE,
  CHART_TOOLTIP_WRAPPER_STYLE,
  tooltipDatum,
  tooltipPoints,
} from './chartTooltipPayload.ts';

/**
 * Donut + legend, as drawn on the Reports (04–06) and Analytics (17) screens.
 *
 * The legend is our own markup rather than Recharts' `<Legend>`: the wireframe
 * shows a right-aligned value column beside each label, and it must stay
 * readable when the chart is hidden from assistive tech. The `<svg>` is
 * `aria-hidden` and the legend carries the numbers, so a screen-reader user gets
 * the data rather than an unlabelled graphic.
 *
 * **Two hover surfaces, on purpose.** Hovering an arc gives a tooltip AND dims
 * the other slices; hovering or keyboard-focusing a legend row gives the same
 * dimming without the tooltip. That is not redundancy — the legend is the
 * accessible presentation, so it has to be independently usable, and a pointer
 * user reaching for a 6px arc deserves an easier target than the arc.
 *
 * This used to be a tooltip-free component, because the SVG was wrapped in
 * `inert` to keep it out of the tab order and `inert` removes pointer events
 * too. It is now `tabIndex={-1}` instead, which is both a stronger guarantee and
 * a narrower one — see the note at the chart below.
 */

export interface DonutSlice {
  id: string;
  label: string;
  value: number;
  /** Semantic colour, resolved by the caller from a token. */
  color: string;
}

export function DonutChart({
  slices,
  /** Rendered inside the ring — a total, a percentage. */
  centerLabel,
  centerCaption,
  emptyLabel,
  valueLabel,
  size = 168,
  showValues = true,
  className,
}: {
  slices: readonly DonutSlice[];
  centerLabel?: string | undefined;
  centerCaption?: string | undefined;
  emptyLabel: string;
  /**
   * Names what a slice's number counts, in the tooltip — "Tasks", "Reviews".
   *
   * From `content/*.json` at the call site rather than defaulted here: a shared
   * chart component guessing the noun would put an English literal in a
   * component, which §9 forbids, and would be wrong on half the callers anyway.
   */
  valueLabel: string;
  size?: number | undefined;
  showValues?: boolean | undefined;
  className?: string | undefined;
}) {
  const titleId = useId();
  const [activeId, setActiveId] = useState<string | null>(null);

  /*
    Recharts animates SVG attributes from JavaScript, so the global
    `prefers-reduced-motion` block in `global.css` does NOT reach it — that block
    can only neutralise CSS animations and transitions. The query has to be read
    here and passed in, or the one animation in the product that ignores the
    user's setting is the one drawn by a library.
  */
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  // FL 2.4.3: an analytics panel with no data shows an explicit empty state, not
  // a zero-value ring that reads as a rendering failure.
  if (total === 0) {
    return (
      <div
        className={cn(
          'flex w-full flex-1 flex-col items-center justify-center py-8 text-center',
          className,
        )}
      >
        <div className="relative mb-3 flex size-16 items-center justify-center rounded-full border-2 border-dashed border-line-strong/80 bg-canvas/60">
          <span className="bg-ink-300 size-2 rounded-full" aria-hidden="true" />
        </div>
        <p className="text-ink-800 text-sm font-semibold">{emptyLabel}</p>
        <p className="mt-1 text-xs text-ink-500">Data will appear once tasks are processed</p>
      </div>
    );
  }

  return (
    <div className={cn('@container flex w-full min-w-0 flex-col items-center', className)}>
      <div className="flex w-full flex-col items-center justify-center gap-6 @min-[30rem]:flex-row @min-[30rem]:items-center @min-[30rem]:justify-between">
        <div className="relative shrink-0" style={{ width: size, height: size }} aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart tabIndex={-1}>
              <Tooltip
                cursor={false}
                allowEscapeViewBox={CHART_TOOLTIP_ESCAPE}
                wrapperStyle={CHART_TOOLTIP_WRAPPER_STYLE}
                content={(props) => {
                  if (props.active !== true) return null;

                  const point = tooltipDatum<DonutSlice>(tooltipPoints(props.payload)[0]?.payload);
                  if (point === undefined) return null;

                  const pct = total > 0 ? Math.round((point.value / total) * 100) : 0;

                  return (
                    <ChartTooltip
                      title={point.label}
                      rows={[
                        {
                          key: point.id,
                          label: valueLabel,
                          value: `${point.value} (${pct}%)`,
                          color: point.color,
                        },
                      ]}
                      footer={`${pct}% of ${total} total ${valueLabel.toLowerCase()}`}
                    />
                  );
                }}
              />
              <Pie
                data={slices}
                dataKey="value"
                nameKey="label"
                rootTabIndex={-1}
                onMouseEnter={(_, index) => {
                  setActiveId(slices[index]?.id ?? null);
                }}
                onMouseLeave={() => {
                  setActiveId(null);
                }}
                innerRadius="58%"
                outerRadius="94%"
                paddingAngle={3}
                cornerRadius={4}
                stroke="#ffffff"
                strokeWidth={2}
                startAngle={90}
                endAngle={-270}
                isAnimationActive={!prefersReducedMotion}
                animationDuration={600}
                animationEasing="ease-out"
                animationBegin={60}
              >
                {slices.map((slice) => {
                  const isHovered = activeId === slice.id;
                  const isOtherHovered = activeId !== null && !isHovered;
                  return (
                    <Cell
                      key={slice.id}
                      fill={slice.color}
                      opacity={isOtherHovered ? 0.25 : 1}
                      stroke={isHovered ? slice.color : '#ffffff'}
                      strokeWidth={isHovered ? 3 : 2}
                      className="cursor-pointer transition-all duration-200"
                      style={{
                        transition:
                          'opacity 200ms ease, stroke 200ms ease, stroke-width 200ms ease',
                      }}
                    />
                  );
                })}
              </Pie>
            </PieChart>
          </ResponsiveContainer>

          {centerLabel !== undefined ? (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-ink-950 font-display text-2xl font-extrabold tracking-tight">
                {centerLabel}
              </span>
              {centerCaption ? (
                <span className="mt-0.5 text-[11px] font-semibold tracking-wider text-ink-500 uppercase">
                  {centerCaption}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        <ul aria-labelledby={titleId} className="w-full min-w-0 flex-1 space-y-1 text-sm">
          <li id={titleId} className="sr-only">
            {emptyLabel}
          </li>
          {slices.map((slice) => {
            const isHovered = activeId === slice.id;
            const pct = total > 0 ? Math.round((slice.value / total) * 100) : 0;
            return (
              <li key={slice.id}>
                <button
                  type="button"
                  onMouseEnter={() => {
                    setActiveId(slice.id);
                  }}
                  onMouseLeave={() => {
                    setActiveId(null);
                  }}
                  onFocus={() => {
                    setActiveId(slice.id);
                  }}
                  onBlur={() => {
                    setActiveId(null);
                  }}
                  className={cn(
                    'group/legend flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-left transition-all duration-150',
                    isHovered
                      ? 'text-ink-950 bg-canvas font-semibold shadow-2xs ring-1 ring-line'
                      : activeId !== null
                        ? 'text-ink-600 opacity-35 hover:opacity-100'
                        : 'text-ink-700 hover:bg-canvas/80',
                  )}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span
                      className={cn(
                        'size-2.5 shrink-0 rounded-full transition-transform duration-150',
                        isHovered && 'scale-125 shadow-2xs ring-2 ring-white',
                      )}
                      style={{ backgroundColor: slice.color }}
                      aria-hidden="true"
                    />
                    <span className="text-ink-800 truncate text-xs font-medium">{slice.label}</span>
                  </div>
                  {showValues ? (
                    <div className="flex shrink-0 items-center gap-2 text-xs tabular-nums">
                      <span className="font-semibold text-ink-900">{slice.value}</span>
                      <span className="rounded-md bg-canvas px-1.5 py-0.5 text-[11px] font-medium text-ink-500">
                        {pct}%
                      </span>
                    </div>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
