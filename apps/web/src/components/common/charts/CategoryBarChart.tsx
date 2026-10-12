import { useState } from 'react';
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { cn } from '@/components/ui';
import { useMediaQuery } from '@/hooks/useMediaQuery.ts';
import { EmptyState } from '../states.tsx';
import { ChartDataTable } from './ChartDataTable.tsx';
import { ChartTooltip } from './ChartTooltip.tsx';
import { CHART_TOOLTIP_WRAPPER_STYLE, tooltipDatum, tooltipPoints } from './chartTooltipPayload.ts';

/**
 * Horizontal bars for a distribution across named, ORDERED bands.
 *
 * Horizontal rather than vertical because the categories carry real labels —
 * "Under 4 hours", "1–2 days" — and vertical bars would either rotate them 45°
 * or truncate them. A y-axis reads them left to right at full length.
 *
 * A bar chart rather than a donut because the bands have an order. A donut says
 * "this is the mix"; the order of its slices is arbitrary. These bands run fast
 * to slow, and that sequence is the point — where the mass sits along it is the
 * answer to "am I consistent".
 *
 * Zero-count bands are kept, not filtered. The shape of the distribution is the
 * message, and a missing band reads as a missing category rather than as "never
 * that slow".
 */

export interface BarDatum {
  id: string;
  label: string;
  value: number;
}

export function CategoryBarChart({
  data,
  color,
  emptyLabel,
  formatValue = (value) => String(value),
  tooltipLabel,
  tableCaption,
  height = 220,
  className,
}: {
  data: readonly BarDatum[];
  /** One colour: these are bands of one measure, not competing series. */
  color: string;
  emptyLabel: string;
  formatValue?: ((value: number) => string) | undefined;
  /** Names what the number is, in the tooltip. "Reviews" */
  tooltipLabel: string;
  tableCaption: string;
  height?: number | undefined;
  className?: string | undefined;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  const total = data.reduce((sum, datum) => sum + datum.value, 0);

  // Every band empty is not a distribution, it is no data. FL 2.4.3.
  if (data.length === 0 || total === 0) {
    return <EmptyState title={emptyLabel} className={className} />;
  }

  return (
    <div className={cn('w-full min-w-0', className)}>
      {/* `aria-hidden` + explicit `tabIndex={-1}` — see `TrendAreaChart`. */}
      <div aria-hidden="true">
        <ResponsiveContainer width="100%" height={height}>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 36, bottom: 4, left: 0 }}
            tabIndex={-1}
            onMouseLeave={() => {
              setActiveId(null);
            }}
          >
            <XAxis type="number" hide allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="label"
              tickLine={false}
              axisLine={false}
              // Wide enough for the longest band name on ONE line. At 96 the
              // two-word labels wrapped mid-phrase ("Under 4 / hours"), which
              // reads as a broken axis rather than a long label.
              width={104}
              tick={{ fill: '#4f5870', fontSize: 12 }}
            />

            <Tooltip
              // No cursor band. The bar itself brightens while its neighbours
              // dim, which is a clearer "this one" than a rectangle behind it.
              cursor={false}
              // The popover tier, stated rather than assumed. Nothing is
              // painted after this chart today, so it is not broken — but
              // `ChartDataTable` is its sibling, and the day that gains
              // positioning this chart inherits the donut's bug. One tier,
              // declared in one place.
              wrapperStyle={CHART_TOOLTIP_WRAPPER_STYLE}
              content={(props) => {
                if (props.active !== true) return null;

                const point = tooltipPoints(props.payload)[0];
                const datum = tooltipDatum<BarDatum>(point?.payload);
                if (point === undefined || datum === undefined) return null;

                const value = point.value ?? 0;

                return (
                  <ChartTooltip
                    title={datum.label}
                    rows={[
                      {
                        key: 'value',
                        label: tooltipLabel,
                        value: formatValue(value),
                        color,
                      },
                    ]}
                    footer={`${String(Math.round((value / total) * 100))}% of ${formatValue(total)}`}
                  />
                );
              }}
            />

            <Bar
              dataKey="value"
              radius={[0, 6, 6, 0]}
              barSize={18}
              isAnimationActive={!prefersReducedMotion}
              animationDuration={420}
              onMouseEnter={(datum: unknown) => {
                const id = (datum as { id?: string } | undefined)?.id;
                setActiveId(id ?? null);
              }}
            >
              {data.map((datum) => (
                <Cell
                  key={datum.id}
                  fill={color}
                  // Dim the rest rather than recolouring the active one: a colour
                  // change would read as a different category.
                  opacity={activeId === null || activeId === datum.id ? 1 : 0.3}
                  style={{ transition: 'opacity 150ms ease-out' }}
                />
              ))}
              <LabelList
                dataKey="value"
                position="right"
                offset={8}
                fill="#3c4661"
                fontSize={12}
                fontWeight={600}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <ChartDataTable
        caption={tableCaption}
        columns={['', tooltipLabel]}
        rows={data.map((datum) => ({
          key: datum.id,
          cells: [datum.label, formatValue(datum.value)],
        }))}
      />
    </div>
  );
}
