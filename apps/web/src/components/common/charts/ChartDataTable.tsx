/**
 * The accessible presentation of a chart, for the charts a legend cannot carry.
 *
 * Every chart in this product hides its SVG from assistive technology and puts
 * the real data somewhere a screen reader can read it. For a donut that place is
 * the legend beside it — five rows, each a label and a number, which is the
 * whole dataset.
 *
 * A time series has no such luxury: twelve weeks × two series is twenty-four
 * numbers, and a legend that listed them would be a table pretending not to be
 * one. So it is a table, visually hidden, sitting immediately after the chart in
 * reading order.
 *
 * `sr-only` rather than `aria-hidden` + a summary: a summary is somebody's
 * opinion of the data, and the point of the accessible presentation is that it
 * carries the same information the sighted user gets, not a précis of it.
 *
 * THE WRAPPER IS LOAD-BEARING. `sr-only` sets `position: absolute; width: 1px;
 * overflow: hidden` but leaves `display` alone, and a `display: table` box sizes
 * to its content regardless of the width it is given — `white-space: nowrap`,
 * also part of `sr-only`, guarantees it. So `sr-only` applied directly to the
 * `<table>` clipped it visually while it still laid out 405px wide, widening the
 * document at narrow viewports. `e2e/responsive.spec.ts` caught it as
 * `table.sr-only → right 405px > 320px` on Reviewer Analytics at 320px.
 *
 * On a `<div>` the utility does what it is designed to do, and the table
 * overflowing its 1px hidden parent is contained rather than pushing the page.
 * The table keeps plain `display: table`, so its semantics — caption, column and
 * row headers — are untouched, which is the entire point of rendering one.
 */
export function ChartDataTable({
  caption,
  columns,
  rows,
}: {
  /** Names the chart. Read out before the data, so it must stand alone. */
  caption: string;
  columns: readonly string[];
  /** Pre-formatted cells, in column order. */
  rows: readonly { key: string; cells: readonly string[] }[];
}) {
  return (
    <div className="sr-only">
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              {row.cells.map((cell, index) =>
                // The first cell names the row, so it is a header for it — that
                // is what lets a screen reader announce "week of 2 March:
                // approved 4" rather than reading four bare numbers.
                index === 0 ? (
                  <th key={columns[index] ?? String(index)} scope="row">
                    {cell}
                  </th>
                ) : (
                  <td key={columns[index] ?? String(index)}>{cell}</td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
