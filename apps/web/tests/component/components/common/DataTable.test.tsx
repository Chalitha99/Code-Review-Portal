import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataTable } from '@/components/common/DataTable.tsx';
import { columnHelper } from '@/components/common/dataTableColumns.ts';

/**
 * DataTable is the only grid in the product, and it sits on the TanStack Table
 * v9 API, which is new enough that a passing typecheck proves very little about
 * runtime behaviour. These tests exercise sorting, filtering, pagination and the
 * two empty states through the DOM rather than through the table instance.
 */

interface Row {
  id: string;
  name: string;
  customerColor: string;
  score: number;
}

const helper = columnHelper<Row>();

const columns = helper.columns([
  helper.accessor('name', { header: 'Name' }),
  helper.accessor('score', { header: 'Score' }),
]);

function makeRows(count: number): Row[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `r${index}`,
    name: `Row ${String(index).padStart(2, '0')}`,
    customerColor: '#ff0000',
    score: count - index,
  }));
}

function bodyRows() {
  const table = screen.getByRole('table');
  const body = within(table).getAllByRole('rowgroup')[1];
  if (!body) throw new Error('table has no body');
  return within(body).getAllByRole('row');
}

describe('DataTable', () => {
  it('renders one row per record with the header labels', () => {
    render(<DataTable data={makeRows(3)} columns={columns} countNoun="rows" caption="Rows" />);

    expect(screen.getByRole('columnheader', { name: /name/i })).toBeInTheDocument();
    expect(bodyRows()).toHaveLength(3);
  });

  it('sorts when a column header is activated, and announces it via aria-sort', async () => {
    const user = userEvent.setup({ delay: null });
    render(<DataTable data={makeRows(3)} columns={columns} countNoun="rows" caption="Rows" />);

    // Unsorted: seeded in descending score order.
    expect(bodyRows()[0]).toHaveTextContent('Row 00');

    // TanStack sorts numeric columns descending on the first click ("biggest
    // first" is what a user means by sorting a number), ascending on the second.
    await user.click(screen.getByRole('button', { name: /score/i }));
    expect(bodyRows()[0]).toHaveTextContent('Row 00');
    expect(screen.getByRole('columnheader', { name: /score/i })).toHaveAttribute(
      'aria-sort',
      'descending',
    );

    await user.click(screen.getByRole('button', { name: /score/i }));
    expect(bodyRows()[0]).toHaveTextContent('Row 02');
    expect(screen.getByRole('columnheader', { name: /score/i })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
  });

  it('filters by the global filter prop and reports the filtered count', () => {
    render(
      <DataTable
        data={makeRows(5)}
        columns={columns}
        globalFilter="Row 03"
        countNoun="rows"
        caption="Rows"
      />,
    );

    expect(bodyRows()).toHaveLength(1);
    // The range describes what survived the filter: row 1 of 1 match.
    // `totalCount` is not in this line — see the range suite.
    expect(screen.getByText('Showing 1 to 1 of 1 rows')).toBeInTheDocument();
  });

  it('paginates and moves between pages', async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <DataTable
        data={makeRows(12)}
        columns={columns}
        pageSize={5}
        countNoun="rows"
        caption="Rows"
      />,
    );

    expect(bodyRows()).toHaveLength(5);
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /next page/i }));
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
    expect(bodyRows()[0]).toHaveTextContent('Row 05');
  });

  /*
   * Regression: the pagination dead end.
   *
   * The task grids (My Tasks, Available Tasks, the admin grid) filter OUTSIDE
   * TanStack and hand `DataTable` an already-filtered array, so the table's own
   * filter pipeline never runs and never resets `pageIndex`. Filtering while on
   * page 2 therefore left the user on a page that no longer exists: zero rows
   * rendered, the pager hidden because `pageCount` had dropped to 1, and the
   * "no matching records" state silent because rows did exist — just not on
   * this page. There was no control left to escape with.
   */
  it('returns to page 1 when the caller filters the data down while on a later page', async () => {
    const user = userEvent.setup({ delay: null });
    const { rerender } = render(
      <DataTable
        data={makeRows(12)}
        columns={columns}
        pageSize={5}
        countNoun="rows"
        totalCount={12}
        caption="Rows"
      />,
    );

    await user.click(screen.getByRole('button', { name: /next page/i }));
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();

    // The screen's own filter bar narrows the set to a single page's worth.
    rerender(
      <DataTable
        data={makeRows(3)}
        columns={columns}
        pageSize={5}
        countNoun="rows"
        totalCount={12}
        caption="Rows"
      />,
    );

    // Rows are visible rather than an empty grid with no way out.
    expect(bodyRows()).toHaveLength(3);
    expect(screen.getByText('Showing 1 to 3 of 3 rows')).toBeInTheDocument();
  });

  it('distinguishes "nothing here yet" from "no matches"', () => {
    const { unmount } = render(
      <DataTable data={[]} columns={columns} countNoun="rows" caption="Rows" />,
    );
    expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
    unmount();

    render(
      <DataTable
        data={makeRows(3)}
        columns={columns}
        globalFilter="nothing matches this"
        countNoun="rows"
        caption="Rows"
      />,
    );
    expect(screen.getByText('No matching records')).toBeInTheDocument();
  });

  /**
   * The count line: rows on screen, out of rows there are to page through.
   *
   * Every assertion here compares the first number against `bodyRows()` rather
   * than against a literal, because that equality IS the line's meaning. Two
   * wrong things it has been at different times: the whole filtered set ("Showing
   * 47 of 47" above a 15-row page), and a bare count that could not say WHICH
   * fifteen of the forty-seven were on screen — pages 1, 2 and 3 all read alike.
   *
   * The trap the last-page cases exist for: the page SIZE is not the row count.
   * An unclamped `to` on the last page of 51 at 15 a page reads "46 to 60 of 51",
   * which is both wrong and impossible.
   */
  describe('the row range', () => {
    /** The rendered line, parsed back out so a test can compare it to the DOM. */
    function shownRange() {
      const line = screen.getByText(/^Showing /).textContent ?? '';
      const match = /Showing (\d+) to (\d+) of (\d+)/.exec(line);
      if (!match) throw new Error(`count line does not parse: "${line}"`);
      return { from: Number(match[1]), to: Number(match[2]), total: Number(match[3]) };
    }

    /**
     * What the line claims, and what is really rendered.
     *
     * `span` is the width the range describes; it must equal the number of rows
     * in the DOM or the line is describing something that is not on screen.
     */
    function claimVsDom() {
      const range = shownRange();
      return { ...range, span: range.to - range.from + 1, rendered: bodyRows().length };
    }

    it('walks first, middle and the short final page', async () => {
      const user = userEvent.setup({ delay: null });
      // 47 rows at 15 a page: 15 + 15 + 15 + 2. The last page is deliberately
      // shorter than the page size — the case an off-by-one hides in.
      render(
        <DataTable
          data={makeRows(47)}
          columns={columns}
          pageSize={15}
          countNoun="rows"
          caption="Rows"
        />,
      );

      expect(claimVsDom()).toEqual({ from: 1, to: 15, total: 47, span: 15, rendered: 15 });

      await user.click(screen.getByRole('button', { name: /next page/i }));
      // The range MOVED. A bare count would read identically here to page 1,
      // which is the whole reason this is a range.
      expect(claimVsDom()).toEqual({ from: 16, to: 30, total: 47, span: 15, rendered: 15 });
      expect(screen.getByText('Page 2 of 4')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /next page/i }));
      expect(claimVsDom()).toEqual({ from: 31, to: 45, total: 47, span: 15, rendered: 15 });

      await user.click(screen.getByRole('button', { name: /next page/i }));
      // Clamped: 46 to 47, not 46 to 60. And `to` never exceeds the total.
      expect(claimVsDom()).toEqual({ from: 46, to: 47, total: 47, span: 2, rendered: 2 });
    });

    it('never runs past the end when fewer rows exist than the page size', () => {
      // 9 records, 15 a page — the end value must be 9, not 15.
      render(
        <DataTable
          data={makeRows(9)}
          columns={columns}
          pageSize={15}
          countNoun="rows"
          caption="Rows"
        />,
      );

      expect(claimVsDom()).toEqual({ from: 1, to: 9, total: 9, span: 9, rendered: 9 });
      expect(screen.getByText('Showing 1 to 9 of 9 rows')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /next page/i })).not.toBeInTheDocument();
    });

    it('keeps task-table pagination visible and disabled for a single page', () => {
      render(
        <DataTable
          data={makeRows(9)}
          columns={columns}
          pageSize={15}
          alwaysShowPagination
          countNoun="tasks"
          caption="Tasks"
        />,
      );

      expect(screen.getByText('Showing 1 to 9 of 9 tasks')).toBeInTheDocument();
      expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /previous page/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /next page/i })).toBeDisabled();
    });

    it('disables previous on the first page and next on the last', async () => {
      const user = userEvent.setup({ delay: null });
      render(
        <DataTable
          data={makeRows(12)}
          columns={columns}
          pageSize={5}
          countNoun="rows"
          caption="Rows"
        />,
      );

      expect(screen.getByRole('button', { name: /previous page/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /next page/i })).toBeEnabled();

      await user.click(screen.getByRole('button', { name: /next page/i }));
      expect(screen.getByRole('button', { name: /previous page/i })).toBeEnabled();
      expect(screen.getByRole('button', { name: /next page/i })).toBeEnabled();

      await user.click(screen.getByRole('button', { name: /next page/i }));
      expect(screen.getByRole('button', { name: /next page/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /previous page/i })).toBeEnabled();
    });

    it('recomputes when the page size changes', async () => {
      const user = userEvent.setup({ delay: null });
      render(
        <DataTable
          data={makeRows(30)}
          columns={columns}
          pageSize={10}
          countNoun="rows"
          caption="Rows"
        />,
      );

      await user.click(screen.getByRole('button', { name: /next page/i }));
      expect(claimVsDom()).toEqual({ from: 11, to: 20, total: 30, span: 10, rendered: 10 });

      await user.click(screen.getByRole('combobox', { name: /rows per page/i }));
      await user.click(screen.getByRole('option', { name: '50' }));

      // One page now. The snap-back to page 1 has to reach the count as well —
      // this is the assertion that fails if the line is read off a stale page.
      expect(claimVsDom()).toEqual({ from: 1, to: 30, total: 30, span: 30, rendered: 30 });
    });

    it('recalculates the visible task page status when the page size changes', async () => {
      const user = userEvent.setup({ delay: null });
      render(
        <DataTable
          data={makeRows(30)}
          columns={columns}
          pageSize={10}
          alwaysShowPagination
          countNoun="tasks"
          caption="Tasks"
        />,
      );

      expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
      await user.click(screen.getByRole('combobox', { name: /rows per page/i }));
      await user.click(screen.getByRole('option', { name: '50' }));

      expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /previous page/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /next page/i })).toBeDisabled();
    });

    it('reads 1 to 1 for a single row and 0 to 0 when a filter matches nothing', () => {
      const { unmount } = render(
        <DataTable data={makeRows(1)} columns={columns} countNoun="rows" caption="Rows" />,
      );
      expect(screen.getByText('Showing 1 to 1 of 1 rows')).toBeInTheDocument();
      unmount();

      render(
        <DataTable
          data={makeRows(5)}
          columns={columns}
          globalFilter="nothing matches this"
          countNoun="rows"
          caption="Rows"
        />,
      );
      // Not "Showing 1 to 0 of 0", which is what an unguarded start prints on an
      // empty set. One template covers both, so they cannot drift apart.
      expect(screen.getByText('Showing 0 to 0 of 0 rows')).toBeInTheDocument();
    });

    it('keeps an empty task-table footer stable with one disabled page', () => {
      render(
        <DataTable
          data={[]}
          columns={columns}
          alwaysShowPagination
          countNoun="tasks"
          caption="Tasks"
        />,
      );

      expect(screen.getByText('Showing 0 tasks')).toBeInTheDocument();
      expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /previous page/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /next page/i })).toBeDisabled();
    });

    it('follows a search, moving both numbers together', async () => {
      const user = userEvent.setup({ delay: null });
      // The grid filters through TanStack here, which is what lets one render
      // change the filter without the caller re-slicing `data`.
      const { rerender } = render(
        <DataTable
          data={makeRows(47)}
          columns={columns}
          pageSize={15}
          countNoun="rows"
          caption="Rows"
        />,
      );

      await user.click(screen.getByRole('button', { name: /next page/i }));
      expect(shownRange()).toEqual({ from: 16, to: 30, total: 47 });

      rerender(
        <DataTable
          data={makeRows(47)}
          columns={columns}
          pageSize={15}
          globalFilter="Row 0"
          countNoun="rows"
          caption="Rows"
        />,
      );

      // "Row 00".."Row 09" — ten matches, all on one page, and the total is the
      // MATCHES rather than the 47 behind them. A total that ignored the filter
      // would leave the line saying "of 47" next to a pager that had dropped to
      // a single page.
      expect(claimVsDom()).toEqual({ from: 1, to: 10, total: 10, span: 10, rendered: 10 });
    });

    it('sits in the footer beside the pager on a grid with a heading', () => {
      /*
       * Placement, not wording. Developer and Reviewer grids pass `heading` and
       * used to have their count line lifted into the card header, while every
       * Admin grid kept it in the footer — the same control in two places
       * depending on the workspace. The Admin layout is the reference.
       */
      render(
        <DataTable
          data={makeRows(30)}
          columns={columns}
          pageSize={15}
          heading={{ title: 'My Tasks' }}
          countNoun="rows"
          caption="Rows"
        />,
      );

      const count = screen.getByText('Showing 1 to 15 of 30 rows');
      const footer = count.parentElement?.parentElement;
      expect(footer).toBeTruthy();
      // The page-size control and the pager are its siblings, so it is the
      // footer bar it is in and not the title row.
      expect(within(footer!).getByRole('combobox', { name: /rows per page/i })).toBeInTheDocument();
      expect(within(footer!).getByRole('button', { name: /next page/i })).toBeInTheDocument();

      // And it is the only copy of the text, which `e2e/developer.spec.ts`
      // depends on.
      expect(screen.getAllByText(/^Showing /)).toHaveLength(1);
    });
  });

  /**
   * The rows fade in when the visible set changes; the header never does.
   *
   * Both halves are load-bearing and neither is decoration. Fading the wrapper —
   * headers included — is a recorded axe regression (6.6:1 → 3.4:1 on the column
   * headers), and it is why a background refresh gets a hairline bar rather than
   * a dim. So a test that only checked "something animates" would pass on exactly
   * the implementation that was rejected.
   *
   * The remount is asserted through `key` behaviour rather than by reading a
   * class off `<tbody>` twice: React reuses the element when the key is stable,
   * so a fresh DOM node IS the animation restarting.
   */
  describe('the row transition', () => {
    function tbody() {
      const table = screen.getByRole('table');
      const groups = within(table).getAllByRole('rowgroup');
      const body = groups[1];
      if (!body) throw new Error('table has no body');
      return body;
    }

    it('restarts the fade on a page change, and never touches the header', async () => {
      const user = userEvent.setup({ delay: null });
      render(
        <DataTable
          data={makeRows(30)}
          columns={columns}
          pageSize={10}
          countNoun="rows"
          caption="Rows"
        />,
      );

      const head = screen.getAllByRole('rowgroup')[0];
      const before = tbody();
      expect(before).toHaveClass('animate-reveal-fade');
      // The header is a separate element and carries no animation of its own.
      expect(head).not.toHaveClass('animate-reveal-fade');

      await user.click(screen.getByRole('button', { name: /next page/i }));

      // A DIFFERENT node: the key changed, React remounted, the CSS animation
      // runs again. Same node would mean the fade fired once and never after.
      expect(tbody()).not.toBe(before);
      expect(tbody()).toHaveClass('animate-reveal-fade');
      // The header survived the swap untouched — it is outside the faded element
      // entirely, which is the whole point of putting the class here.
      expect(screen.getAllByRole('rowgroup')[0]).toBe(head);
      expect(screen.getAllByRole('rowgroup')[0]).not.toHaveClass('animate-reveal-fade');
    });

    it('does not restart on a re-render that leaves the rows alone', () => {
      const { rerender } = render(
        <DataTable data={makeRows(5)} columns={columns} countNoun="rows" caption="Rows" />,
      );

      const before = tbody();
      // Same data, same page, same filters — only an unrelated prop moves. If the
      // key were derived from something that changes every render, every grid in
      // the product would fade on every keystroke elsewhere on the page.
      rerender(
        <DataTable
          data={makeRows(5)}
          columns={columns}
          countNoun="rows"
          caption="Rows"
          className="mt-4"
        />,
      );

      expect(tbody()).toBe(before);
    });
  });

  it('paints the accent bar from getRowAccent on the first cell only', () => {
    render(
      <DataTable
        data={makeRows(1)}
        columns={columns}
        getRowAccent={(row) => row.customerColor}
        countNoun="rows"
        caption="Rows"
      />,
    );

    const cells = within(bodyRows()[0]!).getAllByRole('cell');
    expect(cells[0]).toHaveStyle({ borderLeftColor: '#ff0000' });
    expect(cells[1]).not.toHaveAttribute('style');
  });

  it('calls onRowClick without overriding the row role', async () => {
    const user = userEvent.setup({ delay: null });
    const onRowClick = vi.fn();
    render(
      <DataTable
        data={makeRows(2)}
        columns={columns}
        onRowClick={onRowClick}
        countNoun="rows"
        caption="Rows"
      />,
    );

    await user.click(bodyRows()[0]!);
    expect(onRowClick).toHaveBeenCalledWith(expect.objectContaining({ name: 'Row 00' }));

    // Regression guard: an earlier version set `role="button"` and `tabIndex` on
    // the `<tr>`, which removed every row from the table's structure. The rows
    // must stay rows, and must not become tab stops.
    for (const row of bodyRows()) {
      expect(row).not.toHaveAttribute('role');
      expect(row).not.toHaveAttribute('tabindex');
    }
  });

  it('surfaces loading and error states instead of an empty grid', () => {
    const { unmount } = render(
      <DataTable data={undefined} columns={columns} isLoading countNoun="rows" caption="Rows" />,
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
    unmount();

    render(
      <DataTable
        data={undefined}
        columns={columns}
        error={new Error('boom')}
        countNoun="rows"
        caption="Rows"
      />,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('keeps the column headers standing while the first page loads', () => {
    // The skeleton renders INSIDE the real table. That is the whole point: the
    // header row and the column widths are already settled when the data lands,
    // so nothing jumps. A spinner in place of the table cannot do that.
    render(
      <DataTable data={undefined} columns={columns} isLoading countNoun="rows" caption="Rows" />,
    );

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /name/i })).toBeInTheDocument();
  });

  it('keeps the rows on screen when a refresh fails over good data', async () => {
    /*
     * The regression this locks down is "the data table suddenly disappears".
     *
     * TanStack Query keeps the last good `data` when a background refetch fails,
     * and this component used to return an error card whenever `error` was set —
     * so one dropped request replaced a full, correct grid with an error state,
     * losing the user's page and filters over a failure that had already been
     * recovered from.
     */
    const onRetry = vi.fn();
    render(
      <DataTable
        data={makeRows(3)}
        columns={columns}
        error={new Error('refresh failed')}
        onRetry={onRetry}
        countNoun="rows"
        caption="Rows"
      />,
    );

    expect(bodyRows()).toHaveLength(3);

    // Reported, not hidden — and still retryable.
    const warning = screen.getByRole('alert');
    expect(warning).toHaveTextContent(/out of date/i);

    await userEvent
      .setup({ delay: null })
      .click(within(warning).getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('offers a row-count control that repages the grid', async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <DataTable
        data={makeRows(30)}
        columns={columns}
        pageSize={10}
        countNoun="rows"
        caption="Rows"
      />,
    );

    expect(bodyRows()).toHaveLength(10);

    // Radix Select needs a real pointer sequence; `selectOptions` is for native.
    await user.click(screen.getByRole('combobox', { name: /rows per page/i }));
    await user.click(await screen.findByRole('option', { name: '50' }));

    expect(bodyRows()).toHaveLength(30);
    // One page now, so the pager retires and the footer keeps only the control.
    expect(screen.queryByRole('button', { name: /next page/i })).not.toBeInTheDocument();
  });

  it('offers the row-count control by default, even on a grid that fits', () => {
    /*
     * It used to appear only once the result set was larger than the smallest
     * option, which hid it on exactly the grids a user reaches for it on: filter
     * a long list down to eight rows and there was no way to raise the page size
     * back afterwards.
     */
    render(
      <DataTable
        data={makeRows(3)}
        columns={columns}
        pageSize={10}
        countNoun="rows"
        caption="Rows"
      />,
    );

    expect(screen.getByRole('combobox', { name: /rows per page/i })).toBeInTheDocument();
  });

  it('hides the row-count control when the caller turns it off', () => {
    // The short administered lists — task types, checklist categories — never
    // reach a second page, so the control would offer a choice with no effect.
    render(
      <DataTable
        data={makeRows(30)}
        columns={columns}
        pageSize={10}
        rowCountSelector={false}
        countNoun="rows"
        caption="Rows"
      />,
    );

    expect(screen.queryByRole('combobox', { name: /rows per page/i })).not.toBeInTheDocument();
    // The pager is unaffected — turning the selector off is not turning paging off.
    expect(screen.getByRole('button', { name: /next page/i })).toBeInTheDocument();
  });

  it('leaves no accent gutter on a grid that has no accent to draw', () => {
    // Every task grid used to pass `getRowAccent`, which painted an unexplained
    // stripe down each row and pushed the first column out of line with its own
    // header. Only Admin → Customers still asks for one.
    render(<DataTable data={makeRows(1)} columns={columns} countNoun="rows" caption="Rows" />);

    const cells = within(bodyRows()[0]!).getAllByRole('cell');
    expect(cells[0]).not.toHaveAttribute('style');
    expect(cells[0]?.className).not.toMatch(/border-l-/);
  });

  it('pins the actions column to the right edge and leaves the others scrollable', () => {
    const withActions = helper.columns([
      helper.accessor('name', { header: 'Name' }),
      helper.display({ id: 'actions', header: '', cell: () => <button>Open</button> }),
    ]);
    render(<DataTable data={makeRows(1)} columns={withActions} countNoun="rows" caption="Rows" />);

    const headers = screen.getAllByRole('columnheader');
    expect(headers[0]?.className).not.toMatch(/sticky/);
    expect(headers[1]?.className).toMatch(/sticky.*right-0/);

    const cells = within(bodyRows()[0]!).getAllByRole('cell');
    expect(cells[0]?.className).not.toMatch(/sticky/);
    expect(cells[1]?.className).toMatch(/sticky.*right-0/);
  });

  /**
   * Optional row reordering.
   *
   * The interaction itself is pointer-driven and native, so jsdom cannot drive
   * it — there is no `DataTransfer` here, and the drag path is covered in
   * `e2e/admin.spec.ts`. What IS testable, and what actually protects the other
   * ten grids, is everything around it: that the feature is absent unless asked
   * for, that it withdraws when it would be meaningless, and that the keyboard
   * route produces the same move a drop would.
   */
  describe('row reordering', () => {
    const handleName = /reorder row/i;

    function reorderProps(onDrop: (move: unknown) => void, canDrop?: () => boolean) {
      return {
        onDrop,
        handleLabel: (row: Row) => `Reorder ${row.name}`,
        ...(canDrop ? { canDrop } : {}),
      };
    }

    it('adds no handle, and no column, unless the caller asks for one', () => {
      render(
        <DataTable
          data={makeRows(3)}
          columns={columns}
          getRowId={(row) => row.id}
          countNoun="rows"
          caption="Rows"
        />,
      );

      expect(screen.queryByRole('button', { name: handleName })).not.toBeInTheDocument();
      // Two declared columns and two cells: the handle column is not merely
      // empty, it does not exist. Every other grid in the product is this case.
      expect(within(bodyRows()[0]!).getAllByRole('cell')).toHaveLength(2);
      expect(screen.getAllByRole('columnheader')).toHaveLength(2);
    });

    it('adds a labelled handle per row when it does', () => {
      render(
        <DataTable
          data={makeRows(3)}
          columns={columns}
          getRowId={(row) => row.id}
          reorder={reorderProps(vi.fn())}
          countNoun="rows"
          caption="Rows"
        />,
      );

      expect(screen.getAllByRole('button', { name: handleName })).toHaveLength(3);
      // Named per row, not "Reorder" nine times — an icon-only control with a
      // generic name tells a screen-reader user nothing about which row it moves.
      expect(screen.getByRole('button', { name: 'Reorder Row 00' })).toBeInTheDocument();
      expect(within(bodyRows()[0]!).getAllByRole('cell')).toHaveLength(3);
    });

    it('keeps rows as rows — no tabIndex, no role — even while reorderable', () => {
      /*
       * The same guard as `onRowClick` below, restated because reordering is the
       * change most likely to break it: the obvious way to make a row draggable
       * is `draggable`+`tabIndex` on the `<tr>`, and that removes every row from
       * the table's structure for screen-reader users.
       */
      render(
        <DataTable
          data={makeRows(3)}
          columns={columns}
          getRowId={(row) => row.id}
          reorder={reorderProps(vi.fn())}
          countNoun="rows"
          caption="Rows"
        />,
      );

      for (const row of bodyRows()) {
        expect(row).not.toHaveAttribute('role');
        expect(row).not.toHaveAttribute('tabindex');
      }

      /*
       * `draggable` IS set on the row, and that is fine — it is what native
       * HTML5 drag needs, it carries no ARIA meaning and it does not make the
       * row a tab stop. The two attributes above are the ones that would break
       * the grid's semantics; this asserts the distinction rather than leaving
       * a future reader to assume all three were an oversight.
       */
      expect(bodyRows()[0]).toHaveAttribute('draggable', 'true');
    });

    it('withdraws the handles while a column sort is active', async () => {
      const user = userEvent.setup({ delay: null });
      render(
        <DataTable
          data={makeRows(3)}
          columns={columns}
          getRowId={(row) => row.id}
          reorder={reorderProps(vi.fn())}
          countNoun="rows"
          caption="Rows"
        />,
      );

      expect(screen.getAllByRole('button', { name: handleName })).toHaveLength(3);

      await user.click(screen.getByRole('button', { name: /score/i }));

      // A manual order and a sorted view are competing claims about what the row
      // order means. Offering a handle here would write a sequence the user
      // cannot see.
      expect(screen.queryByRole('button', { name: handleName })).not.toBeInTheDocument();
      expect(within(bodyRows()[0]!).getAllByRole('cell')).toHaveLength(2);
    });

    it('moves a row with the arrow keys, reporting it as a position', async () => {
      const user = userEvent.setup({ delay: null });
      const onDrop = vi.fn();
      render(
        <DataTable
          data={makeRows(4)}
          columns={columns}
          getRowId={(row) => row.id}
          reorder={reorderProps(onDrop)}
          countNoun="rows"
          caption="Rows"
        />,
      );

      const handles = screen.getAllByRole('button', { name: handleName });
      handles[2]!.focus();

      await user.keyboard('{ArrowUp}');
      // The third row, moved before the second — reported by id and side, never
      // as "index 1", which on page 2 of a paged grid would mean the wrong row.
      expect(onDrop).toHaveBeenCalledWith({
        movedId: 'r2',
        targetId: 'r1',
        placement: 'before',
      });

      await user.keyboard('{ArrowDown}');
      expect(onDrop).toHaveBeenLastCalledWith({
        movedId: 'r2',
        targetId: 'r3',
        placement: 'after',
      });
    });

    it('does nothing at the ends of the page', async () => {
      const user = userEvent.setup({ delay: null });
      const onDrop = vi.fn();
      render(
        <DataTable
          data={makeRows(3)}
          columns={columns}
          getRowId={(row) => row.id}
          reorder={reorderProps(onDrop)}
          countNoun="rows"
          caption="Rows"
        />,
      );

      const handles = screen.getAllByRole('button', { name: handleName });

      handles[0]!.focus();
      await user.keyboard('{ArrowUp}');
      handles[2]!.focus();
      await user.keyboard('{ArrowDown}');

      // No neighbour, no move — rather than an off-by-one that reports a target
      // which is not there.
      expect(onDrop).not.toHaveBeenCalled();
    });

    it('refuses a keyboard move the caller rejects', async () => {
      const user = userEvent.setup({ delay: null });
      const onDrop = vi.fn();
      render(
        <DataTable
          data={makeRows(3)}
          columns={columns}
          getRowId={(row) => row.id}
          reorder={reorderProps(onDrop, () => false)}
          countNoun="rows"
          caption="Rows"
        />,
      );

      screen.getAllByRole('button', { name: handleName })[1]!.focus();
      await user.keyboard('{ArrowUp}');

      // `canDrop` gates the keyboard exactly as it gates a drop. Quality
      // Checklist uses it to keep a question inside its own category, and a
      // keyboard path that ignored it would be a way around the rule.
      expect(onDrop).not.toHaveBeenCalled();
    });
  });
});
