import { forwardRef, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTable, type ColumnFiltersState, type SortingState } from '@tanstack/react-table';
import {
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  GripVertical,
} from 'lucide-react';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import {
  draggable,
  dropTargetForElements,
} from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import {
  attachClosestEdge,
  extractClosestEdge,
  type Edge,
} from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { cn } from '@/components/ui';
import common from '@/content/common.json';
import { interpolate } from '@/lib/formatters.ts';
import { tableFeaturesInUse, type ColumnList } from './dataTableColumns.ts';
import { TableSkeleton } from './Skeleton.tsx';
import { TablePageSize } from './TablePageSize.tsx';
import { Alert } from '@/components/ui/Alert.tsx';
import { ApiError } from '@/lib/apiClient.ts';
import { EmptyState, ErrorState } from './states.tsx';

/**
 * The one grid implementation, from Components sheet "08 · Tables".
 *
 * TanStack Table v9 supplies the row models (filter → sort → paginate) and owns
 * no markup; every cell is rendered by us, so the wireframe styling is exact
 * rather than fought against. That is the whole reason a headless library was
 * chosen over AG Grid.
 *
 * Filter *controls* deliberately live outside this component. Each screen's
 * filter bar is different — status and priority on My Tasks, role on Users — so
 * the table takes filter state as props and the screen composes its own bar.
 */

/** A fresh `[]` per render would invalidate the row models every time. */
const NO_ROWS: readonly never[] = [];

/**
 * One completed move, reported as a POSITION rather than an index.
 *
 * An index would be an index into the visible page, and the caller almost never
 * wants that: these grids page at 10–15 and filter outside the table, so row 3
 * on screen is not record 3. "X now sits before Y" is resolvable against
 * whatever the caller considers the real list, which is the only way a
 * paginated grid can produce a correct whole-collection order.
 */
export interface ReorderMove {
  movedId: string;
  targetId: string;
  placement: 'before' | 'after';
}

export interface DataTableProps<TRow extends object> {
  data: readonly TRow[] | undefined;
  /** Built with `columnHelper<TRow>()` from `dataTableColumns.ts`. */
  columns: ColumnList<TRow>;

  /** Stable row identity. Falls back to array index when omitted. */
  getRowId?: ((row: TRow, index: number) => string) | undefined;

  /**
   * Left accent bar colour, per row.
   *
   * Used by ONE grid: Admin → Customers, where the bar is the customer's own
   * colour and is the point of the row. The task grids passed
   * `task.customerColor` too, which produced a rainbow of unexplained stripes
   * down every list — the colour means nothing there, because the customer is
   * already named in its own column.
   *
   * Returning `undefined` leaves the row unaccented, and a grid that never
   * returns a colour gets no accent gutter at all.
   */
  getRowAccent?: ((row: TRow) => string | undefined) | undefined;

  /** Whole-row activation. Rows become focusable and Enter-activatable when set. */
  onRowClick?: ((row: TRow) => void) | undefined;

  /** Free-text search, owned by the screen's filter bar. */
  globalFilter?: string | undefined;
  columnFilters?: ColumnFiltersState | undefined;
  initialSorting?: SortingState | undefined;
  onSortingChange?: ((sorting: SortingState) => void) | undefined;

  pageSize?: number | undefined;
  initialPageIndex?: number | undefined;
  onPaginationChange?: ((pageIndex: number, pageSize: number) => void) | undefined;

  /**
   * Whether the footer offers the "Rows per page" control.
   *
   * On by default, and an explicit switch rather than something inferred from
   * the row count. It used to appear only once the result set was larger than
   * the smallest option, which hid it on precisely the grids a user reaches for
   * it on — a filtered grid of eight rows offered no way to raise the page size
   * back before filtering. Turn it off for a panel that lists a handful of rows
   * and has no pager.
   */
  rowCountSelector?: boolean | undefined;

  /** Choices offered by the "Rows per page" control. */
  pageSizeOptions?: readonly number[] | undefined;

  /**
   * Keep page status and disabled previous/next controls visible for a
   * single-page or empty result. Paginated dashboard grids use this for a
   * stable footer.
   */
  alwaysShowPagination?: boolean | undefined;

  /**
   * Plural noun for the "Showing 1 to 15 of 51 tasks" line.
   *
   * Required, and per-grid, because the same component lists tasks, questions,
   * users, customers and handovers. Hardcoding a noun in the shared footer is
   * how a grid of users comes to report itself in tasks.
   */
  countNoun: string;

  /**
   * Unfiltered size of the collection, when the caller filters `data` itself.
   *
   * It no longer feeds the count line — that reports the range on screen out of
   * the filtered set — but it is still load-bearing for the EMPTY STATE, which
   * is the one place the distinction survives: a `totalCount` above zero with no
   * rows left means "no matches, widen your filter", where zero means "nothing
   * here yet". A pre-filtered grid that omits this prop shows a new user the
   * wrong one of those two messages.
   */
  totalCount?: number | undefined;

