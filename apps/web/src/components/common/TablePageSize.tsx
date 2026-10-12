import { cn } from '@/components/ui';
import common from '@/content/common.json';
import { Select, type SelectOption } from '@/components/ui/Select.tsx';

/**
 * The "Rows per page" control.
 *
 * Its own component rather than markup inside `DataTable` for the reason every
 * shared control here is: it is a labelled `Select` with a fixed width cap and a
 * particular label, and the moment a second surface wants one — a card list, a
 * server-paged grid — the alternative is a second copy that drifts.
 *
 * Stateless. The page size belongs to the table instance, so this renders a
 * value and reports a change; it never holds one.
 */
export function TablePageSize({
  value,
  options,
  onChange,
  className,
}: {
  value: number;
  options: readonly number[];
  onChange: (size: number) => void;
  className?: string | undefined;
}) {
  const selectOptions: SelectOption[] = options.map((option) => ({
    value: String(option),
    label: String(option),
  }));

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="text-xs whitespace-nowrap text-ink-500">{common.table.rowsPerPage}</span>
      <div className="w-24">
        <Select
          value={String(value)}
          onValueChange={(next) => {
            onChange(Number(next));
          }}
          options={selectOptions}
          aria-label={common.table.rowsPerPage}
        />
      </div>
    </div>
  );
}
