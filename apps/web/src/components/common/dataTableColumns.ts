import {
  columnFilteringFeature,
  createColumnHelper,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
} from '@tanstack/react-table';

/**
 * Table feature registration and the column-definition helper.
 *
 * Split from `DataTable.tsx` so that file exports only components, which is what
 * React Fast Refresh needs to hot-reload a grid without losing its state — the
 * same reason `fieldContext.ts` is separate from `Field.tsx`.
 */

/**
 * Registered once at module scope. v9 has no global feature set:
 * `table.state.sorting` does not exist unless `rowSortingFeature` is in this
 * object, and a fresh object per render would rebuild every row model.
 */
export interface TableColumnMeta {
  headerClassName?: string;
  cellClassName?: string;
  className?: string;
}

const defaultMeta: TableColumnMeta = {};

export const tableFeaturesInUse = tableFeatures({
  columnFilteringFeature,
  globalFilteringFeature,
  rowSortingFeature,
  rowPaginationFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  columnMeta: defaultMeta,
});

export type TableFeaturesInUse = typeof tableFeaturesInUse;

/**
 * Build columns with `columnHelper<Row>()` so accessor keys and cell values stay
 * inferred from the row type.
 */
export function columnHelper<TRow extends object>() {
  return createColumnHelper<TableFeaturesInUse, TRow>();
}

/**
 * One column definition, extracted from the library's own type.
 *
 * Written as an indexed access rather than spelled out because `ColumnDef`'s
 * third generic is the cell's value type, which differs per column — the library
 * models that as `any`, and extracting it here means that `any` is never written
 * in our own code.
 */
export type TaskColumn<TRow extends object> = ReturnType<
  ReturnType<typeof columnHelper<TRow>>['columns']
>[number];

/**
 * A list of columns.
 *
 * Deliberately a plain array rather than the tuple `columns()` returns. Grids
 * that vary their columns (the reviewer queues show an assignee, My Tasks does
 * not) build the list conditionally, and a conditional spread collapses the
 * tuple inference — which silently degraded every `cell` callback's argument to
 * `any`. Defining each column separately keeps the cells fully typed, and this
 * type accepts the assembled result.
 */
export type ColumnList<TRow extends object> = TaskColumn<TRow>[];
