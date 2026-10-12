import { Calendar, ClipboardList, FileText, Tag as TagIcon, User } from 'lucide-react';
import type { Task, TaskListItem, TaskTypeRecord } from '@sdp/contracts';
import {
  CustomerChip,
  PriorityPill,
  StatusBadge,
} from '@/portals/code-review/components/badges.tsx';
import { OptionalCell } from '@/portals/code-review/components/cells.tsx';
import { Card, CardBody, CardHeader } from '@/components/ui/Card.tsx';
import { InfoTooltip } from '@/components/ui/Tooltip.tsx';
import { formatDate } from '@/lib/formatters.ts';
import common from '@/content/common.json';
import tasksContent from '@/content/tasks.json';
import { useTaskTypes } from '@/portals/code-review/hooks/useReferenceData.ts';

export interface TaskInformationCardProps {
  task: TaskListItem | Task;
  taskTypes?: readonly TaskTypeRecord[] | undefined;
  className?: string | undefined;
  previousReviewerName?: string | null | undefined;
  overrideStatusBadge?: React.ReactNode | undefined;
}

/**
 * Shared Read-Only Task Information card.
 *
 * Used across Developer Task Overview (`TaskDetailPage`), Reviewer Review Task
 * (`ReviewSidebar`), and Admin task and handover views to present the task's identity,
 * metadata, people, dates, and classification in a unified, consistent 4-group structure.
 */
