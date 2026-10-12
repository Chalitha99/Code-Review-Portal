import { AlertCircle, ArrowRightLeft, CheckCircle2, Info } from 'lucide-react';
import type {
  GeneralCheckQuestion,
  Review,
  ReviewDraft,
  Task,
  TaskListItem,
  TaskEvent,
} from '@sdp/contracts';
import { Card, CardBody, CardHeader } from '@/components/ui/Card.tsx';
import { Tag } from '@/portals/code-review/components/badges.tsx';
import { TaskInformationCard } from '@/portals/code-review/components/TaskInformationCard.tsx';
import { TaskActivityTimeline } from '@/portals/code-review/components/TaskActivityTimeline.tsx';
import reviews from '@/content/reviews.json';
import { reviewBlockers, isDefectRank, isCommentOwnedBy } from '../domain/reviewRules.ts';

export interface ReviewSidebarProps {
  task: TaskListItem | Task;
  review?: Review | null;
  draft: ReviewDraft;
  questions?: readonly GeneralCheckQuestion[];
  screenshotCount?: number;
  events: readonly TaskEvent[];
  allRejectionsAccepted?: boolean;
  hasPendingRejections?: boolean;
  hasPendingAdjudication?: boolean;
  hasUnresolvedIssues?: boolean;
  currentUserId?: string | undefined;
}

