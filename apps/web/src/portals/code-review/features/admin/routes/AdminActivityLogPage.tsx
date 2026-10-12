import { useState } from 'react';
import { ChevronLeft, ChevronRight, Eye, ScrollText } from 'lucide-react';
import { AUDIT_ACTION_TYPES, type AuditLog, type Role } from '@sdp/contracts';
import { Card, CardBody, CardHeader } from '@/components/ui/Card.tsx';
import { Button } from '@/components/ui/Button.tsx';
import { Dialog } from '@/components/ui/Dialog.tsx';
import { Field, Input } from '@/components/ui/Field.tsx';
import { SearchField } from '@/components/ui/controls.tsx';
import { Select, type SelectOption } from '@/components/ui/Select.tsx';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/states.tsx';
import { formatCompactDateTime } from '@/lib/formatters.ts';
import { RoleBadges } from '@/portals/code-review/components/badges.tsx';
import { useTasks } from '@/portals/code-review/hooks/useTasks.ts';
import { useUsers } from '../api/queries.ts';
import { useActivityLogs, type ActivityLogFilters } from '../api/activity.ts';

const ALL = '';
const ALL_OPTION = '__all__';
const labelFor = (value: string) =>
  value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const ACTION_OPTIONS: SelectOption[] = [
  { value: ALL_OPTION, label: 'All actions' },
  ...AUDIT_ACTION_TYPES.map((action) => ({ value: action, label: labelFor(action) })),
];
const ROLE_OPTIONS: SelectOption[] = [
  { value: ALL_OPTION, label: 'All roles' },
  { value: 'ADMIN', label: 'Admin' },
  { value: 'SUPER_ADMIN', label: 'Super Admin' },
  { value: 'DEVELOPER', label: 'Developer' },
  { value: 'REVIEWER', label: 'Reviewer' },
];
const INITIAL_FILTERS: ActivityLogFilters = {
  search: '',
  dateFrom: '',
  dateTo: '',
  actorUserId: '',
  actorRole: '',
  actionType: '',
  entityType: '',
  page: 1,
  pageSize: 25,
};

const UUID_PATTERN = /\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/gi;
const UUID_VALUE_PATTERN = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const INTERNAL_ID_KEYS = new Set([
  'id',
  'actoruserid',
  'customerid',
  'developerid',
  'entityid',
  'fromreviewerid',
  'handoverid',
  'questionid',
  'reassignedbyid',
  'reassignedtoid',
  'reviewerid',
  'roleid',
  'sectionid',
  'targetuserid',
  'taskid',
  'tasktypeids',
  'uploadedbyid',
  'userid',
]);

function withoutInternalIds(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .filter((item) => typeof item !== 'string' || !UUID_VALUE_PATTERN.test(item))
      .map(withoutInternalIds);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !INTERNAL_ID_KEYS.has(key.toLowerCase()))
        .map(([key, child]) => [key, withoutInternalIds(child)]),
    );
  }
  if (typeof value === 'string') return value.replace(UUID_PATTERN, 'hidden identifier');
  return value;
}

const ROLE_BY_CODE: Record<string, Role> = {
  ADMIN: 'Admin',
  DEVELOPER: 'Developer',
  REVIEWER: 'Reviewer',
  SUPER_ADMIN: 'SuperAdmin',
  // The client's own role key, should a record carry it.
  SUPERADMIN: 'SuperAdmin',
};

function ActivityRole({ value }: { value: string }) {
  const roles = value
    .split(',')
    .map((role) => ROLE_BY_CODE[role.trim().toUpperCase().replaceAll(' ', '_')])
    .filter((role): role is Role => role !== undefined);

  return roles.length > 0 ? <RoleBadges roles={roles} /> : <span>{value}</span>;
}