export function TaskInformationCard({
  task,
  taskTypes: propTaskTypes,
  className,
  previousReviewerName,
  overrideStatusBadge,
}: TaskInformationCardProps) {
  const { data: fetchedTaskTypes } = useTaskTypes();
  const taskTypes = propTaskTypes ?? fetchedTaskTypes;

  const customerName = 'customerName' in task && task.customerName ? task.customerName : undefined;
  const customerColor =
    'customerColor' in task && task.customerColor ? task.customerColor : '#64748b';
  const developerName =
    'developerName' in task && task.developerName ? task.developerName : undefined;
  const reviewerName = 'reviewerName' in task ? task.reviewerName : null;

  const round =
    'reviewRound' in task && typeof task.reviewRound === 'number'
      ? task.reviewRound
      : 0;
  const counted =
    'countedCycle' in task && typeof task.countedCycle === 'number'
      ? task.countedCycle
      : 0;
  const peopleFields =
    previousReviewerName === undefined
      ? [
          {
            label: tasksContent.detail.fields.developer,
            value: developerName ?? '—',
          },
          {
            label: tasksContent.detail.fields.reviewer,
            value: <OptionalCell value={reviewerName} fallback={common.badges.unassigned} />,
          },
        ]
      : [
          {
            label: tasksContent.detail.fields.developer,
            value: developerName ?? '—',
          },
          {
            label: 'Previous Reviewer',
            value: previousReviewerName ?? '—',
          },
          {
            label: 'Current Reviewer',
            value: <OptionalCell value={reviewerName} fallback={common.badges.unassigned} />,
          },
        ];
  const peopleGridColumns =
    peopleFields.length === 1
      ? 'grid-cols-1'
      : peopleFields.length === 2
        ? 'grid-cols-1 sm:grid-cols-2'
        : 'grid-cols-1 sm:grid-cols-3';

  return (
    <Card className={className}>
      <CardHeader
        title={tasksContent.detail.informationTitle}
        description={tasksContent.detail.informationSubtitle}
        icon={<ClipboardList className="size-4 text-violet-600" />}
      />
      <CardBody className="space-y-4 pt-3">
        {/* 1. Task Details */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="grid size-5.5 place-items-center rounded-md bg-violet-100/80 text-violet-600 shadow-2xs">
              <FileText className="size-3.5" aria-hidden="true" />
            </span>
            <h4 className="text-xs font-bold tracking-tight text-ink-900">Task Details</h4>
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
            <div>
              <dt className="font-medium text-ink-400">{tasksContent.detail.fields.taskId}</dt>
              <dd className="mt-1 font-bold text-ink-900">
                {task.taskCode ? (
                  <span className="font-bold text-ink-900">{task.taskCode}</span>
                ) : (
                  <span className="text-ink-400">—</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-ink-400">{tasksContent.detail.fields.crimId}</dt>
              <dd className="mt-1 font-bold text-ink-900">{task.crimId || '—'}</dd>
            </div>
            <div>
              <dt className="font-medium text-ink-400">{tasksContent.detail.fields.customer}</dt>
              <dd className="mt-1">
                {customerName ? (
                  <CustomerChip name={customerName} color={customerColor} variant="inline" />
                ) : (
                  <span className="text-ink-400">—</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-ink-400">{tasksContent.detail.fields.version}</dt>
              <dd className="mt-1 font-semibold text-ink-900">
                <OptionalCell value={task.version} />
              </dd>
            </div>
            <div>
              <dt className="font-medium text-ink-400">{tasksContent.detail.fields.priority}</dt>
              <dd className="mt-1">
                <PriorityPill priority={task.priority} />
              </dd>
            </div>
            <div>
              <dt className="font-medium text-ink-400">{tasksContent.detail.fields.status}</dt>
              <dd className="mt-1">
                {overrideStatusBadge ?? <StatusBadge status={task.status} />}
              </dd>
            </div>
            <div>
              <dt className="flex items-center gap-1 font-medium text-ink-400">
                <span>{tasksContent.detail.fields.reviewRound}</span>
                <InfoTooltip content={tasksContent.detail.tooltips.reviewRound} />
              </dt>
              <dd className="mt-1 font-semibold text-ink-900">Round {round}</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1 font-medium text-ink-400">
                <span>{tasksContent.detail.fields.countedCycle}</span>
                <InfoTooltip content={tasksContent.detail.tooltips.countedCycle} />
              </dt>
              <dd className="mt-1 font-semibold text-ink-900">Cycle {counted}</dd>
            </div>
          </dl>
        </div>

        {/* Divider */}
        <div className="border-t border-line/70" />

        {/* 2. People */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="grid size-5.5 place-items-center rounded-md bg-violet-100/80 text-violet-600 shadow-2xs">
              <User className="size-3.5" aria-hidden="true" />
            </span>
            <h4 className="text-xs font-bold tracking-tight text-ink-900">People</h4>
          </div>

          <dl
            data-testid="task-information-people-grid"
            className={`grid ${peopleGridColumns} gap-x-4 gap-y-3 text-xs`}
          >
            {peopleFields.map((field) => (
              <div key={field.label} className="min-w-0">
                <dt className="font-medium text-ink-400">{field.label}</dt>
                <dd className="mt-1 font-semibold break-words text-ink-900">{field.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Divider */}
        <div className="border-t border-line/70" />

        {/* 3. Dates */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="grid size-5.5 place-items-center rounded-md bg-violet-100/80 text-violet-600 shadow-2xs">
              <Calendar className="size-3.5" aria-hidden="true" />
            </span>
            <h4 className="text-xs font-bold tracking-tight text-ink-900">Dates</h4>
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
            <div>
              <dt className="font-medium text-ink-400">{tasksContent.detail.fields.created}</dt>
              <dd className="mt-1 font-semibold text-ink-900">{formatDate(task.createdAt)}</dd>
            </div>
            <div>
              <dt className="font-medium text-ink-400">{tasksContent.detail.fields.submitted}</dt>
              <dd className="mt-1 font-semibold text-ink-900">
                {task.submittedAt === null || !task.submittedAt
                  ? '—'
                  : formatDate(task.submittedAt)}
              </dd>
            </div>
          </dl>
        </div>

        {/* Divider */}
        <div className="border-t border-line/70" />

        {/* 4. Task Type */}
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <span className="grid size-5.5 place-items-center rounded-md bg-violet-100/80 text-violet-600 shadow-2xs">
              <TagIcon className="size-3.5" aria-hidden="true" />
            </span>
            <h4 className="text-xs font-bold tracking-tight text-ink-900">
              {tasksContent.detail.fields.taskTypes}
            </h4>
          </div>

          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {task.taskTypeIds && task.taskTypeIds.length > 0 ? (
              task.taskTypeIds.map((id) => (
                <span
                  key={id}
                  className="text-ink-800 inline-flex items-center rounded-md border border-line-strong/60 bg-surface px-2.5 py-1 text-xs font-medium shadow-2xs"
                >
                  {taskTypes?.find((type) => type.id === id)?.name ?? id}
                </span>
              ))
            ) : (
              <span className="text-xs text-ink-400">—</span>
            )}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
