import { useId } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { cn } from '@/components/ui';
import { useMediaQuery } from '@/hooks/useMediaQuery.ts';
import { EmptyState } from '../states.tsx';
import { ChartDataTable } from './ChartDataTable.tsx';
import { ChartTooltip, type ChartTooltipRow } from './ChartTooltip.tsx';
import { CHART_TOOLTIP_WRAPPER_STYLE, tooltipPoints } from './chartTooltipPayload.ts';

/**
 * A stacked area chart for "how much of this happened, over time".
 *
 * The product's first cartesian chart. Everything before it was a donut, which
 * can only answer "what is the mix right now" — a trend needs an axis.
 *
 * COMPOSITION NOTES, because most of the work here is subtraction:
 *
 * - Horizontal grid lines only. Vertical ones add a cage without adding a
 *   reading: the x positions are already marked by the ticks underneath.
 * - No axis lines and no tick marks. The grid already establishes the scale, so
 *   the axis rule is a third line saying the same thing.
 * - Integer y ticks only. These are counts of reviews; "2.5 reviews" is not a
 *   quantity, and Recharts will happily invent one on a short range.
 * - A gradient that fades to nothing rather than a flat fill, so two stacked
 *   series stay legible where they overlap.
 */

export interface TrendSeries {
  /** Key into each datum. */
  id: string;
  label: string;
  color: string;
}

export interface TrendDatum {
  /** The x value. Opaque here; `formatX` decides how it reads. */
  x: string;
  [seriesId: string]: string | number;
}

export function TrendAreaChart({
  data,
  series,
  emptyLabel,
  formatX,
  formatXLong,
  formatValue = (value) => String(value),
  formatTotal,
  height = 260,
  tableCaption,
  className,
}: {
  data: readonly TrendDatum[];
  series: readonly TrendSeries[];
  emptyLabel: string;
  /** Axis tick — short. "2 Mar" */
  formatX: (x: string) => string;
  /** Tooltip title — unambiguous. "Week of 2 March 2026" */
  formatXLong: (x: string) => string;
  formatValue?: ((value: number) => string) | undefined;
  /**
   * The tooltip's footer line.
   *
   * Separate from `formatValue` because a bare total under a list of series
   * reads as another series: "Changes Requested 3" followed by "3" invites the
   * reader to wonder what the second 3 counts. The caller names it.
   */
  formatTotal?: ((total: number) => string) | undefined;
  height?: number | undefined;
  tableCaption: string;
  className?: string | undefined;
}) {
  const gradientId = useId();
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  if (data.length === 0) {
    return <EmptyState title={emptyLabel} className={className} />;
  }

  return (
    <div className={cn('w-full min-w-0', className)}>
      {/*
        `aria-hidden` with an explicit `tabIndex={-1}`.

        Recharts adds `role="application"` and `tabindex="0"` to its root SVG
        when its accessibility layer is on, which put a focusable element inside
        an `aria-hidden` subtree — axe's `aria-hidden-focus`, and a real dead stop
        when tabbing. This used to be solved with `inert`, which also killed
        pointer events and made tooltips impossible.

        Reading Recharts 3.10's `RootSurface`: an explicit `tabIndex` prop is
        used verbatim and only falls back to the accessibility layer's `0` when
        absent. So passing `-1` is a guarantee rather than a request — a stronger
        one than `inert` gave — and it leaves the pointer alone. The `<table>`
        below carries the data for anyone who cannot see the chart.
      */}
      <div aria-hidden="true">
        <ResponsiveContainer width="100%" height={height}>
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }} tabIndex={-1}>
            <defs>
              {series.map((entry) => (
                <linearGradient
                  key={entry.id}
                  id={`${gradientId}-${entry.id}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor={entry.color} stopOpacity={0.32} />
                  <stop offset="100%" stopColor={entry.color} stopOpacity={0.02} />
                </linearGradient>
              ))}
            </defs>

            <CartesianGrid
              vertical={false}
              stroke="#e8eaf2"
              strokeDasharray="0"
              // `--color-line`. A hairline, so the grid sits behind the data
              // rather than competing with it.
            />

            <XAxis
              dataKey="x"
              tickFormatter={formatX}
              tickLine={false}
              axisLine={false}
              tickMargin={10}
              minTickGap={16}
              tick={{ fill: '#626b85', fontSize: 12 }}
            />
            <YAxis
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              width={44}
              tick={{ fill: '#626b85', fontSize: 12 }}
            />

            <Tooltip
              // A soft vertical band rather than a line: it reads as "this
              // column" instead of drawing a fifth rule across the plot.
              cursor={{ fill: '#0f2167', fillOpacity: 0.04 }}
              // The popover tier, stated rather than assumed. Nothing is
              // painted after this chart today, so it is not broken — but
              // `ChartDataTable` is its sibling, and the day that gains
              // positioning this chart inherits the donut's bug. One tier,
              // declared in one place.
              wrapperStyle={CHART_TOOLTIP_WRAPPER_STYLE}
              content={(props) => {
                if (props.active !== true) return null;

                const points = tooltipPoints(props.payload);
                if (points.length === 0) return null;

                const valueOf = (seriesId: string) =>
                  points.find((point) => point.dataKey === seriesId)?.value ?? 0;

                const rows: ChartTooltipRow[] = series.map((entry) => ({
                  key: entry.id,
                  label: entry.label,
                  value: formatValue(valueOf(entry.id)),
                  color: entry.color,
                }));

                const total = series.reduce((sum, entry) => sum + valueOf(entry.id), 0);

                return (
                  <ChartTooltip
                    title={formatXLong(String(props.label ?? ''))}
                    rows={rows}
                    footer={formatTotal === undefined ? formatValue(total) : formatTotal(total)}
                  />
                );
              }}
            />

            {series.map((entry) => (
              <Area
                key={entry.id}
                type="monotone"
                dataKey={entry.id}
                name={entry.label}
                stackId="stack"
                stroke={entry.color}
                strokeWidth={2}
                fill={`url(#${gradientId}-${entry.id})`}
                // Nothing at rest, a ring under the pointer. A dot on every
                // point turns a twelve-week line into beads on a string.
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: '#ffffff' }}
                isAnimationActive={!prefersReducedMotion}
                animationDuration={420}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <ChartDataTable
        caption={tableCaption}
        columns={['', ...series.map((entry) => entry.label)]}
        rows={data.map((datum) => ({
          key: datum.x,
          cells: [
            formatXLong(datum.x),
            ...series.map((entry) => {
              const value = datum[entry.id];
              return formatValue(typeof value === 'number' ? value : 0);
            }),
          ],
        }))}
      />
    </div>
  );
}
