import {
  CalendarDays,
  CheckCircle2,
  Copy,
  FilePlus2,
  FileText,
  Hash,
  Info,
  ListChecks,
  Loader2,
  RefreshCw,
  Sparkles,
  User as UserIcon,
} from 'lucide-react';
import { PRIORITIES, type Priority } from '@sdp/contracts';
import { cn } from '@/components/ui';
import { toast } from 'sonner';
import { StatusBadge } from '@/portals/code-review/components/badges.tsx';
import { RequirementList, type Requirement } from '@/components/common/Stepper.tsx';
import { Card, CardBody, CardHeader } from '@/components/ui/Card.tsx';
import { Field, Input } from '@/components/ui/Field.tsx';
import { SegmentedOptions, type SegmentedOption } from '@/components/ui/SegmentedOptions.tsx';
import { Select, type SelectOption } from '@/components/ui/Select.tsx';
import { formatDate } from '@/lib/formatters.ts';
import { useCurrentUser } from '@/hooks/useCurrentUser.ts';
import common from '@/content/common.json';
import tasks from '@/content/tasks.json';
import { useCustomers } from '../api/queries.ts';
import { deriveTitle } from '../domain/taskRules.ts';
import { useTaskDraft } from '../hooks/useTaskDraft.ts';

/**
 * Wizard step 1 (screen 22) — task identity.
 *
 * Section A: Primary editable inputs (Customer, CRIM ID)
 * Section B: System-generated task identity preview (Version, Title)
 * Section C: Required settings (Priority)
 */

const PRIORITY_DOT: Record<Priority, string> = {
  Low: 'bg-priority-low',
  Medium: 'bg-status-draft',
  High: 'bg-danger',
};

const PRIORITY_OPTIONS: SegmentedOption<Priority>[] = PRIORITIES.map((priority) => ({
  value: priority,
  label: common.priority[priority],
  dotClassName: PRIORITY_DOT[priority],
}));

