import type { ReactNode } from 'react';

/**
 * The hover card every chart in the product shares.
 *
 * Recharts' `DefaultTooltipContent` is a white box with an unstyled list. It
 * looks like a library default because it is one, and it ignores the token layer
 * entirely — so a chart tooltip was the one surface in the app that did not
 * match the app.
 *
 * Recharts requires HTML here, not SVG (it portals the content into a `div`
 * above the chart), which is why this is ordinary markup and can use the same
 * `shadow-popover` and `rounded-card` the Select and Dialog use.
 *
 * The chart passes rows in; this decides nothing about the data. That keeps
 * value FORMATTING with the caller, where the unit is known — a count, a
 * percentage and a duration all read differently and a shared tooltip that
 * guessed would get two of the three wrong.
 */

export interface ChartTooltipRow {
  key: string;
  label: string;
  /** Already formatted. See the note above. */
  value: string;
  /** Resolved hex from `chartPalette`, matching the mark it describes. */
  color?: string | undefined;
}

export function ChartTooltip({
  title,
  rows,
  footer,
}: {
  title: string;
  rows: readonly ChartTooltipRow[];
  /** A contextual total or comparison — the thing the rows do not say alone. */
  footer?: ReactNode | undefined;
}) {
  return (
    /*
      `pointer-events-none` matters more than it looks. The tooltip is positioned
      under the cursor, so without it the card itself becomes the hover target,
      the chart loses the pointer, the tooltip closes, the chart regains it — and
      the whole thing flickers at the refresh rate.
    */
    <div className="pointer-events-none min-w-44 rounded-card border border-line bg-surface p-3 shadow-popover">
      <p className="text-xs font-semibold tracking-wide text-ink-500 uppercase">{title}</p>

      <dl className="mt-2 space-y-1.5">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center gap-2 text-sm">
            {row.color === undefined ? null : (
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: row.color }}
                aria-hidden="true"
              />
            )}
            <dt className="min-w-0 flex-1 truncate text-ink-700">{row.label}</dt>
            <dd className="shrink-0 font-semibold text-ink-900 tabular-nums">{row.value}</dd>
          </div>
        ))}
      </dl>

      {footer === undefined ? null : (
        <div className="mt-2 border-t border-line pt-2 text-xs text-ink-500">{footer}</div>
      )}
    </div>
  );
}