function valueLabel(key: string) {
  const words = key.replaceAll('_', ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function DisplayValue({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === '') {
    return <span className="font-bold text-brand-blue-700">—</span>;
  }
  if (Array.isArray(value)) {
    const items = value as unknown[];
    if (items.length === 0) return <span className="font-bold text-brand-blue-700">—</span>;
    if (items.every((item) => typeof item !== 'object' || item === null)) {
      return (
        <span className="font-bold text-brand-blue-700">
          {items.map((item) => String(item)).join(', ')}
        </span>
      );
    }
    return (
      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={index} className="rounded-lg border border-line bg-surface p-2.5">
            <DisplayValue value={item} />
          </div>
        ))}
      </div>
    );
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return <span className="font-bold text-brand-blue-700">—</span>;
    return (
      <dl className="grid gap-x-5 gap-y-2 sm:grid-cols-2">
        {entries.map(([key, child]) => (
          <div key={key} className="min-w-0">
            <dt className="text-xs text-ink-500">{valueLabel(key)}</dt>
            <dd className="break-words">
              <DisplayValue value={child} />
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  return (
    <span className="font-bold text-brand-blue-700">
      {typeof value === 'boolean'
        ? value
          ? 'Yes'
          : 'No'
        : typeof value === 'string' || typeof value === 'number'
          ? String(value)
          : '—'}
    </span>
  );
}

function AuditValue({ label, value }: { label: string; value: unknown }) {
  const visibleValue = withoutInternalIds(value);
  return (
    <div>
      <p className="mb-1 text-xs font-semibold tracking-wide text-ink-500 uppercase">{label}</p>
      <div className="max-h-64 overflow-auto rounded-lg bg-canvas p-3 text-sm">
        <DisplayValue value={visibleValue} />
      </div>
    </div>
  );
}

export function AdminActivityLogPage() {
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [selected, setSelected] = useState<AuditLog | null>(null);
  const { data: users } = useUsers();
  const { data: tasks } = useTasks('all');
  const { data, isPending, isFetching, error, refetch } = useActivityLogs(filters);
  const setFilter = (
    key: Exclude<keyof ActivityLogFilters, 'page' | 'pageSize'>,
    value: string,
  ) => {
    setFilters((current) => ({ ...current, [key]: value, page: 1 }));
  };
  const setPage = (page: number) => setFilters((current) => ({ ...current, page }));
  const actorOptions: SelectOption[] = [
    { value: ALL_OPTION, label: 'All actors' },
    ...(users ?? []).map((user) => ({ value: user.id, label: user.name })),
  ];
  const pagination = data?.pagination;
  const displayDescription = (entry: AuditLog) =>
    entry.description.replace(UUID_PATTERN, (id) => {
      const task = tasks?.find((candidate) => candidate.id.toLowerCase() === id.toLowerCase());
      if (task) return `'${task.title}'`;
      const user = users?.find((candidate) => candidate.id.toLowerCase() === id.toLowerCase());
      if (user) return user.name;
      return labelFor(entry.entityType);
    });

  return (
    <section aria-labelledby="activity-log-heading">
      <h2 id="activity-log-heading" className="sr-only">
        Activity Log
      </h2>
      <Card>
        <CardHeader
          title="Activity Log"
          description="Immutable business and security events, newest first"
        />
        <CardBody className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <SearchField
              value={filters.search}
              onValueChange={(value) => setFilter('search', value)}
              label="Search activity"
              placeholder="Search actor, action or description…"
              className="xl:col-span-2"
            />
            <Select
              value={filters.actorUserId}
              onValueChange={(value) =>
                setFilter('actorUserId', value === ALL_OPTION ? ALL : value)
              }
              options={actorOptions}
              placeholder="Actor"
              aria-label="Filter by actor"
            />
            <Select
              value={filters.actorRole}
              onValueChange={(value) => setFilter('actorRole', value === ALL_OPTION ? ALL : value)}
              options={ROLE_OPTIONS}
              placeholder="Role"
              aria-label="Filter by role"
            />
            <Select
              value={filters.actionType}
              onValueChange={(value) => setFilter('actionType', value === ALL_OPTION ? ALL : value)}
              options={ACTION_OPTIONS}
              placeholder="Action"
              aria-label="Filter by action type"
            />
            <Field label={<span className="sr-only">From date</span>}>
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-ink-500">
                  From date
                </span>
                <Input
                  type="date"
                  className="pl-24"
                  value={filters.dateFrom}
                  onChange={(event) => setFilter('dateFrom', event.target.value)}
                />
              </div>
            </Field>
            <Field label={<span className="sr-only">To date</span>}>
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-ink-500">
                  To date
                </span>
                <Input
                  type="date"
                  className="pl-20"
                  value={filters.dateTo}
                  onChange={(event) => setFilter('dateTo', event.target.value)}
                />
              </div>
            </Field>
          </div>

          {isPending ? <LoadingState /> : null}
          {error ? (
            <ErrorState
              onRetry={() => {
                void refetch();
              }}
            />
          ) : null}
          {!isPending && !error && data?.items.length === 0 ? (
            <EmptyState
              icon={<ScrollText className="size-8" />}
              title="No activity found"
              hint="Try widening the filters. New business and security actions appear here automatically."
            />
          ) : null}
          {data && data.items.length > 0 ? (
            <div className="overflow-x-auto rounded-card border border-line" aria-busy={isFetching}>
              <table className="w-full min-w-[840px] text-left text-sm">
                <thead className="bg-canvas text-xs tracking-wide text-ink-500 uppercase">
                  <tr>
                    <th className="px-4 py-3">Timestamp</th>
                    <th className="px-4 py-3">Actor</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3">
                      <span className="sr-only">Details</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.items.map((entry) => (
                    <tr key={entry.id} className="bg-surface align-top">
                      <td className="text-ink-600 px-4 py-3 whitespace-nowrap">
                        {formatCompactDateTime(entry.timestamp)}
                      </td>
                      <td className="px-4 py-3 font-semibold text-ink-900">{entry.actorName}</td>
                      <td className="px-4 py-3">
                        <ActivityRole value={entry.actorRole} />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-violet-700">
                        {entry.actionType}
                      </td>
                      <td className="max-w-xl px-4 py-3 text-ink-700">
                        {displayDescription(entry)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="sm" onClick={() => setSelected(entry)}>
                          <Eye className="size-4" aria-hidden="true" />
                          Details
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {pagination ? (
            <div className="text-ink-600 flex flex-wrap items-center justify-between gap-3 text-sm">
              <span>{pagination.total} activities</span>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={filters.page <= 1}
                  onClick={() => setPage(filters.page - 1)}
                >
                  <ChevronLeft className="size-4" /> Previous
                </Button>
                <span>
                  Page {pagination.page} of {Math.max(1, pagination.totalPages)}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={filters.page >= pagination.totalPages}
                  onClick={() => setPage(filters.page + 1)}
                >
                  Next <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          ) : null}
        </CardBody>
      </Card>

      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        title="Activity details"
        size="lg"
      >
        {selected ? (
          <div className="space-y-4">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-ink-500">Timestamp</dt>
                <dd>{formatCompactDateTime(selected.timestamp)}</dd>
              </div>
              <div>
                <dt className="text-ink-500">Actor</dt>
                <dd>{selected.actorName}</dd>
              </div>
              <div>
                <dt className="text-ink-500">Role</dt>
                <dd className="mt-1">
                  <ActivityRole value={selected.actorRole} />
                </dd>
              </div>
              <div>
                <dt className="text-ink-500">Action</dt>
                <dd>{labelFor(selected.actionType)}</dd>
              </div>
            </dl>
            <div>
              <p className="mb-1 text-xs font-semibold tracking-wide text-ink-500 uppercase">
                Description
              </p>
              <p className="text-ink-800 text-sm">{displayDescription(selected)}</p>
            </div>
            <AuditValue label="Old value" value={selected.oldValue} />
            <AuditValue label="New value" value={selected.newValue} />
          </div>
        ) : null}
      </Dialog>
    </section>
  );
}
