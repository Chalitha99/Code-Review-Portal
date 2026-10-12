import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRightLeft, Calendar, Clock, FileText, Info, User } from 'lucide-react';
import type { Task, TaskEvent, TaskListItem } from '@sdp/contracts';
import { cn } from '@/components/ui';
import { Tag } from '@/portals/code-review/components/badges.tsx';
import { MonoId } from '@/portals/code-review/components/cells.tsx';
import { Button } from '@/components/ui/Button.tsx';
import { Card, CardBody, CardHeader } from '@/components/ui/Card.tsx';
import { ROUTES } from '@/config/routes.ts';
import { formatDateTime, textOr } from '@/lib/formatters.ts';

export interface HandedOverSummaryProps {
  task: TaskListItem | Task;
  events?: readonly TaskEvent[] | undefined;
  className?: string | undefined;
}

/**
 * Read-only presentation of a handed-over review.
 * Displayed when a task is in handover state or awaiting Admin reassignment.
 *
 * Guarantees zero editable assessment controls, no rank cards, and no "Ranking Required" alert.
 */
export function HandedOverSummary({ task, events, className }: HandedOverSummaryProps) {
  const navigate = useNavigate();

  // Handover event is the immutable source of truth for handover metadata
  const handoverEvent = [...(events ?? [])]
    .filter((e) => e.kind === 'HandedOver')
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0];

  const reviewRound = task.reviewRound ?? 0;
  const countedCycle = task.countedCycle ?? 1;
  const handedOverBy = textOr(handoverEvent?.actorName, 'Reviewer');
  const handedOverAt = handoverEvent?.occurredAt ? formatDateTime(handoverEvent.occurredAt) : null;
  const reason = textOr(handoverEvent?.note, textOr(handoverEvent?.reason, 'No reason specified'));

  return (
    <Card
      data-testid="handed-over-summary"
      className={cn('overflow-hidden border-2 border-amber-200/90 bg-white shadow-sm', className)}
    >
      <CardHeader
        title={
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-base font-bold text-ink-900 sm:text-lg">Review Handed Over</span>
            <Tag className="bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-900">
              Handed Over
            </Tag>
            <Tag className="bg-violet-100 text-xs font-bold text-violet-700">
              Round {reviewRound}
            </Tag>
          </div>
        }
        description={`The review for task ${task.taskCode} has been handed over and is awaiting Admin reassignment.`}
        icon={<ArrowRightLeft className="size-5 text-amber-600" />}
      />

      <CardBody className="space-y-6 pt-2">
        {/* Status Callout Banner */}
        <div
          role="status"
          className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-amber-950 transition-colors"
        >
          <Clock className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden="true" />
          <div className="space-y-1">
            <p className="text-sm font-bold">Awaiting Admin Reassignment</p>
            <p className="text-xs leading-relaxed text-ink-700">
              This review has been handed over and sent to the Admin queue for reassignment. Your
              draft comments and evaluation have been preserved for the re-assigned reviewer.
            </p>
          </div>
        </div>

        {/* Handover Metadata Grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="space-y-1 rounded-lg border border-line/60 bg-canvas/40 p-3">
            <span className="block text-[11px] font-semibold tracking-wider text-ink-500 uppercase">
              Task Code
            </span>
            <MonoId value={task.taskCode} />
          </div>

          <div className="space-y-1 rounded-lg border border-line/60 bg-canvas/40 p-3">
            <span className="block text-[11px] font-semibold tracking-wider text-ink-500 uppercase">
              Round
            </span>
            <span className="text-sm font-bold text-ink-900">Round {reviewRound}</span>
          </div>

          <div className="space-y-1 rounded-lg border border-line/60 bg-canvas/40 p-3">
            <span className="block text-[11px] font-semibold tracking-wider text-ink-500 uppercase">
              Cycle
            </span>
            <span className="text-sm font-bold text-ink-900">Cycle {countedCycle}</span>
          </div>

          <div className="space-y-1 rounded-lg border border-line/60 bg-canvas/40 p-3">
            <span className="block text-[11px] font-semibold tracking-wider text-ink-500 uppercase">
              Handed Over By
            </span>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-900">
              <User className="size-3.5 shrink-0 text-ink-400" aria-hidden="true" />
              <span className="truncate">{handedOverBy}</span>
            </div>
          </div>
        </div>

        {/* Timestamp & Info Row */}
        {handedOverAt && (
          <div className="text-ink-600 flex items-center gap-2 rounded-lg border border-line/50 bg-canvas/30 px-3.5 py-2 text-xs">
            <Calendar className="size-3.5 shrink-0 text-ink-400" aria-hidden="true" />
            <span>
              Handed over on <span className="text-ink-800 font-semibold">{handedOverAt}</span>
            </span>
          </div>
        )}

        {/* Handover Reason Card */}
        <div className="space-y-2 rounded-xl border border-line bg-surface p-4">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-ink-700 uppercase">
            <FileText className="size-4 text-ink-400" aria-hidden="true" />
            <span>Handover Reason</span>
          </div>
          <blockquote className="text-ink-800 rounded-lg border-l-4 border-amber-500 bg-amber-50/40 px-3.5 py-2.5 text-xs leading-relaxed italic">
            &ldquo;{reason}&rdquo;
          </blockquote>
        </div>

        {/* Navigation Action */}
        <div className="flex items-center justify-between border-t border-line/70 pt-2">
          <div className="flex items-center gap-2 text-xs text-ink-500">
            <Info className="size-4 shrink-0 text-ink-400" aria-hidden="true" />
            <span>You no longer own an active review for this task.</span>
          </div>
          <Button
            type="button"
            variant="primary"
            onClick={() => {
              void navigate(ROUTES.reviewer.root, { replace: true });
            }}
            leadingIcon={<ArrowLeft className="size-4" />}
          >
            Back to Reviewer Dashboard
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