export function WizardDetailsStep({
  className,
  showErrors,
  version,
  versionPending,
  versionError,
  identityLocked,
  title,
}: {
  className?: string;
  showErrors: boolean;
  version: string;
  versionPending: boolean;
  versionError: boolean;
  identityLocked: boolean;
  title?: string | undefined;
}) {
  const draft = useTaskDraft();
  const { data: customers } = useCustomers();

  const customerOptions: SelectOption[] = (customers ?? [])
    .filter((customer) => customer.isActive)
    .map((customer) => ({
      value: customer.id,
      label: customer.name,
      adornment: (
        <span
          className="size-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: customer.color }}
          aria-hidden="true"
        />
      ),
    }));

  const customerCode = customers?.find((c) => c.id === draft.customerId)?.code ?? '';
  const hasIdentityInputs = draft.customerId !== '' && draft.crimId.trim() !== '';

  const previewTitle =
    title ??
    (!hasIdentityInputs
      ? ''
      : version === ''
        ? ''
        : deriveTitle(customerCode, draft.crimId, version));

  const handleCopyTitle = () => {
    if (!previewTitle) return;
    void navigator.clipboard.writeText(previewTitle);
    toast.success('Generated title copied to clipboard');
  };

  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader
        title={tasks.wizard.details.title}
        description="Specify customer and ticket identity to prepare your code review request."
        icon={<FilePlus2 className="size-5 text-violet-600" />}
      />
      <CardBody className="flex-1 space-y-5 p-6">
        {/* SECTION A — Primary Editable Identity Inputs */}
        <section aria-labelledby="section-editable-identity" className="space-y-3">
          <div className="flex items-center justify-between">
            <h3
              id="section-editable-identity"
              className="text-xs font-semibold tracking-wider text-ink-500 uppercase"
            >
              Primary Identity Details
            </h3>
            <span className="text-xs leading-5 font-normal text-ink-500">Required</span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={tasks.wizard.details.customer}
              required
              error={
                showErrors && draft.customerId === ''
                  ? tasks.wizard.requirements.customer
                  : undefined
              }
            >
              <Select
                value={draft.customerId}
                onValueChange={(customerId) => {
                  draft.setDetails({ customerId });
                }}
                options={customerOptions}
                placeholder={tasks.wizard.details.customerPlaceholder}
                disabled={identityLocked}
              />
            </Field>

            <Field
              label={tasks.wizard.details.crimId}
              required
              error={
                showErrors && draft.crimId.trim() === ''
                  ? tasks.wizard.requirements.crimId
                  : undefined
              }
            >
              <Input
                value={draft.crimId}
                onChange={(event) => {
                  draft.setDetails({ crimId: event.target.value });
                }}
                placeholder={tasks.wizard.details.crimIdPlaceholder}
                readOnly={identityLocked}
              />
            </Field>
          </div>
        </section>

        {/* Subtle divider */}
        <hr className="border-line/60" />

        {/* SECTION B — System-Generated Task Identity (Flatter, integrated presentation) */}
        <section aria-labelledby="section-generated-identity" className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3
                id="section-generated-identity"
                className="text-xs font-semibold tracking-wider text-ink-500 uppercase"
              >
                Generated Task Identity
              </h3>
              <p className="mt-0.5 text-xs leading-5 font-normal text-ink-500">
                System-derived from Customer, CRIM ID, and previous tasks
              </p>
            </div>

            <div>
              {versionPending ? (
                <span className="inline-flex animate-pulse items-center gap-1.5 rounded-full border border-violet-200/50 bg-violet-50 px-2.5 py-0.5 text-[11px] font-medium text-violet-700">
                  <Loader2 className="size-3 animate-spin text-violet-600" />
                  Checking version…
                </span>
              ) : hasIdentityInputs && version !== '' ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200/50 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700">
                  <CheckCircle2 className="size-3" />
                  System Generated
                </span>
              ) : versionError ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-rose-200/50 bg-rose-50 px-2.5 py-0.5 text-[11px] font-medium text-rose-700">
                  Unavailable
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-line/60 bg-canvas px-2.5 py-0.5 text-[11px] font-medium text-ink-500">
                  Awaiting inputs
                </span>
              )}
            </div>
          </div>

          {/* Simple flat two-column layout */}
          <div className="grid gap-4 sm:grid-cols-3">
            {/* Version (1 col) */}
            <div className="space-y-1.5 sm:col-span-1">
              <span className="text-ink-800 text-sm font-medium">
                {tasks.wizard.details.version}
              </span>

              <div
                aria-label="Version"
                className="flex h-9 items-center rounded-lg border border-line/50 bg-canvas/40 px-3"
              >
                {versionError ? (
                  <span className="text-xs font-semibold text-danger">Unavailable</span>
                ) : versionPending ? (
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-700">
                    <Loader2 className="size-3.5 animate-spin text-violet-600" />
                    <span>Checking…</span>
                  </div>
                ) : version !== '' ? (
                  <span
                    data-testid="version-badge"
                    className="font-mono text-sm font-semibold text-violet-900"
                  >
                    {version}
                  </span>
                ) : (
                  <span className="text-xs font-medium text-ink-400">Pending</span>
                )}
              </div>

              <p className="text-xs leading-5 font-normal text-ink-500">
                {versionError
                  ? 'Unable to determine version.'
                  : versionPending
                    ? 'Checking next available version...'
                    : hasIdentityInputs && version !== ''
                      ? 'Automatically assigned from previous tasks.'
                      : 'Assigned automatically.'}
              </p>
            </div>

            {/* Generated Title (2 cols) */}
            <div className="space-y-1.5 sm:col-span-2">
              <span className="text-ink-800 text-sm font-medium">Generated Title</span>

              <div className="flex h-9 items-center justify-between rounded-lg border border-line/50 bg-canvas/40 px-3">
                <input
                  id="generated-title-input"
                  value={previewTitle}
                  placeholder={tasks.wizard.details.titlePlaceholder}
                  readOnly
                  aria-label="Generated Title"
                  className="w-full cursor-default border-0 bg-transparent p-0 font-mono text-sm font-semibold text-ink-900 select-all placeholder:font-sans placeholder:text-xs placeholder:font-normal placeholder:text-ink-400 focus-visible:outline-none"
                />
                {previewTitle ? (
                  <button
                    type="button"
                    onClick={handleCopyTitle}
                    title="Copy generated title"
                    className="ml-2 grid size-6 shrink-0 cursor-pointer place-items-center rounded text-ink-400 transition-colors hover:bg-canvas hover:text-ink-700"
                  >
                    <Copy className="size-3.5" aria-hidden="true" />
                    <span className="sr-only">Copy title</span>
                  </button>
                ) : null}
              </div>

              <p className="text-xs leading-5 font-normal text-ink-500">
                {previewTitle
                  ? 'This title is generated automatically from Customer, CRIM ID, and Version.'
                  : versionPending
                    ? 'Generating title once next version is resolved...'
                    : 'Generated automatically from the task identity details.'}
              </p>
            </div>
          </div>
        </section>

        {/* Subtle divider */}
        <hr className="border-line/60" />

        {/* SECTION C — Required Settings (Priority) — clean, single visible label */}
        <section aria-labelledby="section-priority-settings" className="space-y-2">
          <div className="flex items-center justify-between">
            <h3
              id="section-priority-settings"
              className="text-xs font-semibold tracking-wider text-ink-500 uppercase"
            >
              Task Priority{' '}
              <span className="text-danger" aria-hidden="true">
                *
              </span>
            </h3>
            <span className="text-xs leading-5 font-normal text-ink-500">
              Review triage priority
            </span>
          </div>

          <SegmentedOptions
            value={draft.priority}
            onValueChange={(priority) => {
              draft.setDetails({ priority });
            }}
            options={PRIORITY_OPTIONS}
            size="sm"
            className="[&_button]:text-sm"
            label={<span className="sr-only">Priority</span>}
            labelClassName="sr-only"
          />
        </section>
      </CardBody>
    </Card>
  );
}

