import {
  Clock,
  FileText,
  History,
  Layers,
  MessageSquare,
  Repeat,
  ShieldAlert,
  User,
} from 'lucide-react';
import type { Handover, Task, TaskListItem } from '@sdp/contracts';
import { cn } from '@/components/ui';
import { Tag } from '@/portals/code-review/components/badges.tsx';
import { Tooltip } from '@/components/ui/Tooltip.tsx';
import { Card, CardBody, CardHeader } from '@/components/ui/Card.tsx';
import { formatDateTime } from '@/lib/formatters.ts';

export interface HandoverSummaryCardProps {
  handover: Handover;
  task: Task | TaskListItem;
  className?: string;
}

/**
 * Compact, read-only summary card of an active or resolved Handover.
 * Sourced strictly from the Handover record as primary truth.
 */
export function HandoverSummaryCard({ handover, task, className }: HandoverSummaryCardProps) {
  const isPending = handover.status === 'Pending';
  const isReassigned = handover.status === 'Reassigned';
  const isReturned = handover.status === 'ReturnedToQueue';

  const round = task.reviewRound ?? 0;
  const counted = task.countedCycle ?? 1;

  return (
    <Card
      collapsible
      defaultExpanded
      resetKey={task.id}
      summary={isPending ? 'Awaiting admin action' : handover.status}
      data-testid="handover-summary-card"
      className={cn(
        'overflow-hidden border-2 shadow-sm transition-all',
        isPending
          ? 'border-amber-200/90 bg-white'
          : isReassigned
            ? 'border-emerald-200/90 bg-white'
            : 'border-slate-200/90 bg-white',
        className,
      )}
    >
      <CardHeader
        title={
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-base font-bold text-ink-900 sm:text-lg">Handover Summary</span>
            {isPending ? (
              <Tag className="border border-amber-300 bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-900">
                Awaiting Admin Action
              </Tag>
            ) : isReassigned ? (
              <Tag className="border border-emerald-300 bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                Reassigned
              </Tag>
            ) : isReturned ? (
              <Tag className="border border-slate-300 bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700">
                Returned to Queue
              </Tag>
            ) : (
              <Tag className="text-ink-600 bg-canvas px-2.5 py-0.5 text-xs font-bold">
                {handover.status}
              </Tag>
            )}
          </div>
        }
        description={`Handover record for ${task.taskCode}`}
        icon={
          <ShieldAlert className={cn('size-5', isPending ? 'text-amber-600' : 'text-slate-600')} />
        }
      />

      <CardBody className="space-y-4 pt-2">
        {/* Metadata Grid: wraps responsively to avoid cramped columns in split layout */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {/* Previous Reviewer */}
          <div className="min-w-0 space-y-1 overflow-hidden rounded-lg border border-line bg-surface/60 p-2.5">
            <span className="flex items-center gap-1.5 text-xs font-medium text-ink-500">
              <User className="size-3.5 shrink-0 text-ink-400" />
              Previous Reviewer
            </span>
            <Tooltip content={handover.fromReviewerName || '—'} side="top" align="start">
              <button
                type="button"
                className="block w-full cursor-default truncate rounded-xs text-left text-xs font-bold text-ink-900 focus-visible:outline-2 focus-visible:outline-violet-600 sm:text-sm"
              >
                {handover.fromReviewerName || '—'}
              </button>
            </Tooltip>
          </div>

          {/* Handed Over At */}
          <div className="min-w-0 space-y-1 overflow-hidden rounded-lg border border-line bg-surface/60 p-2.5">
            <span className="flex items-center gap-1.5 text-xs font-medium text-ink-500">
              <Clock className="size-3.5 shrink-0 text-ink-400" />
              Handed Over
            </span>
            <Tooltip content={formatDateTime(handover.createdAt)} side="top" align="start">
              <button
                type="button"
                className="block w-full cursor-default truncate rounded-xs text-left text-xs font-semibold text-ink-900 focus-visible:outline-2 focus-visible:outline-violet-600 sm:text-sm"
              >
                {formatDateTime(handover.createdAt)}
              </button>
            </Tooltip>
          </div>

          {/* Review Round */}
          <div className="min-w-0 space-y-1 overflow-hidden rounded-lg border border-line bg-surface/60 p-2.5">
            <span className="flex items-center gap-1.5 text-xs font-medium text-ink-500">
              <Layers className="size-3.5 shrink-0 text-ink-400" />
              Round
            </span>
            <p className="truncate text-xs font-bold text-ink-900 sm:text-sm">Round {round}</p>
          </div>

          {/* Cycle */}
          <div className="min-w-0 space-y-1 overflow-hidden rounded-lg border border-line bg-surface/60 p-2.5">
            <span className="flex items-center gap-1.5 text-xs font-medium text-ink-500">
              <Repeat className="size-3.5 shrink-0 text-ink-400" />
              Cycle
            </span>
            <p className="truncate text-xs font-bold text-ink-900 sm:text-sm">Cycle {counted}</p>
          </div>

          {/* Origin Status */}
          <div className="min-w-0 space-y-1 overflow-hidden rounded-lg border border-line bg-surface/60 p-2.5">
            <span className="flex items-center gap-1.5 text-xs font-medium text-ink-500">
              <History className="size-3.5 shrink-0 text-ink-400" />
              Origin Status
            </span>
            <p
              className="truncate text-xs font-semibold text-ink-900 sm:text-sm"
              title={task.status}
            >
              {task.status}
            </p>
          </div>

          {/* Handover ID */}
          <div
            className="min-w-0 space-y-1 overflow-hidden rounded-lg border border-line bg-surface/60 p-2.5"
            data-testid="handover-id-tile"
          >
            <span className="flex items-center gap-1.5 text-xs font-medium text-ink-500">
              <FileText className="size-3.5 shrink-0 text-ink-400" />
              Handover ID
            </span>
            <Tooltip content={handover.id} side="top" align="start">
              <button
                type="button"
                className="block w-full cursor-help truncate rounded-xs text-left font-mono text-xs font-semibold text-ink-700 focus-visible:outline-2 focus-visible:outline-violet-600"
              >
                {handover.id}
              </button>
            </Tooltip>
          </div>
        </div>

        {/* Handover Reason Callout */}
        <div className="space-y-1.5 rounded-xl border border-amber-200/80 bg-amber-50/70 p-3.5 sm:p-4">
          <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-amber-900 uppercase">
            <MessageSquare className="size-3.5 text-amber-700" />
            <span>Handover Reason</span>
          </div>
          <p className="text-sm leading-relaxed font-medium whitespace-pre-wrap text-amber-950">
            &ldquo;{handover.reason}&rdquo;
          </p>
        </div>
      </CardBody>
    </Card>
  );
}
