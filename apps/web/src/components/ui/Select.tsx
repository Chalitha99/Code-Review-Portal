import { useMemo, useState } from 'react';
import * as RadixSelect from '@radix-ui/react-select';
import { Check, ChevronDown, Search } from 'lucide-react';
import { cn } from './lib/cn.ts';
import common from '@/content/common.json';
import { useOptionalFieldControlProps } from './fieldContext.ts';

export interface SelectOption {
  value: string;
  label: string;
  /** Optional leading element — a customer colour dot, a status badge. */
  adornment?: React.ReactNode;
  disabled?: boolean;
}

export interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: readonly SelectOption[];
  /** Shown when nothing is selected, and as the label of the "all" option. */
  placeholder?: string;
  /** Prefix rendered inside the trigger, e.g. "Status:" in the filter bars. */
  label?: string;
  icon?: React.ReactNode;
  variant?: 'default' | 'stacked';
  disabled?: boolean;
  className?: string;
  /** Accessible name when no visible label wraps the control. */
  'aria-label'?: string;
}

const TRIGGER_CLASSES = [
  'inline-flex h-10 w-full min-w-0 items-center gap-2 rounded-control border',
  'bg-surface px-3 text-sm text-ink-900',
  'transition-colors',
  'focus-visible:outline-2 focus-visible:outline-offset-0',
  'disabled:cursor-not-allowed disabled:bg-canvas disabled:text-ink-400',
  'data-[placeholder]:text-ink-500',
].join(' ');

const TRIGGER_OK = 'border-line-strong focus-visible:outline-violet-600';
const TRIGGER_ERROR = 'border-danger focus-visible:outline-danger';

const CONTENT_CLASSES = [
  'z-50 max-h-72 min-w-(--radix-select-trigger-width) overflow-hidden',
  'rounded-card border border-line bg-surface shadow-popover',
].join(' ');

/**
 * Single-select built on Radix.
 *
 * Radix rather than a native `<select>` because the wireframe filter bars show
 * an icon and a "Status:" prefix inside the control, and colour dots beside
 * options — none of which a native select can render. Radix keeps the keyboard
 * behaviour and focus management that would otherwise have to be rebuilt.
 */
