import { useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { ClipboardList, History, ShieldAlert } from 'lucide-react';
import { Tag } from '@/portals/code-review/components/badges.tsx';
import { TaskDetailHeaderMetadata } from '@/portals/code-review/components/TaskDetailHeaderMetadata.tsx';
import { BackLink, PageHeader } from '@/components/common/PageHeader.tsx';
import { PageContainer } from '@/components/common/PageContainer.tsx';
import { Card, CardBody, CardHeader } from '@/components/ui/Card.tsx';
import { ErrorState, LoadingState } from '@/components/common/states.tsx';
import { ChecklistHistory } from '@/portals/code-review/components/ChecklistHistory.tsx';
import { ReviewCycleHistory } from '@/portals/code-review/components/ReviewCycleHistory.tsx';
import { TaskActivityTimeline } from '@/portals/code-review/components/TaskActivityTimeline.tsx';
import { TaskInformationCard } from '@/portals/code-review/components/TaskInformationCard.tsx';
import { ROUTES } from '@/config/routes.ts';
import { useCurrentUser } from '@/hooks/useCurrentUser.ts';
import {
  useTask,
  useTaskChecklist,
  useChecklistSubmissions,
  useTaskEvents,
} from '@/portals/code-review/hooks/useTasks.ts';
import { useCurrentReview, useReviewHistory } from '@/portals/code-review/hooks/useReviews.ts';
import { useUsers } from '@/portals/code-review/hooks/useUsers.ts';
import { useHandover, useHandoverDraft, useHandovers } from '../api/handovers.ts';
import { HandoverSummaryCard } from '../components/HandoverSummaryCard.tsx';
import { ReviewerDraftCard } from '../components/ReviewerDraftCard.tsx';
import { AdminHandoverActionsCard } from '../components/AdminHandoverActionsCard.tsx';
import { safeListReturnTo } from '@/portals/code-review/components/taskListNavigation.ts';

/**
 * Admin Handover Task Overview Page.
 *
 * Provides a dedicated, role-safe view for Admins inspecting and resolving
 * handed-over tasks. Sourced strictly from the handover record identity,
 * displays preserved reviewer draft (rank, comments, evidence), and provides
 * action buttons for Reassign and Return to Queue.
 */
export function AdminHandoverTaskPage() {
  const { handoverId, taskId: paramTaskId } = useParams<{
    handoverId?: string;
    taskId?: string;
  }>();
  const [searchParams] = useSearchParams();
  const returnTo = safeListReturnTo(
    searchParams,
    [ROUTES.admin.handovers, ROUTES.admin.root],
    ROUTES.admin.handovers,
  );
  const backLabel = returnTo.startsWith(ROUTES.admin.handovers)
    ? 'Back to Handovers'
    : 'Back to Admin Tasks';

  const { data: user } = useCurrentUser();
  const { data: users } = useUsers();

  // If route is /admin/handovers/:handoverId, fetch direct handover
  const {
    data: directHandover,
    isPending: isDirectHandoverPending,
    error: directHandoverError,
    refetch: refetchDirectHandover,
  } = useHandover(handoverId);

  // If route is /admin/tasks/:taskId/handover, search queue
  const {
    data: allHandovers,
    isPending: isAllHandoversPending,
    refetch: refetchAllHandovers,
  } = useHandovers();

  // Resolve unambiguous effective handover
  const effectiveHandover = useMemo(() => {
    if (directHandover) return directHandover;
    if (!paramTaskId || !allHandovers) return null;

    const taskHandovers = allHandovers.filter((h) => h.taskId === paramTaskId);
    // 1. Highest priority: current pending unresolved handover
    // 2. Fallback: newest handover by createdAt
    return (
      taskHandovers.find((h) => h.status === 'Pending') ??
      taskHandovers.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ??
      null
    );
  }, [directHandover, paramTaskId, allHandovers]);

  const effectiveTaskId = effectiveHandover?.taskId ?? paramTaskId;

  // Task and related queries
  const {
    data: task,
    isPending: isTaskPending,
    error: taskError,
    refetch: refetchTask,
  } = useTask(effectiveTaskId);

  const { data: checklist } = useTaskChecklist(effectiveTaskId);
  const { data: checklistSubmissions = [] } = useChecklistSubmissions(effectiveTaskId);
  const { data: events } = useTaskEvents(effectiveTaskId);
  const { data: reviewHistory } = useReviewHistory(effectiveTaskId);

  // Read-only preserved draft
  const { data: handoverDraft, isPending: isHandoverDraftPending } = useHandoverDraft(
    effectiveHandover?.id,
  );

  const { data: taskReviewDraft, isPending: isTaskReviewDraftPending } =
    useCurrentReview(effectiveTaskId);

  const draftReview = handoverDraft ?? taskReviewDraft ?? null;
  const isDraftLoading =
    (Boolean(effectiveHandover?.id) && isHandoverDraftPending) ||
    (Boolean(effectiveTaskId) && isTaskReviewDraftPending && !draftReview);

  const isHandoverLoading = handoverId ? isDirectHandoverPending : isAllHandoversPending;
  const isOverallLoading = isHandoverLoading || (Boolean(effectiveTaskId) && isTaskPending);

  // Authorization check (Clarification 3 & 6)
  if (user && !user.roles.includes('Admin')) {
    return (
      <PageContainer className="space-y-5">
        <BackLink to={ROUTES.home} label="Back to Home" />
        <ErrorState
          title="Access Denied"
          message="You do not have administrative permission to view this handover task."
        />
      </PageContainer>
    );
  }

  // Loading state
  if (isOverallLoading) {
    return (
      <PageContainer className="space-y-5">
        <BackLink to={returnTo} label={backLabel} />
        <LoadingState label="Loading handover task details..." />
      </PageContainer>
    );
  }

  // Error / Not Found states
  if (handoverId && (directHandoverError || !directHandover)) {
    return (
      <PageContainer className="space-y-5">
        <BackLink to={returnTo} label={backLabel} />
        <ErrorState
          title="Handover Record Not Found"
          message="The requested handover record does not exist or has been removed."
          onRetry={() => {
            void refetchDirectHandover();
          }}
        />
      </PageContainer>
    );
  }

  if (taskError || !task || !effectiveHandover) {
    return (
      <PageContainer className="space-y-5">
        <BackLink to={returnTo} label={backLabel} />
        <ErrorState
          title="Handover Task Not Found"
          message="Could not find an active handover record for this task."
          onRetry={() => {
            void refetchAllHandovers();
            void refetchTask();
          }}
        />
      </PageContainer>
    );
  }

  const isPending = effectiveHandover.status === 'Pending';
  const isReassigned = effectiveHandover.status === 'Reassigned';
  const isReturned = effectiveHandover.status === 'ReturnedToQueue';

  return (
    <PageContainer className="space-y-5" data-testid="admin-handover-detail-page">
      {/* Role-safe Back Link to Admin Handovers */}
      <BackLink to={returnTo} label={backLabel} />

      {/* Handover-Specific Header */}
      <PageHeader
        title="Handover Task Overview"
        subtitle={
          <TaskDetailHeaderMetadata
            taskCode={task.taskCode}
            status={task.status}
            workflowContext={
              isPending
                ? 'Awaiting admin action'
                : isReassigned
                  ? 'Handover resolved: reassigned'
                  : isReturned
                    ? 'Handover resolved: returned to queue'
                    : undefined
            }
          />
        }
        icon={<ShieldAlert className="size-5 text-amber-600" />}
        tone="neutral"
      />

      {/* 2-Column Balanced Responsive Layout */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        {/* Left / Primary Column (7-8 cols on desktop) */}
        <div className="space-y-5 lg:col-span-7 xl:col-span-8">
          {/* 1. Compact Handover Summary Card */}
          <HandoverSummaryCard handover={effectiveHandover} task={task} />

          {/* 2. Preserved Reviewer Draft Card (Read-Only) */}
          <ReviewerDraftCard review={draftReview} isLoading={isDraftLoading} />

          {/* 3. Admin Resolution Actions */}
          <AdminHandoverActionsCard
            handover={effectiveHandover}
            task={task}
            users={users ?? []}
            returnTo={returnTo}
            onResolved={() => {
              void refetchDirectHandover();
              void refetchAllHandovers();
              void refetchTask();
            }}
          />

          {/* 4. Developer Quality Checklist (Read-Only) */}
          <Card
            collapsible
            defaultExpanded={false}
            resetKey={task.id}
            summary={`${checklist?.answers.length ?? 0} answers`}
          >
            <CardHeader
              title="Developer Quality Checklist"
              description="Verification items submitted by the developer."
              icon={<ClipboardList className="size-4 text-violet-600" />}
            />
            <CardBody className="pt-3">
              <ChecklistHistory submissions={checklistSubmissions} fallback={checklist ?? null} />
            </CardBody>
          </Card>

          {/* 5. Past Completed Review Cycles (Excludes incomplete draft) */}
          {(reviewHistory ?? []).filter((entry) => entry.decision !== null).length > 0 && (
            <Card
              collapsible
              defaultExpanded={false}
              resetKey={task.id}
              summary={`${(reviewHistory ?? []).filter((entry) => entry.decision !== null).length} completed ${(reviewHistory ?? []).filter((entry) => entry.decision !== null).length === 1 ? 'cycle' : 'cycles'}`}
            >
              <CardHeader
                title="Review Cycle History"
                description="Finalized past review cycles."
                icon={<History className="size-4 text-violet-600" />}
              />
              <CardBody className="pt-3">
                <ReviewCycleHistory
                  entries={(reviewHistory ?? []).filter((entry) => entry.decision !== null)}
                />
              </CardBody>
            </Card>
          )}
        </div>

        {/* Right / Sidebar Column (4-5 cols on desktop) */}
        <div className="space-y-5 lg:sticky lg:top-6 lg:col-span-5 xl:col-span-4">
          {/* 6. Generic Task Information Card with Handover Overrides */}
          <TaskInformationCard
            task={task}
            previousReviewerName={effectiveHandover.fromReviewerName}
            overrideStatusBadge={
              isPending ? (
                <Tag className="border border-amber-300 bg-amber-100 text-xs font-bold text-amber-900">
                  Awaiting Admin Action
                </Tag>
              ) : undefined
            }
          />

          {/* 7. Task History Timeline with Latest Handover Highlighted */}
          <TaskActivityTimeline events={events ?? []} highlightLatestEventKind="HandedOver" />
        </div>
      </div>
    </PageContainer>
  );
}