  /** First load, with nothing to show yet. Renders skeleton rows. */
  isLoading?: boolean | undefined;

  /**
   * A refresh is in flight over rows that are already on screen.
   *
   * Marks the grid `aria-busy` and shows a hairline progress bar above it; it
   * never unmounts the rows and never dims them. It DID dim them once — see the
   * note above the bar itself for why that was removed and must not come back.
   *
   * This is also the prop a server-paged endpoint will drive when the user
   * changes page or page size, which is why it is separate from `isLoading`.
   */
  isFetching?: boolean | undefined;

  error?: unknown;
  onRetry?: (() => void) | undefined;

  /** Shown when the *unfiltered* set is empty — a different message from "no matches". */
  emptyState?: ReactNode | undefined;

  /** Rendered above the table: search field, selects, action buttons. */
  toolbar?: ReactNode | undefined;

  /**
   * In-card title row, from wireframes 16 and 07 — icon and title on the left.
   *
   * Title only. This prop used to ALSO move the count line up into this row,
   * which is how Developer and Reviewer grids came to announce their row count
   * in the card header while every Admin grid announced it in the footer. The
   * same control, two places, depending on which workspace you were in — and the
   * two even used different type sizes. The count now always sits in the footer
   * beside the pager and the page-size control it describes, which is where the
   * Admin grids already had it.
   */
  heading?: { icon?: ReactNode; title: string } | undefined;

  /**
   * Opt-in drag-to-reorder. Omit it — as every grid but one does — and nothing
   * about the table changes: no handle column, no drag listeners, no keyboard
   * additions.
   *
   * The table owns the INTERACTION and nothing else. It does not know what an
   * order is, where it is stored, or when it is saved; it reports completed
   * moves and lets the feature decide. That is why `onDrop` is positional and
   * why there is no `onSave` here — batching, dirty state and the API call
   * belong to the screen that understands the records.
   *
   * Requires `getRowId`: without stable ids a move refers to nothing.
   * Handles are hidden while a column sort is active, because a manual order
   * and a sorted view cannot both be the truth.
   */
  reorder?:
    | {
        /** A drop, or an arrow-key move, completed. */
        onDrop: (move: ReorderMove) => void;
        /**
         * Refuse a target. Quality Checklist uses it to keep a question inside
         * its own category, since `order` is scoped per category.
         */
        canDrop?: ((movedId: string, targetId: string) => boolean) | undefined;
        /** Accessible name for the row's handle — an icon needs one. */
        handleLabel: (row: TRow) => string;
      }
    | undefined;

  /** Accessible name for the `<table>`. */
  caption: string;
  className?: string | undefined;
  /** Optional trigger to reset page index to 0 when filters change. */
  resetPageIndexTrigger?: unknown;
  /** Custom empty state when data is filtered down to 0 items but totalCount > 0. */
  filteredEmptyState?: ReactNode | undefined;
}

const EMPTY_FILTERS: ColumnFiltersState = [];
const EMPTY_SORTING: SortingState = [];

/**
 * Sensible steps for the row-count control. 10 fits a laptop without scrolling;
 * 100 is where a client-side grid stops being pleasant and the caller should be
 * paging server-side instead.
 */
const DEFAULT_PAGE_SIZE_OPTIONS = [10, 15, 25, 50, 100] as const;