export function ReviewSidebar({
  task,
  review,
  draft,
  events,
  allRejectionsAccepted = false,
  hasPendingRejections = false,
  hasPendingAdjudication = false,
  hasUnresolvedIssues = false,
  currentUserId,
}: ReviewSidebarProps) {
  const isApproved = task.status === 'Approved';
  const isChangesRequested = task.status === 'ChangesRequested';
  const isReSubmitted = task.status === 'ReSubmitted';
  const isHandedOver = Boolean(task.isHandedOver);
  const isFinalized = isApproved || isChangesRequested;

  const effectiveRank = isFinalized && review?.rank !== undefined ? review.rank : draft.rank;
  const effectiveComments =
    isFinalized && review?.comments !== undefined ? review.comments : (draft.comments ?? []);
  const effectiveScreenshots = effectiveComments.reduce(
    (sum, c) => sum + (c.screenshots?.length ?? 0),
    0,
  );

  const activeSessionId = draft.currentReviewSessionId ?? task.currentReviewSessionId ?? undefined;

  const currentReviewerComments =
    activeSessionId || currentUserId
      ? effectiveComments.filter((c) => isCommentOwnedBy(c, currentUserId, activeSessionId))
      : effectiveComments;

  const isPending = Boolean(hasPendingAdjudication || hasPendingRejections);

  const approveBlockers = reviewBlockers(
    {
      draft,
      hasPendingAdjudication: isPending,
      hasUnresolvedIssues,
      currentUserId,
      currentReviewSessionId: activeSessionId,
    },
    'Approved',
  );
  const changesBlockers = reviewBlockers(
    {
      draft,
      hasPendingAdjudication: isPending,
      hasUnresolvedIssues,
      currentUserId,
      currentReviewSessionId: activeSessionId,
    },
    'ChangesRequested',
  );

  const isReadyToApprove =
    draft.rank === 1 && approveBlockers.length === 0 && !hasUnresolvedIssues && !isPending;
  const isReadyToRequestChanges =
    draft.rank !== null && isDefectRank(draft.rank) && changesBlockers.length === 0 && !isPending;

  // Readiness messaging
  let readinessStateTitle = 'Action Required';
  let readinessStateMessage = 'Select a review ranking to evaluate this task.';

  if (isHandedOver) {
    readinessStateTitle = 'Review Handed Over';
    readinessStateMessage = 'This review has been handed over and is awaiting Admin reassignment.';
  } else if (isApproved) {
    readinessStateTitle = 'Task Approved';
    readinessStateMessage = 'All review requirements completed and approved.';
  } else if (isChangesRequested) {
    readinessStateTitle = 'Review Concluded';
    readinessStateMessage = 'Changes requested. Task is waiting for developer response.';
  } else if (isReSubmitted) {
    readinessStateTitle = 'Ready for Re-Review';
    readinessStateMessage = 'Re-submitted by developer. Waiting to be picked for review.';
  } else if (isPending) {
    readinessStateTitle = 'Action Required';
    readinessStateMessage = 'Adjudicate all developer responses before making a decision.';
  } else if (hasUnresolvedIssues) {
    readinessStateTitle = 'Action Required';
    readinessStateMessage =
      'Cannot approve while findings remain unresolved or not accepted. Request changes instead.';
  } else if (draft.rank === null) {
    readinessStateTitle = 'Action Required';
    readinessStateMessage = 'Select a review ranking.';
  } else if (allRejectionsAccepted) {
    readinessStateTitle = reviews.form.readyToApprove;
    readinessStateMessage =
      'All rejections accepted. Ready to approve with Cycle count reduced by 1.';
  } else if (isReadyToApprove) {
    readinessStateTitle = reviews.form.readyToApprove;
    readinessStateMessage = 'All gates passed. Ready to approve the task.';
  } else if (isReadyToRequestChanges) {
    readinessStateTitle = 'Ready to Request Changes';
    readinessStateMessage = 'Feedback comments entered. Ready to send changes back to developer.';
  } else if (isDefectRank(draft.rank) && currentReviewerComments.length === 0) {
    readinessStateTitle = 'Action Required';
    readinessStateMessage = `Rank ${draft.rank} requires at least one review comment from the current reviewer describing required changes.`;
  } else if (
    isDefectRank(draft.rank) &&
    currentReviewerComments.some((c) => c.text.trim() === '')
  ) {
    readinessStateTitle = 'Action Required';
    readinessStateMessage = 'Review comments require actionable feedback.';
  }

  return (
    <div className="space-y-4">
      {/* 1. Review Readiness Card */}
      <Card className="border-line shadow-card">
        <CardHeader
          title={reviews.form.sidebar.readinessTitle}
          description="Review completion and submission readiness"
          icon={<CheckCircle2 className="size-4 text-violet-600" />}
        />
        <CardBody className="space-y-3 pt-3">
          {/* Readiness Status Banner */}
          <div
            className={`flex items-start gap-2.5 rounded-xl border p-3 ${
              isHandedOver
                ? 'border-amber-200 bg-amber-50/50 text-amber-950'
                : isApproved || (!isFinalized && !isReSubmitted && isReadyToApprove)
                  ? 'border-emerald-200 bg-emerald-50/50 text-emerald-950'
                  : isChangesRequested ||
                      (!isFinalized && !isReSubmitted && isReadyToRequestChanges)
                    ? 'border-amber-200 bg-amber-50/50 text-amber-950'
                    : 'border-slate-200 bg-canvas/60 text-ink-900'
            }`}
          >
            {isHandedOver ? (
              <ArrowRightLeft className="mt-0.5 size-4.5 shrink-0 text-amber-600" />
            ) : isApproved || (!isFinalized && !isReSubmitted && isReadyToApprove) ? (
              <CheckCircle2 className="mt-0.5 size-4.5 shrink-0 text-emerald-600" />
            ) : isChangesRequested ||
              (!isFinalized && !isReSubmitted && isReadyToRequestChanges) ? (
              <AlertCircle className="mt-0.5 size-4.5 shrink-0 text-amber-600" />
            ) : (
              <Info className="mt-0.5 size-4.5 shrink-0 text-ink-500" />
            )}
            <div className="min-w-0">
              <p className="text-xs font-bold tracking-wider uppercase">{readinessStateTitle}</p>
              <p className="text-ink-600 mt-0.5 text-xs leading-relaxed">{readinessStateMessage}</p>
            </div>
          </div>

          {/* Ranking Item */}
          <div className="flex items-center justify-between border-b border-line/60 py-1.5 text-xs">
            <span className="text-ink-600 font-medium">Ranking:</span>
            {effectiveRank === null ? (
              <span className="font-semibold text-amber-700">Not Selected</span>
            ) : (
              <Tag
                className={
                  effectiveRank === 1
                    ? 'bg-emerald-100 font-bold text-emerald-800'
                    : effectiveRank === 2
                      ? 'bg-amber-100 font-bold text-amber-800'
                      : 'bg-rose-100 font-bold text-rose-800'
                }
              >
                Rank {effectiveRank}
              </Tag>
            )}
          </div>

          {/* Comments Count Item */}
          <div className="flex items-center justify-between border-b border-line/60 py-1.5 text-xs">
            <span className="text-ink-600 font-medium">Review Comments:</span>
            <span className="font-bold text-ink-900">
              {effectiveComments.length} {effectiveComments.length === 1 ? 'comment' : 'comments'}
            </span>
          </div>

          {/* Screenshots Count Item */}
          <div className="flex items-center justify-between py-1.5 text-xs">
            <span className="text-ink-600 font-medium">Attached Screenshots:</span>
            <span className="text-ink-800 font-semibold">{effectiveScreenshots}</span>
          </div>
        </CardBody>
      </Card>

      {/* 2. Task Information Card */}
      <TaskInformationCard task={task} />

      {/* 3. Task History Card */}
      <TaskActivityTimeline
        title="Task History"
        subtitle="Review and task activity timeline"
        events={events}
      />
    </div>
  );
}