/** The unified Task Summary card, rendered in the wizard details step's sidebar. */
export function TaskSummaryCard({
  className,
  requirements,
  version,
  versionPending,
  title,
}: {
  className?: string;
  requirements: readonly Requirement[];
  version: string;
  versionPending: boolean;
  title?: string | undefined;
}) {
  const draft = useTaskDraft();
  const { data: user } = useCurrentUser();
  const { data: customers } = useCustomers();

  const customerCode = customers?.find((c) => c.id === draft.customerId)?.code ?? '';
  const derivedTitle =
    title ??
    (draft.customerId === '' || draft.crimId.trim() === ''
      ? null
      : version === ''
        ? null
        : deriveTitle(customerCode, draft.crimId, version));

  const rows = [
    {
      id: 'taskId',
      icon: <Hash className="size-3.5 text-ink-400" />,
      label: tasks.detail.fields.taskId,
      value:
        draft.taskId === null ? (
          <span className="text-sm text-ink-400">{tasks.wizard.details.taskIdPending}</span>
        ) : (
          <span className="text-ink-800 rounded-md border border-line bg-canvas px-2 py-0.5 font-mono text-xs font-semibold">
            {draft.taskCode ?? draft.taskId}
          </span>
        ),
    },
    {
      id: 'title',
      icon: <FileText className="size-3.5 text-ink-400" />,
      label: tasks.detail.fields.title,
      value: derivedTitle ? (
        <span
          className="max-w-[180px] truncate text-right text-sm font-medium text-ink-900"
          title={derivedTitle}
        >
          {derivedTitle}
        </span>
      ) : (
        <span className="text-sm text-ink-400">{tasks.wizard.details.autoGenerated}</span>
      ),
    },
    {
      id: 'version',
      icon: <Sparkles className="size-3.5 text-ink-400" />,
      label: tasks.detail.fields.version,
      value: (
        <span className="text-ink-800 font-mono text-sm font-semibold">
          {versionPending ? (
            <span className="animate-pulse text-sm font-medium text-violet-600">Checking…</span>
          ) : version !== '' ? (
            <span className="rounded-md border border-violet-200/80 bg-violet-50 px-2.5 py-0.5 font-mono text-xs font-bold text-violet-800">
              {version}
            </span>
          ) : (
            <span className="text-sm text-ink-400">Pending</span>
          )}
        </span>
      ),
    },
    {
      id: 'status',
      icon: <Info className="size-3.5 text-ink-400" />,
      label: tasks.detail.fields.status,
      value: <StatusBadge status="Draft" />,
    },
    {
      id: 'cycle',
      icon: <RefreshCw className="size-3.5 text-ink-400" />,
      label: tasks.detail.fields.cycle,
      value: (
        <span className="text-ink-800 rounded-md border border-line bg-canvas px-2 py-0.5 font-mono text-xs font-semibold">
          0
        </span>
      ),
    },
    {
      id: 'developer',
      icon: <UserIcon className="size-3.5 text-ink-400" />,
      label: tasks.detail.fields.developer,
      value: (
        <span className="max-w-[170px] truncate text-sm font-medium text-ink-900">
          {user?.name ?? '—'}
        </span>
      ),
    },
    {
      id: 'created',
      icon: <CalendarDays className="size-3.5 text-ink-400" />,
      label: tasks.detail.fields.created,
      value: (
        <span className="text-ink-800 text-sm">
          {draft.createdAt ? formatDate(draft.createdAt) : formatDate(new Date().toISOString())}
        </span>
      ),
    },
    {
      id: 'submitted',
      icon: <CalendarDays className="size-3.5 text-ink-400" />,
      label: tasks.detail.fields.submitted,
      value: draft.submittedAt ? (
        <span className="text-ink-800 text-xs font-semibold">{formatDate(draft.submittedAt)}</span>
      ) : (
        <span className="text-sm text-ink-400">—</span>
      ),
    },
  ];

  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader title="Task Summary" icon={<ListChecks className="size-4 text-violet-600" />} />
      <CardBody className="flex-1 space-y-4 pt-3 pb-5">
        {/* Section 1: Ready to continue */}
        <section aria-labelledby="sidebar-ready-to-continue" className="space-y-2">
          <div className="flex items-center justify-between">
            <h3
              id="sidebar-ready-to-continue"
              className="text-xs font-semibold tracking-wider text-ink-500 uppercase"
            >
              Ready to continue
            </h3>
            <span className="sr-only">Before you can continue</span>
          </div>
          <RequirementList requirements={requirements} />
        </section>

        <hr className="border-line/60" />

        {/* Section 2: System Information */}
        <section aria-labelledby="sidebar-system-information" className="space-y-2">
          <h3
            id="sidebar-system-information"
            className="text-xs font-semibold tracking-wider text-ink-500 uppercase"
          >
            System Information
          </h3>
          <dl className="divide-y divide-line/60">
            {rows.map((row) => (
              <div
                key={row.id}
                className="flex items-center justify-between gap-3 py-2.5 first:pt-1 last:pb-1"
              >
                <dt className="flex items-center gap-2 text-sm text-ink-500">
                  <span aria-hidden="true">{row.icon}</span>
                  {row.label}
                </dt>
                <dd className="flex items-center justify-end text-sm">{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </CardBody>
    </Card>
  );
}

/** Legacy alias if imported elsewhere */
export const SystemInformationPanel = TaskSummaryCard;