export function DataTable<TRow extends object>({
  data,
  columns,
  getRowId,
  getRowAccent,
  onRowClick,
  globalFilter = '',
  columnFilters = EMPTY_FILTERS,
  initialSorting = EMPTY_SORTING,
  onSortingChange,
  pageSize = 10,
  initialPageIndex = 0,
  onPaginationChange,
  rowCountSelector = true,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  alwaysShowPagination = false,
  countNoun,
  totalCount,
  isLoading = false,
  isFetching = false,
  error,
  onRetry,
  emptyState,
  toolbar,
  heading,
  reorder,
  caption,
  className,
  resetPageIndexTrigger,
  filteredEmptyState,
}: DataTableProps<TRow>) {
  const rows = (data ?? NO_ROWS) as TRow[];

  const initialState = useMemo(
    () => ({ sorting: initialSorting, pagination: { pageIndex: initialPageIndex, pageSize } }),
    // `initialState` is read once by the table; recomputing it on every filter
    // change would be wasted work and, worse, would reset the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const table = useTable({
    features: tableFeaturesInUse,
    data: rows,
    columns,
    initialState,
    state: { globalFilter, columnFilters },
    ...(getRowId ? { getRowId } : {}),
  });

  const filtered = table.getFilteredRowModel().rows.length;

  /*
   * Snap back to page 1 when the row set shrinks past the current page.
   *
   * The task grids filter OUTSIDE TanStack — `filterTasks(data, filters)` runs
   * in the screen and the already-filtered array arrives as `data` — so the
   * table's own filter pipeline never fires and never resets `pageIndex`.
   *
   * The result was a dead end: filter while on page 2, the row count drops to
   * one page, and the table renders ZERO rows. The pager is hidden (it needs
   * `pageCount > 1`), and the "no results" empty state does not fire either
   * because `filtered` is not zero. Nothing left on screen could get the user
   * back to a page with rows on it.
   *
   * Declared ABOVE the loading and error returns: a hook after an early return
   * runs conditionally, which breaks the rules of hooks.
   */
  useEffect(() => {
    const lastPage = table.getPageCount();
    if (lastPage > 0 && table.state.pagination.pageIndex >= lastPage) {
      table.setPageIndex(0);
    }
  }, [table, filtered]);

  const lastResetTrigger = useRef(resetPageIndexTrigger);
  useEffect(() => {
    if (lastResetTrigger.current !== resetPageIndexTrigger) {
      lastResetTrigger.current = resetPageIndexTrigger;
      table.setPageIndex(0);
    }
  }, [resetPageIndexTrigger, table]);

  const lastInitialPage = useRef(initialPageIndex);
  useEffect(() => {
    if (lastInitialPage.current !== initialPageIndex) {
      lastInitialPage.current = initialPageIndex;
      table.setPageIndex(initialPageIndex ?? 0);
    }
  }, [initialPageIndex, table]);

  const lastReportedPage = useRef<number | null>(null);
  const lastReportedSize = useRef<number | null>(null);
  const onPaginationChangeRef = useRef(onPaginationChange);
  useEffect(() => {
    onPaginationChangeRef.current = onPaginationChange;
  }, [onPaginationChange]);
  const lastReportedSorting = useRef('');

  useEffect(() => {
    const pIndex = table.state.pagination.pageIndex;
    const pSize = table.state.pagination.pageSize;
    if (lastReportedPage.current !== pIndex || lastReportedSize.current !== pSize) {
      lastReportedPage.current = pIndex;
      lastReportedSize.current = pSize;
      onPaginationChangeRef.current?.(pIndex, pSize);
    }
  }, [table.state.pagination.pageIndex, table.state.pagination.pageSize]);

  useEffect(() => {
    const serialized = JSON.stringify(table.state.sorting);
    if (lastReportedSorting.current !== serialized) {
      lastReportedSorting.current = serialized;
      onSortingChange?.(table.state.sorting);
    }
  }, [onSortingChange, table.state.sorting]);

  // The pinned actions column shows a soft edge shadow only while there is more
  // grid hidden behind it. The attribute is set on the DOM directly: a scroll
  // handler that set state would re-render the whole grid on every frame.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = scrollRef.current;
    if (!box) return;
    const update = () => {
      const hasMore = box.scrollWidth - box.clientWidth - box.scrollLeft > 1;
      box.toggleAttribute('data-more', hasMore);
    };
    update();
    box.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(box);
    if (box.firstElementChild) observer.observe(box.firstElementChild);
    return () => {
      box.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, []);

  const hasError = error !== undefined && error !== null;
  const total = totalCount ?? rows.length;
  const pageRows = table.getRowModel().rows;
  const pageCount = table.getPageCount();
  const pageIndex = table.state.pagination.pageIndex;
  const currentPageSize = table.state.pagination.pageSize;

  /*
   * WHICH rows are on screen, out of how many there are to page through:
   * "Showing 16 to 30 of 51 tasks".
   *
   * The arithmetic lives here rather than in any screen, so eleven grids cannot
   * drift apart on it. `pageIndex` is TanStack's ZERO-based index, hence the
   * `+ 1` — the visible numbering is one-based.
   *
   * `to` is clamped to `filtered` so the last page reads "46 to 51 of 51" rather
   * than running past the end to 60; that clamp is the whole of the partial-page
   * case. `from` is guarded to 0 so an empty result reads "0 to 0 of 0" instead
   * of the "1 to 0" an unguarded start produces — one template, no zero branch.
   *
   * `filtered` is the denominator because it is the set being paginated: the
   * pager's own `Page 2 of 4` is computed from exactly this number, so the two
   * halves of the footer cannot disagree, and a search moves the range and the
   * total together. `totalCount` stays out of it — see the note on that prop for
   * the job it still does. A server-paged caller passes its page as `data` and
   * the server's total as… nothing yet; that seam is Phase 2 (ADR-0003).
   */
  /*
   * Reordering is off while a column sort is on.
   *
   * The two are different claims about what the row order MEANS, and only one
   * can be true at a time: dragging a row in a list sorted by Question text
   * would write a sequence the user cannot see and did not ask for. Hiding the
   * handles says so without a message, and clearing the sort brings them back.
   */
  const isSorted = table.state.sorting.length > 0;
  const reorderable = reorder !== undefined && !isSorted && !isLoading;

  /*
   * The keyboard path, expressed as the same move a drop makes.
   *
   * Resolved against `pageRows`, so a nudge is "swap with the neighbour you can
   * see" — the honest reading when part of the collection is on another page.
   * At the top or bottom of the page there is no neighbour and nothing happens.
   */
  function nudge(rowId: string, index: number, direction: 'up' | 'down') {
    if (!reorder) return;

    const neighbour = pageRows[direction === 'up' ? index - 1 : index + 1];
    if (!neighbour) return;
    if (reorder.canDrop && !reorder.canDrop(rowId, neighbour.id)) return;

    reorder.onDrop({
      movedId: rowId,
      targetId: neighbour.id,
      placement: direction === 'up' ? 'before' : 'after',
    });
  }

  const rangeFrom = filtered === 0 ? 0 : pageIndex * currentPageSize + 1;
  const rangeTo = Math.min((pageIndex + 1) * currentPageSize, filtered);

  const countLine =
    filtered === 0 && alwaysShowPagination
      ? interpolate(common.table.showingEmpty, { noun: countNoun })
      : interpolate(common.table.showingRange, {
          from: rangeFrom,
          to: rangeTo,
          total: filtered,
          noun: countNoun,
        });

  /*
   * Identity of the visible row set, used to key `<tbody>` so a page change, a
   * filter or the skeleton handing over to real data re-runs the fade below —
   * and an unrelated re-render does not.
   *
   * A key rather than a `useEffect` + class toggle: remounting is what restarts
   * a CSS animation, and doing it declaratively means there is no state to fall
   * out of sync with what is rendered.
   */
  const bodyKey = [
    isLoading ? 'skeleton' : 'rows',
    pageIndex,
    currentPageSize,
    globalFilter,
    JSON.stringify(columnFilters),
  ].join('|');

  /*
   * The caller's own `pageSize` is folded into the choices.
   *
   * Several grids open at 15, which is not one of the default steps — and a
   * Radix Select whose `value` matches no option renders its placeholder, so the
   * control would read "Rows per page: —" until the user picked something.
   */
  const sizeChoices = [...new Set([...pageSizeOptions, currentPageSize])].sort((a, b) => a - b);

  const showPageSize = rowCountSelector && !isLoading && sizeChoices.length > 1;
  const displayedPageCount = Math.max(1, pageCount);
  const displayedPageIndex = Math.min(pageIndex, displayedPageCount - 1);
  const showPagination = alwaysShowPagination || pageCount > 1;

  /*
   * Unconditional once there is anything to describe.
   *
   * It used to be `pageCount > 1 || showPageSize || heading === undefined`, back
   * when a headed grid carried its count in the card header and the footer was
   * only ever the pager's home. With the count line living here on every grid,
   * that condition would hide it on exactly the small single-page grids where it
   * is the only thing telling you how much you are looking at.
   */
  const showFooter = !isLoading;
  const paginationFooter = showFooter ? (
    <TablePaginationFooter
      countLine={countLine}
      showPageSize={showPageSize}
      pageSize={currentPageSize}
      pageSizeOptions={sizeChoices}
      onPageSizeChange={(size) => {
        table.setPageSize(size);
      }}
      showPagination={showPagination}
      page={displayedPageIndex + 1}
      totalPages={displayedPageCount}
      canGoPrevious={showPagination && table.getCanPreviousPage()}
      canGoNext={showPagination && table.getCanNextPage()}
      onPrevious={() => table.previousPage()}
      onNext={() => table.nextPage()}
    />
  ) : null;

  /*
   * An error only REPLACES the grid when there is nothing else to show.
   *
   * This used to be `if (error) return <ErrorState/>` unconditionally, which was
   * the "the table suddenly disappears" defect: TanStack Query keeps the last
   * good `data` when a background refetch fails, so a single failed refresh —
   * a dropped connection, a restarting API, a 502 — swapped a full, correct
   * grid for an error card. The user lost their page, their scroll position and
   * their filters over a failure that had already been recovered from.
   *
   * With rows in hand the failure is reported as a banner ABOVE the grid
   * instead, and the rows stay where they are. See the `staleWarning` branch
   * further down.
   */
  if (hasError && rows.length === 0 && !isLoading) {
    return (
      <TableShell className={className} heading={heading} toolbar={toolbar}>
        <ErrorState
          {...(error instanceof ApiError ? { message: error.message } : {})}
          {...(onRetry ? { onRetry } : {})}
        />
      </TableShell>
    );
  }

  if (!isLoading && total === 0) {
    return (
      <TableShell className={className} heading={heading} toolbar={toolbar}>
        {emptyState ?? <EmptyState title={common.table.empty} />}
        {alwaysShowPagination ? paginationFooter : null}
      </TableShell>
    );
  }

  return (
    <TableShell className={className} heading={heading} toolbar={toolbar}>
      {hasError ? (
        <div className="px-4 pt-3 sm:px-5">
          <Alert
            tone="warning"
            action={
              onRetry ? (
                <button
                  type="button"
                  onClick={onRetry}
                  className="cursor-pointer rounded text-xs font-semibold text-brand-blue-600 hover:text-brand-blue-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
                >
                  {common.actions.retry}
                </button>
              ) : null
            }
          >
            {common.table.staleWarning}
          </Alert>
        </div>
      ) : null}

      {/*
        A background refresh is announced by `aria-busy` and a hairline progress
        bar, and by nothing else. The rows below are real and still usable —
        sorting and paging during a refresh are perfectly reasonable — so it must
        not be a takeover.

        It was briefly `opacity-60` on this wrapper, which the real-browser axe
        run rejected: fading the grid drops the column headers from 6.6:1 to
        3.4:1 against white. Dimming text to advertise that it is still readable
        is self-defeating, and jsdom cannot see it. The bar sits outside the text
        entirely, so there is no contrast to lose.

        On the FIRST load the wrapper also becomes a live region. The skeleton
        rows inside it are `aria-hidden` decoration, so without this a screen
        reader would meet an empty table and no explanation; the announcement is
        what the centred `LoadingState` used to provide.
      */}
      {isFetching && !isLoading ? (
        <div className="relative h-0.5 overflow-hidden bg-line/60" aria-hidden="true">
          <span className="absolute inset-y-0 w-1/3 animate-shimmer bg-violet-600" />
        </div>
      ) : null}

      <div
        ref={scrollRef}
        className="group/scroll max-w-full min-w-0 overflow-x-auto"
        aria-busy={isLoading || isFetching}
        {...(isLoading ? { role: 'status' as const, 'aria-live': 'polite' as const } : {})}
      >
        {isLoading ? <span className="sr-only">{common.states.loading}</span> : null}

        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id} className="border-b border-line">
                {/*
                  The handle column's header. Named rather than empty: a column
                  with no header is announced as a blank, and a screen-reader
                  user moving across the row would meet an unlabelled control in
                  an unlabelled column.
                */}
                {reorderable ? (
                  <th scope="col" className="w-10 px-4 py-3">
                    <span className="sr-only">{common.table.reorderColumn}</span>
                  </th>
                ) : null}

                {group.headers.map((header) => {
                  const sortable = header.column.getCanSort();
                  const direction = header.column.getIsSorted();
                  const meta = header.column.columnDef.meta;

                  return (
                    <th
                      key={header.id}
                      scope="col"
                      // `aria-sort` is what tells a screen reader the column is
                      // sorted; the arrow glyph alone conveys nothing.
                      aria-sort={
                        direction === 'asc'
                          ? 'ascending'
                          : direction === 'desc'
                            ? 'descending'
                            : undefined
                      }
                      className={cn(
                        'px-4 py-3 text-left text-xs font-semibold tracking-wide whitespace-nowrap text-ink-500 uppercase',
                        meta?.headerClassName,
                        meta?.className,
                        isPinnedColumn(header.column.id) && PINNED_HEAD_CLASS,
                      )}
                    >
                      {header.isPlaceholder ? null : sortable ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="inline-flex cursor-pointer items-center gap-1 rounded whitespace-nowrap transition-colors hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
                        >
                          <table.FlexRender header={header} />
                          <SortIcon direction={direction} />
                        </button>
                      ) : (
                        <table.FlexRender header={header} />
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>

          {/*
            The rows fade in; the header above them never does.

            That split is the whole design. Fading the WRAPPER was tried and
            rejected by the real-browser axe run — it takes the column headers
            from 6.6:1 to 3.4:1, and dimming text to advertise that it is still
            readable is self-defeating. `<thead>` is outside this element, so
            there is no header contrast to lose here.

            Opacity only, no `translate` and no per-row stagger. A horizontal
            transform transiently widens `scrollWidth` and `responsive.spec.ts`
            asserts the page never scrolls sideways at six widths; a stagger on
            table rows is what `Reveal.tsx` calls the most flake-prone pattern
            available, because the e2e specs read row content through
            `page.evaluate()` loops that do not wait for animations. This is one
            finite CSS animation on one element, so `settleAnimations` can await
            it and the global `prefers-reduced-motion` block flattens it.
          */}
          <tbody key={bodyKey} className="animate-reveal-fade">
            {isLoading ? (
              // Skeleton rows go INSIDE the real table, not in place of it, so
              // the header and the column widths are already settled when the
              // data lands. Swapping the whole `<table>` for a centred spinner
              // and back is what made every grid jump twice per fetch.
              <TableSkeleton
                columns={columns.length + (reorderable ? 1 : 0)}
                rows={Math.min(pageSize, 8)}
              />
            ) : (
              pageRows.map((row, index) => (
                <DataRow
                  key={row.id}
                  cells={row.getAllCells().map((cell) => ({
                    id: cell.id,
                    content: <table.FlexRender cell={cell} />,
                    pinned: isPinnedColumn(cell.column.id),
                    className: cn(
                      cell.column.columnDef.meta?.cellClassName,
                      cell.column.columnDef.meta?.className,
                    ),
                  }))}
                  accent={getRowAccent?.(row.original)}
                  {...(onRowClick ? { onActivate: () => onRowClick(row.original) } : {})}
                  {...(reorderable && reorder
                    ? {
                        reorder: {
                          rowId: row.id,
                          label: reorder.handleLabel(row.original),
                          canDrop: (movedId: string) => reorder.canDrop?.(movedId, row.id) ?? true,
                          onDrop: reorder.onDrop,
                          onNudge: (direction: 'up' | 'down') => {
                            nudge(row.id, index, direction);
                          },
                        },
                      }
                    : {})}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {!isLoading && filtered === 0
        ? (filteredEmptyState ?? (
            <EmptyState title={common.table.noResults} hint={common.table.noResultsHint} />
          ))
        : null}

      {/*
        The footer bar, identical on every grid in the product: the range on the
        left with the page-size control beside it, the pager on the right. The
        Admin grids are the reference the Developer and Reviewer grids were
        brought into line with.
      */}
      {paginationFooter}
    </TableShell>
  );
}

/**
 * The row-actions column stays pinned to the right edge of the scroll box, so
 * View / Pick / Assign / Cancel are reachable on a laptop-width screen without
 * scrolling the grid sideways first. Every page names that column `actions`.
 *
 * A sticky cell must be opaque (else the scrolled cells show through), so it
 * takes the surface colour and follows the row's hover tint via `group`. The
 * soft edge shadow is a pseudo-element (`dropEdgeClass` already owns
 * `box-shadow`), shown only while the grid has more to scroll to the right.
 */
const PINNED_COLUMN_ID = 'actions';
const PINNED_EDGE_CLASS =
  'sticky right-0 z-10 whitespace-nowrap bg-surface before:pointer-events-none before:absolute before:inset-y-0 before:-left-2.5 before:w-2.5 before:bg-gradient-to-l before:from-ink-900/[0.06] before:to-transparent before:opacity-0 before:transition-opacity group-data-[more]/scroll:before:opacity-100';
const PINNED_HEAD_CLASS = PINNED_EDGE_CLASS;
const PINNED_CELL_CLASS = `${PINNED_EDGE_CLASS} group-hover:bg-canvas`;

function isPinnedColumn(columnId: string): boolean {
  return columnId === PINNED_COLUMN_ID;
}

/** What one row needs to know about being draggable. Absent = it is not. */
interface RowReorder {
  rowId: string;
  label: string;
  canDrop: (movedId: string) => boolean;
  onDrop: (move: ReorderMove) => void;
  onNudge: (direction: 'up' | 'down') => void;
}

/**
 * One `<tr>`, extracted so a row can hold drag state of its own.
 *
 * It was an inline `.map()` until reordering arrived. Pragmatic registers
 * against a real element in an effect, and the closest-edge indicator is
 * per-row state — both need a component. Extracting it rather than branching
 * kept ONE copy of the row markup: a `reorderable`/`plain` pair would have been
 * two places to fix the next accent-bar or hover change.
 */
function DataRow({
  cells,
  accent,
  onActivate,
  reorder,
}: {
  cells: readonly {
    id: string;
    content: ReactNode;
    pinned: boolean;
    className?: string | undefined;
  }[];
  accent?: string | undefined;
  onActivate?: (() => void) | undefined;
  reorder?: RowReorder | undefined;
}) {
  const rowRef = useRef<HTMLTableRowElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);
  const [isDragging, setDragging] = useState(false);
  const [edge, setEdge] = useState<Edge | null>(null);

  useEffect(() => {
    const element = rowRef.current;
    const handle = handleRef.current;
    if (!reorder || !element || !handle) return;

    const { rowId, canDrop, onDrop } = reorder;

    /*
     * `dragHandle` is what stops the whole row being a drag surface.
     *
     * Without it every button, link and click target inside a row becomes a
     * grab point, and a plain click on Edit turns into a two-pixel drag that
     * swallows the click. The handle is the only place a drag can start.
     */
    return combine(
      draggable({
        element,
        dragHandle: handle,
        getInitialData: () => ({ rowId }),
        onDragStart: () => {
          setDragging(true);
        },
        onDrop: () => {
          setDragging(false);
        },
      }),
      dropTargetForElements({
        element,
        canDrop: ({ source }) => {
          const movedId = source.data['rowId'];
          return typeof movedId === 'string' && movedId !== rowId && canDrop(movedId);
        },
        // `attachClosestEdge` is the reason this is a library and not fifty
        // lines: it turns a pointer position into "above or below this row"
        // against the element's own box, on every frame, without us owning the
        // geometry or the dragenter/dragleave bookkeeping underneath it.
        getData: ({ input }) =>
          attachClosestEdge({ rowId }, { element, input, allowedEdges: ['top', 'bottom'] }),
        onDrag: ({ self }) => {
          setEdge(extractClosestEdge(self.data));
        },
        onDragLeave: () => {
          setEdge(null);
        },
        onDrop: ({ self, source }) => {
          setEdge(null);
          const movedId = source.data['rowId'];
          if (typeof movedId !== 'string') return;

          const dropEdge = extractClosestEdge(self.data);
          onDrop({
            movedId,
            targetId: rowId,
            placement: dropEdge === 'top' ? 'before' : 'after',
          });
        },
      }),
    );
  }, [reorder]);

  return (
    <tr
      ref={rowRef}
      // Mouse convenience only — deliberately no `tabIndex` and no
      // `role="button"`. Overriding a `<tr>`'s implicit `row` role destroys the
      // grid's structure for screen-reader users, who then cannot navigate it as
      // a table at all. Keyboard users reach the same destination through the
      // row's own action control (the trailing arrow, `Pick`, or `View` button),
      // which every grid in the wireframes has — and, on a reorderable grid,
      // through the drag handle, which is a real button for the same reason.
      {...(onActivate ? { onClick: onActivate } : {})}
      className={cn(
        // Every row gets the hover tint, not only the clickable ones: on a wide
        // grid it is what ties a value at the far right back to the ID at the
        // far left.
        'group border-b border-line transition-colors last:border-b-0 hover:bg-canvas',
        onActivate && 'cursor-pointer',
        isDragging && 'opacity-40',
      )}
    >
      {reorder ? (
        <td className={cn('py-3 pl-4 align-middle', dropEdgeClass(edge))}>
          <ReorderHandle
            ref={handleRef}
            label={reorder.label}
            onNudge={reorder.onNudge}
            isDragging={isDragging}
          />
        </td>
      ) : null}

      {cells.map((cell, index) => (
        <td
          key={cell.id}
          className={cn(
            'px-4 py-3 align-middle text-ink-700',
            // The accent bar is a left border on the first cell: a border on
            // `<tr>` does not paint under `border-collapse`, and a
            // pseudo-element would need positioning context the row cannot
            // provide.
            //
            // Only drawn when there IS a colour. It used to be unconditional
            // with a transparent fallback, which left a 3px gutter down every
            // grid and misaligned the first column against its own header.
            index === 0 && accent !== undefined && 'border-l-[3px]',
            cell.pinned && PINNED_CELL_CLASS,
            cell.className,
            // The drop line, for the same reason: `border-collapse` swallows a
            // border on the row, so the indicator is an inset shadow drawn
            // across every cell. It reads as one continuous line.
            dropEdgeClass(edge),
          )}
          style={index === 0 && accent !== undefined ? { borderLeftColor: accent } : undefined}
        >
          {cell.content}
        </td>
      ))}
    </tr>
  );
}

/**
 * The drop indicator, as an inset shadow rather than a border or a positioned
 * element — see the note at its call site.
 *
 * `Edge` is a four-way union in the library; only two are ever attached here
 * (`allowedEdges: ['top', 'bottom']`), and this narrows rather than indexing a
 * partial record, so a left/right edge cannot silently produce `undefined`.
 */
function dropEdgeClass(edge: Edge | null): string {
  if (edge === 'top') return 'shadow-[inset_0_2px_0_0_var(--color-violet-600)]';
  if (edge === 'bottom') return 'shadow-[inset_0_-2px_0_0_var(--color-violet-600)]';
  return '';
}

/**
 * The grab point, and the keyboard path to the same outcome.
 *
 * A real `<button>` with a required label, like every other icon-only control
 * here (`IconButton`, `PageButton`). Native drag-and-drop is pointer-only, so
 * without the arrow keys this feature would be unusable by keyboard — the
 * manual pass in `Reference Docs/12-accessibility.md` is explicit that every
 * interaction has to work without a mouse.
 *
 * ArrowUp/ArrowDown move immediately rather than entering a grab mode. A
 * pick-up/put-down modal interaction needs its own state, its own Escape
 * handling and its own announcements; one keypress per position is simpler to
 * operate and has nothing to get stuck in.
 */
const ReorderHandle = forwardRef<
  HTMLButtonElement,
  { label: string; isDragging: boolean; onNudge: (direction: 'up' | 'down') => void }
>(function ReorderHandle({ label, isDragging, onNudge }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
        // Otherwise the grid scrolls under the row that just moved.
        event.preventDefault();
        onNudge(event.key === 'ArrowUp' ? 'up' : 'down');
      }}
      // Stops a handle inside a clickable row from also activating the row.
      onClick={(event) => {
        event.stopPropagation();
      }}
      className={cn(
        'grid size-7 place-items-center rounded-lg text-ink-400 transition-colors',
        'hover:bg-canvas hover:text-ink-700',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600',
        isDragging ? 'cursor-grabbing' : 'cursor-grab',
      )}
    >
      <GripVertical className="size-4" aria-hidden="true" />
    </button>
  );
});

function TableShell({
  heading,
  toolbar,
  children,
  className,
}: {
  heading?: { icon?: ReactNode; title: string } | undefined;
  toolbar?: ReactNode | undefined;
  children: ReactNode;
  className?: string | undefined;
}) {
  return (
    <div
      className={cn(
        'max-w-full min-w-0 overflow-hidden rounded-2xl border border-line bg-surface shadow-card',
        className,
      )}
    >
      {/* Title only — the count line lives in the footer on every grid. */}
      {heading ? (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line bg-surface px-5 py-4">
          <h2 className="flex min-w-0 items-center gap-2.5 font-display text-lg font-bold text-ink-900">
            {heading.icon}
            <span className="truncate">{heading.title}</span>
          </h2>
        </div>
      ) : null}

      {toolbar ? (
        <div className="border-b border-line bg-canvas/30 px-5 py-3.5">{toolbar}</div>
      ) : null}
      {children}
    </div>
  );
}

function SortIcon({ direction }: { direction: false | 'asc' | 'desc' }) {
  if (direction === 'asc')
    return <ChevronUp className="ml-1 size-3.5 text-brand-blue-600" aria-hidden="true" />;
  if (direction === 'desc')
    return <ChevronDown className="ml-1 size-3.5 text-brand-blue-600" aria-hidden="true" />;
  return <ArrowUpDown className="ml-1 size-3.5 opacity-40" aria-hidden="true" />;
}

function TablePaginationFooter({
  countLine,
  showPageSize,
  pageSize,
  pageSizeOptions,
  onPageSizeChange,
  showPagination,
  page,
  totalPages,
  canGoPrevious,
  canGoNext,
  onPrevious,
  onNext,
}: {
  countLine: string;
  showPageSize: boolean;
  pageSize: number;
  pageSizeOptions: readonly number[];
  onPageSizeChange: (size: number) => void;
  showPagination: boolean;
  page: number;
  totalPages: number;
  canGoPrevious: boolean;
  canGoNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface px-5 py-3.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {/*
          The one live region for the row count.
          Changing the page, the page size or a filter changes this line and
          nothing else a screen reader would notice, so it announces itself.
          It must stay the ONLY element carrying the text: a second, `sr-only`
          copy was once added and immediately broke `e2e/developer.spec.ts`,
          which asserts on the count and found two.
        */}
        <p aria-live="polite" className="text-xs text-ink-500 tabular-nums">
          {countLine}
        </p>

        {showPageSize ? (
          <TablePageSize value={pageSize} options={pageSizeOptions} onChange={onPageSizeChange} />
        ) : null}
      </div>

      {showPagination ? (
        <div className="flex items-center gap-2">
          <PageButton
            label={common.table.previousPage}
            icon={<ChevronLeft className="size-4" aria-hidden="true" />}
            disabled={!canGoPrevious}
            onClick={onPrevious}
          />
          <span className="text-xs text-ink-500 tabular-nums">
            {interpolate(common.table.page, { page, pages: totalPages })}
          </span>
          <PageButton
            label={common.table.nextPage}
            icon={<ChevronRight className="size-4" aria-hidden="true" />}
            disabled={!canGoNext}
            onClick={onNext}
          />
        </div>
      ) : null}
    </div>
  );
}

function PageButton({
  label,
  icon,
  disabled,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-8 cursor-pointer place-items-center rounded-lg border border-line text-ink-700 transition-colors hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 disabled:pointer-events-none disabled:opacity-40"
    >
      {icon}
    </button>
  );
}
