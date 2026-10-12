import { useState } from 'react';
import { ArrowLeft, CheckCircle2, Undo2, UserCheck, UserPlus } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { Handover, Task, TaskListItem, User } from '@sdp/contracts';
import { cn } from '@/components/ui';
import { Button } from '@/components/ui/Button.tsx';
import { Card, CardBody, CardHeader } from '@/components/ui/Card.tsx';
import { ConfirmDialog } from '@/components/common/ConfirmDialog.tsx';
import { ROUTES } from '@/config/routes.ts';
import { ApiError } from '@/lib/apiClient.ts';
import { formatDateTime, textOr } from '@/lib/formatters.ts';
import { useReturnHandover } from '../api/handovers.ts';
import { ReassignHandoverDialog } from './ReassignHandoverDialog.tsx';

export interface AdminHandoverActionsCardProps {
  handover: Handover;
  task: Task | TaskListItem;
  users: readonly User[];
  onResolved?: () => void;
  returnTo?: string;
  className?: string;
}

/**
 * Action panel for resolving a pending handover, or displaying resolution outcome
 * if already resolved.
 */
export function AdminHandoverActionsCard({
  handover,
  task,
  users,
  onResolved,
  returnTo = ROUTES.admin.handovers,
  className,
}: AdminHandoverActionsCardProps) {
  const navigate = useNavigate();
  const returnToQueue = useReturnHandover();

  const [isReturning, setIsReturning] = useState(false);
  const [isReassigning, setIsReassigning] = useState(false);

  const isPending = handover.status === 'Pending';
  const isReassigned = handover.status === 'Reassigned';
  const isReturned = handover.status === 'ReturnedToQueue';

  function handleReturnConfirm() {
    returnToQueue.mutate(handover.id, {
      onSuccess: () => {
        toast.success(`${task.taskCode} returned to open reviewer queue`);
        setIsReturning(false);
        if (onResolved) {
          onResolved();
        } else {
          void navigate(returnTo);
        }
      },
      onError: (cause) => {
        setIsReturning(false);
        toast.error(
          cause instanceof ApiError ? cause.message : 'This handover has already been resolved.',
        );
      },
    });
  }

  return (
    <Card
      collapsible
      defaultExpanded
      resetKey={task.id}
      summary={isPending ? 'Action required' : 'Resolved'}
      data-testid="admin-handover-actions-card"
      className={cn(
        'overflow-hidden border-2 shadow-sm transition-all',
        isPending ? 'border-violet-200/90 bg-white' : 'border-slate-200/90 bg-surface/50',
        className,
      )}
    >
      <CardHeader
        title={
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-ink-900 sm:text-lg">
              {isPending ? 'Resolve Handover' : 'Handover Resolution'}
            </span>
          </div>
        }
        description={
          isPending
            ? 'Choose who should continue this review or return the task to the reviewer queue.'
            : 'This handover has already been resolved.'
        }
        icon={
          isPending ? (
            <UserCheck className="size-5 text-violet-600" />
          ) : (
            <CheckCircle2 className="size-5 text-emerald-600" />
          )
        }
      />

      <CardBody className="space-y-4 pt-2">
        {isPending ? (
          <>
            <p className="text-ink-600 text-xs leading-relaxed sm:text-sm">
              The reviewer was unable to complete this review. You may reassign the review directly
              to another qualified reviewer, or return the task to the open pool where any eligible
              reviewer can pick it up. All preserved draft findings will be transferred.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button
                variant="secondary"
                onClick={() => setIsReturning(true)}
                isLoading={returnToQueue.isPending}
                className="gap-2"
              >
                <Undo2 className="size-4" />
                Return to Open Queue
              </Button>

              <Button
                variant="adminPrimary"
                onClick={() => setIsReassigning(true)}
                className="gap-2"
              >
                <UserPlus className="size-4" />
                Reassign Reviewer
              </Button>
            </div>
          </>
        ) : (
          <div
            data-testid="handover-resolved-notice"
            className="space-y-3 rounded-xl border border-line bg-surface p-4"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-5 shrink-0 text-emerald-600" />
              <p className="text-sm font-bold text-ink-900">
                {isReassigned
                  ? `Reassigned to ${textOr(handover.reassignedToName, 'another reviewer')}`
                  : isReturned
                    ? 'Returned to Open Reviewer Queue'
                    : `Resolved (${handover.status})`}
              </p>
            </div>

            <p className="text-ink-600 text-xs leading-relaxed sm:text-sm">
              {isReassigned
                ? `This review was reassigned to ${textOr(handover.reassignedToName, 'another reviewer')}${
                    handover.resolvedAt ? ` on ${formatDateTime(handover.resolvedAt)}` : ''
                  }. The new reviewer has assumed ownership of the review draft.`
                : isReturned
                  ? `This task was returned to the open reviewer queue${
                      handover.resolvedAt ? ` on ${formatDateTime(handover.resolvedAt)}` : ''
                    }. Any eligible reviewer may claim it.`
                  : 'This handover has been finalized and is no longer pending administrative action.'}
            </p>

            <div className="pt-1">
              <Link
                to={returnTo}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-violet-700 hover:text-violet-800"
              >
                <ArrowLeft className="size-3.5" />
                Return to Handover Queue
              </Link>
            </div>
          </div>
        )}
      </CardBody>

      {/* Return to Open Queue Confirmation Dialog */}
      <ConfirmDialog
        open={isReturning}
        onOpenChange={(next) => setIsReturning(next)}
        title="Return Task to Open Queue"
        description={`Return ${task.taskCode} to the available review queue? Any eligible reviewer will be able to claim this task. The preserved review draft, comments, and evidence screenshots will remain available.`}
        confirmLabel="Return to Open Queue"
        tone="primary"
        isPending={returnToQueue.isPending}
        onConfirm={handleReturnConfirm}
      />

      {/* Reassign Reviewer Dialog */}
      {isReassigning && (
        <ReassignHandoverDialog
          handover={handover}
          task={task}
          users={users}
          onClose={() => {
            setIsReassigning(false);
            if (onResolved) onResolved();
          }}
        />
      )}
    </Card>
  );
}
