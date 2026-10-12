import { useMemo } from 'react';
import { Building2, Code2, UserCheck } from 'lucide-react';
import { TASK_STATUSES, type Customer, type User } from '@sdp/contracts';
import { Select, type SelectOption } from '@/components/ui/Select.tsx';
import { TaskFilterBar } from '@/portals/code-review/components/TaskFilterBar.tsx';
import { ALL } from '@/portals/code-review/components/taskFilters.ts';
import admin from '@/content/admin.json';
import common from '@/content/common.json';
import tasks from '@/content/tasks.json';
import { EMPTY_ADMIN_FILTERS, type AdminTaskFilters } from './adminTaskFilters.ts';

/**
 * Screen 01's filter row: the shared task filters plus customer, developer and
 * reviewer.
 *
 * The three extra selects are populated from live data rather than a constant —
 * they are people and customers, which the admin can add on the neighbouring
 * tabs, so a hardcoded list would go stale the moment they used it.
 */

const labels = admin.tasks.filters;

const ADMIN_STATUS_OPTIONS: SelectOption[] = [
  { value: ALL, label: tasks.list.filters.statusAll },
  ...TASK_STATUSES.filter((status) => status !== 'Draft').map((status) => ({
    value: status,
    label: common.status[status],
  })),
];

function peopleOptions(users: readonly User[], allLabel: string): SelectOption[] {
  return [
    { value: ALL, label: allLabel },
    ...users
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((user) => ({ value: user.id, label: user.name })),
  ];
}

export function AdminTaskFilterBar({
  filters,
  onChange,
  customers,
  users,
}: {
  filters: AdminTaskFilters;
  onChange: (filters: AdminTaskFilters) => void;
  customers: readonly Customer[];
  users: readonly User[];
}) {
  const customerOptions = useMemo<SelectOption[]>(
    () => [
      { value: ALL, label: labels.customerAll },
      ...customers.map((customer) => ({
        value: customer.id,
        label: customer.name,
        adornment: (
          <span
            className="size-2 rounded-full"
            style={{ backgroundColor: customer.color }}
            aria-hidden="true"
          />
        ),
      })),
    ],
    [customers],
  );

  const developerOptions = useMemo(
    () =>
      peopleOptions(
        users.filter((user) => user.roles.includes('Developer')),
        labels.developerAll,
      ),
    [users],
  );

  const reviewerOptions = useMemo(
    () =>
      peopleOptions(
        users.filter((user) => user.roles.includes('Reviewer')),
        labels.reviewerAll,
      ),
    [users],
  );

  return (
    <div className="w-full space-y-3">
      <TaskFilterBar
        filters={filters}
        statusOptions={ADMIN_STATUS_OPTIONS}
        onChange={(next) => {
          onChange({ ...filters, ...next });
        }}
        onReset={() => {
          onChange(EMPTY_ADMIN_FILTERS);
        }}
        hasAdditionalFilters={filters.developerId !== ALL || filters.reviewerId !== ALL}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Select
          value={filters.customerId}
          onValueChange={(customerId) => {
            onChange({ ...filters, customerId });
          }}
          options={customerOptions}
          label={labels.customer}
          icon={<Building2 className="size-4" />}
          variant="stacked"
          aria-label={labels.customer}
        />
        <Select
          value={filters.developerId}
          onValueChange={(developerId) => {
            onChange({ ...filters, developerId });
          }}
          options={developerOptions}
          label={labels.developer}
          icon={<Code2 className="size-4" />}
          variant="stacked"
          aria-label={labels.developer}
        />
        <Select
          value={filters.reviewerId}
          onValueChange={(reviewerId) => {
            onChange({ ...filters, reviewerId });
          }}
          options={reviewerOptions}
          label={labels.reviewer}
          icon={<UserCheck className="size-4" />}
          variant="stacked"
          aria-label={labels.reviewer}
        />
      </div>
    </div>
  );
}