export function Select({
  value,
  onValueChange,
  options,
  placeholder,
  label,
  icon,
  variant = 'default',
  disabled,
  className,
  'aria-label': ariaLabel,
}: SelectProps) {
  const selected = options.find((o) => o.value === value);
  const { controlProps, hasError } = useOptionalFieldControlProps();

  return (
    <RadixSelect.Root value={value} onValueChange={onValueChange} disabled={disabled ?? false}>
      <RadixSelect.Trigger
        className={cn(
          variant === 'stacked'
            ? 'group inline-flex h-14 w-full min-w-0 cursor-pointer items-center justify-between gap-3 rounded-xl border border-line bg-surface p-2.5 text-sm transition-all hover:border-line-strong hover:shadow-xs focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-violet-600 disabled:cursor-not-allowed disabled:bg-canvas'
            : cn(TRIGGER_CLASSES, hasError ? TRIGGER_ERROR : TRIGGER_OK),
          className,
        )}
        aria-label={ariaLabel}
        {...controlProps}
      >
        {variant === 'stacked' ? (
          <>
            <div className="flex min-w-0 items-center gap-2.5 text-left">
              {icon ? (
                <span
                  className="grid size-9 shrink-0 place-items-center rounded-xl bg-blue-50/80 text-brand-blue-600"
                  aria-hidden="true"
                >
                  {icon}
                </span>
              ) : null}
              <div className="flex min-w-0 flex-col">
                {label ? (
                  <span className="truncate text-xs font-medium text-ink-500">{label}</span>
                ) : null}
                <RadixSelect.Value placeholder={placeholder}>
                  <span className="truncate text-sm font-semibold text-brand-blue-600">
                    {selected?.label ?? placeholder}
                  </span>
                </RadixSelect.Value>
              </div>
            </div>
            <RadixSelect.Icon className="shrink-0">
              <ChevronDown
                className="size-4 text-brand-blue-600 transition-transform group-data-[state=open]:rotate-180"
                aria-hidden="true"
              />
            </RadixSelect.Icon>
          </>
        ) : (
          <>
            {icon ? (
              <span className="shrink-0 text-ink-400" aria-hidden="true">
                {icon}
              </span>
            ) : null}
            <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-left">
              {label ? <span className="shrink-0 text-ink-500">{label}</span> : null}
              <RadixSelect.Value placeholder={placeholder}>
                <span className="flex items-center gap-1.5 truncate">
                  {selected?.adornment}
                  {selected?.label ?? placeholder}
                </span>
              </RadixSelect.Value>
            </span>
            <RadixSelect.Icon className="shrink-0">
              <ChevronDown className="size-4 text-ink-400" aria-hidden="true" />
            </RadixSelect.Icon>
          </>
        )}
      </RadixSelect.Trigger>

      <RadixSelect.Portal>
        <RadixSelect.Content position="popper" sideOffset={4} className={CONTENT_CLASSES}>
          <RadixSelect.Viewport className="p-1">
            {options.map((option) => (
              <SelectItem key={option.value} option={option} />
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}

function SelectItem({ option }: { option: SelectOption }) {
  return (
    <RadixSelect.Item
      value={option.value}
      disabled={option.disabled ?? false}
      className={cn(
        'relative flex cursor-pointer items-center gap-2 rounded-lg py-2 pr-8 pl-2 text-sm text-ink-900 outline-none',
        'data-[highlighted]:bg-canvas data-[state=checked]:font-semibold',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      )}
    >
      {option.adornment}
      <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
      <RadixSelect.ItemIndicator className="absolute right-2">
        <Check className="size-4 text-violet-600" aria-hidden="true" />
      </RadixSelect.ItemIndicator>
    </RadixSelect.Item>
  );
}

/**
 * Select with a type-ahead filter inside the dropdown.
 *
 * Separate component rather than a `searchable` flag on `Select`: the search
 * box changes the keyboard model (typing filters instead of jumping to a
 * matching option), so conflating them would make the simple case carry
 * behaviour it does not want. Use this only where the list is long enough to
 * need it — reviewers, customers — not for a three-item status filter.
 */
export function SearchableSelect({
  value,
  onValueChange,
  options,
  placeholder,
  label,
  icon,
  disabled,
  className,
  searchPlaceholder,
  'aria-label': ariaLabel,
}: SelectProps & { searchPlaceholder?: string }) {
  const [query, setQuery] = useState('');
  const { controlProps, hasError } = useOptionalFieldControlProps();

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle === '') return options;
    return options.filter((o) => o.label.toLowerCase().includes(needle));
  }, [options, query]);

  return (
    <RadixSelect.Root
      value={value}
      onValueChange={onValueChange}
      disabled={disabled ?? false}
      // Reset the filter on close so reopening does not show a stale subset.
      onOpenChange={(open) => {
        if (!open) setQuery('');
      }}
    >
      <RadixSelect.Trigger
        className={cn(TRIGGER_CLASSES, hasError ? TRIGGER_ERROR : TRIGGER_OK, className)}
        aria-label={ariaLabel}
        {...controlProps}
      >
        {icon ? (
          <span className="shrink-0 text-ink-400" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-left">
          {label ? <span className="shrink-0 text-ink-500">{label}</span> : null}
          <RadixSelect.Value placeholder={placeholder} />
        </span>
        <RadixSelect.Icon className="shrink-0">
          <ChevronDown className="size-4 text-ink-400" aria-hidden="true" />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>

      <RadixSelect.Portal>
        <RadixSelect.Content position="popper" sideOffset={4} className={CONTENT_CLASSES}>
          <div className="border-b border-line p-2">
            <div className="relative">
              <Search
                className="absolute top-1/2 left-2 size-4 -translate-y-1/2 text-ink-400"
                aria-hidden="true"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder ?? common.table.searchPlaceholder}
                // Radix Select captures printable keys for type-ahead; stopping
                // propagation lets the user actually type in this box.
                onKeyDown={(e) => e.stopPropagation()}
                className="w-full rounded-control border border-line-strong bg-surface py-1.5 pr-2 pl-8 text-sm placeholder:text-ink-400 focus-visible:outline-2 focus-visible:outline-violet-600"
              />
            </div>
          </div>

          <RadixSelect.Viewport className="max-h-60 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-ink-500">{common.table.noResults}</p>
            ) : (
              filtered.map((option) => <SelectItem key={option.value} option={option} />)
            )}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}
