import { useState } from 'react';
import { ClipboardList, FileText, History, Send, Trash2 } from 'lucide-react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/common/ConfirmDialog.tsx';
import { TaskDetailHeaderMetadata } from '@/portals/code-review/components/TaskDetailHeaderMetadata.tsx';
import { TaskInformationCard } from '@/portals/code-review/components/TaskInformationCard.tsx';
import { Button } from '@/components/ui/Button.tsx';
import { buttonVariants } from '@/components/ui/buttonVariants.ts';
import { Card, CardBody, CardHeader } from '@/components/ui/Card.tsx';
import { Alert } from '@/components/ui/Alert.tsx';
import { BackLink, PageHeader } from '@/components/common/PageHeader.tsx';
import { ErrorState, LoadingState } from '@/components/common/states.tsx';
import { ROUTES } from '@/config/routes.ts';
import { ApiError } from '@/lib/apiClient.ts';
import common from '@/content/common.json';
import tasksContent from '@/content/tasks.json';
import { useCurrentUser } from '@/hooks/useCurrentUser.ts';
import {
  useSubmitTask,
  useTask,
  useTaskChecklist,
  useChecklistSubmissions,
  useTaskEvents,
  useTaskTypes,
  useIssueResponses,
  useRespondToIssue,
  useDeleteIssueResponse,
  useDiscardDraft,
} from '../api/queries.ts';
import {
  canDiscardDraft,
  canEditTask,
  canRespondToFindings,
  canSubmitForReview,
} from '@/lib/statusMachine.ts';
import { ChecklistHistory } from '@/portals/code-review/components/ChecklistHistory.tsx';
import { useReviewHistory } from '@/portals/code-review/hooks/useReviews.ts';
import { ReviewFeedbackPanel } from '../components/ReviewFeedbackPanel.tsx';
import { ReviewCycleHistory } from '@/portals/code-review/components/ReviewCycleHistory.tsx';
import { PageContainer } from '@/components/common/PageContainer.tsx';
import { TaskActivityTimeline } from '@/portals/code-review/components/TaskActivityTimeline.tsx';
import { resolveActiveReviewRound } from '@/lib/reviewCycles.ts';
import {
  buildDetailUrl,
  safeListReturnTo,
} from '@/portals/code-review/components/taskListNavigation.ts';

/**
 * Task Details (screens 18 and 19).
 *
 * One screen, not two. The wireframes draw an approved task and a draft task
 * separately, but they differ only in which actions the status permits — and
 * that question already has an answer in `statusMachine`. Two components would
 * mean two places to update when a transition changes.
 */
export function TaskDetailPage({
  mode = 'developer',
}: {
  mode?: 'developer' | 'reviewer' | 'admin';
} = {}) {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isDiscardConfirmOpen, setIsDiscardConfirmOpen] = useState(false);

  const { data: user } = useCurrentUser();
  const fallbackReturnTo = mode === 'admin' ? ROUTES.admin.root : ROUTES.developer.root;
  const returnTo = safeListReturnTo(searchParams, [fallbackReturnTo], fallbackReturnTo);
  const { data: task, isPending, error, refetch } = useTask(taskId);
  const { data: checklist } = useTaskChecklist(taskId);
  const { data: checklistSubmissions = [] } = useChecklistSubmissions(taskId);
  const { data: events } = useTaskEvents(taskId);
  const { data: taskTypes } = useTaskTypes();
  /*
   * No checklist TEMPLATE request here, deliberately.
   *
   * This page renders the checklist that was SAVED against the task, and
   * `ChecklistSummary` reads its wording from that snapshot. The template was
   * fetched back when the page hydrated the wizard store itself; that job moved
   * to `EditTaskRedirect`, and the request outlived the reason for it.
   */
  const { data: reviewHistory } = useReviewHistory(taskId);
  const { data: responses } = useIssueResponses(taskId);
  const respond = useRespondToIssue(taskId ?? '');
  const deleteResponse = useDeleteIssueResponse(taskId ?? '');
  const submit = useSubmitTask(taskId ?? '');
  const discardDraft = useDiscardDraft();

  if (isPending) return <LoadingState />;
  if (error || !task) {
    return (
      <ErrorState
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  // Prevent Developer-view leakage: if Admin views a handed-over task, forward to dedicated handover route
  if (task.isHandedOver && user?.roles.includes('Admin')) {
    return <Navigate to={buildDetailUrl(ROUTES.admin.handoverTask(task.id), returnTo)} replace />;
  }

  const actor = { userId: user?.id ?? '', roles: user?.roles ?? [] };
  const subject = {
    status: task.status,
    developerId: task.developerId,
    reviewerId: task.reviewerId,
  };

  /*
   * The "Continue editing" action re-opens the task in the generic creation/edit wizard.
   * On a ChangesRequested task, the developer's workflow is strictly to address reviewer
   * findings in ReviewFeedbackPanel and resubmit via "Resubmit for Review".
   * Showing "Continue editing" on ChangesRequested presents a conflicting second workflow.
   * Therefore, like maySubmitFirstTime, this action is restricted to Draft tasks only.
   */
  const mayEditDraft =
    mode === 'developer' && canEditTask(actor, subject) && task.status === 'Draft';
  const mayDiscardDraft = mode === 'developer' && canDiscardDraft(actor, subject);
  const isReady = task.isChecklistComplete;

  /*
   * The header Submit is for the FIRST submission only.
   *
   * `canSubmitForReview` is true on both edges — Draft → Submitted and
   * ChangesRequested → ReSubmitted — and this button gates only on checklist
   * completeness. On a returned task that let a developer resubmit without
   * answering the reviewer's findings: the server refused with
   * `RESPONSES_INCOMPLETE`, so nothing was corrupted, but the user was handed an
   * error they had no way to anticipate.
   *
   * Spec 2.11.2.2 makes "all feedback items addressed" the activation condition
   * for Resubmit, and `ReviewFeedbackPanel` below already enforces exactly that
   * through `resubmitReadiness` — in the place the developer is answering the
   * findings. One control, one rule; this one steps aside once a task has been
   * returned.
   */
  const maySubmitFirstTime =
    mode === 'developer' && canSubmitForReview(actor, subject) && task.status === 'Draft';

  function handleSubmit() {
    submit.mutate(undefined, {
      onSuccess: (updated) => {
        toast.success(`${updated.taskCode} ${common.status[updated.status].toLowerCase()}`);
      },
      onError: (cause) => {
        toast.error(cause instanceof ApiError ? cause.message : common.errors.generic);
      },
    });
  }

  return (
    <PageContainer className="space-y-5">
      <BackLink
        to={returnTo}
        label={mode === 'admin' ? 'Back to Admin Tasks' : tasksContent.detail.back}
      />

      {/* Task Header */}
      <PageHeader
        title={task.title}
        subtitle={<TaskDetailHeaderMetadata taskCode={task.taskCode} status={task.status} />}
        icon={<FileText className="size-5" />}
        tone={mode === 'admin' ? 'admin' : 'developer'}
        actions={
          mode === 'developer' ? (
            <div className="flex items-center gap-2.5">
              {mayDiscardDraft ? (
                <Button variant="danger" onClick={() => setIsDiscardConfirmOpen(true)}>
                  <Trash2 className="size-4" aria-hidden="true" />
                  {tasksContent.discardDraft.action}
                </Button>
              ) : null}
              {mayEditDraft ? (
                <Link
                  to={ROUTES.developer.editTask(task.id)}
                  className={buttonVariants({ variant: 'secondary' })}
                >
                  {tasksContent.detail.editDraft}
                </Link>
              ) : null}
              {maySubmitFirstTime ? (
                <Button onClick={handleSubmit} disabled={!isReady} isLoading={submit.isPending}>
                  <Send className="size-4" aria-hidden="true" />
                  {submit.isPending ? tasksContent.detail.submitting : tasksContent.detail.submit}
                </Button>
              ) : null}
            </div>
          ) : null
        }
      />

      {/* Contextual Status Banners for Important States */}
      {task.status === 'Cancelled' ? (
        <Alert tone="info" title="Task Cancelled">
          This task was cancelled and is no longer active.
        </Alert>
      ) : task.status === 'Approved' ? (
        <Alert tone="success" title="Review Approved">
          This task has been approved by the reviewer.
        </Alert>
      ) : task.status === 'ChangesRequested' ? (
        <Alert tone="warning" title="Changes Requested">
          The reviewer has requested changes. Please address the feedback findings below before
          resubmitting.
        </Alert>
      ) : null}

      {/* Warning banner when draft is blocked from submission */}
      {maySubmitFirstTime && !isReady ? (
        <Alert tone="warning" title={tasksContent.detail.submitBlocked} />
      ) : null}

      {/* 2-Column Balanced Responsive Layout */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        {/* Left / Primary Column (7-8 cols on desktop) */}
        <div className="space-y-5 lg:col-span-7 xl:col-span-8">
          {/* Actionable Review Feedback Response Panel when changes are requested */}
          {canRespondToFindings(actor, subject)
            ? (() => {
                const lastReview =
                  (reviewHistory ?? [])
                    .filter((entry) => entry.decision === 'ChangesRequested')
                    .sort((a, b) => b.reviewRound - a.reviewRound)[0] ?? null;
                const activeRound = resolveActiveReviewRound(task, reviewHistory ?? []);

                return (
                  <ReviewFeedbackPanel
                    review={lastReview}
                    allReviews={reviewHistory ?? []}
                    responses={responses ?? []}
                    activeRound={activeRound}
                    activeCycle={activeRound}
                    onRespond={(input) => {
                      respond.mutate(input, {
                        onError: (cause) => {
                          toast.error(
                            cause instanceof ApiError ? cause.message : common.errors.generic,
                          );
                        },
                      });
                    }}
                    onDelete={(responseId) => {
                      deleteResponse.mutate(responseId, {
                        onError: (cause) => {
                          toast.error(
                            cause instanceof ApiError ? cause.message : common.errors.generic,
                          );
                        },
                      });
                    }}
                    onResubmit={handleSubmit}
                    isResubmitting={submit.isPending}
                    disabled={respond.isPending || deleteResponse.isPending}
                  />
                );
              })()
            : null}

          {/* Developer Quality Checklist */}
          <Card
            collapsible
            defaultExpanded={false}
            resetKey={task.id}
            summary={`${checklist?.answers.length ?? 0} answers`}
          >
            <CardHeader
              title={tasksContent.detail.checklistTitle}
              description={tasksContent.detail.checklistSubtitle}
              icon={<ClipboardList className="size-4 text-violet-600" />}
            />
            <CardBody className="pt-3">
              <ChecklistHistory submissions={checklistSubmissions} fallback={checklist ?? null} />
            </CardBody>
          </Card>

          {/* Review Feedback History */}
          {(() => {
            const visibleHistory = (reviewHistory ?? []).filter(
              (entry) => entry.decision !== null || (entry.responses && entry.responses.length > 0),
            );
            if (visibleHistory.length === 0) return null;

            return (
              <Card
                collapsible
                defaultExpanded={false}
                resetKey={task.id}
                summary={`${visibleHistory.filter((entry) => entry.decision !== null).length} completed ${visibleHistory.filter((entry) => entry.decision !== null).length === 1 ? 'round' : 'rounds'}`}
                data-testid="review-feedback-history"
              >
                <CardHeader
                  title={tasksContent.response.historyTitle}
                  description={tasksContent.response.historySubtitle}
                  icon={<History className="size-4 text-violet-600" />}
                />
                <CardBody className="pt-3">
                  <ReviewCycleHistory entries={visibleHistory} countedCycle={task.countedCycle} />
                </CardBody>
              </Card>
            );
          })()}
        </div>

        {/* Right / Sidebar Column (4-5 cols on desktop) */}
        <div className="space-y-5 lg:sticky lg:top-6 lg:col-span-5 xl:col-span-4">
          {/* Task Information Card */}
          <TaskInformationCard task={task} taskTypes={taskTypes} />

          {/* Task History Timeline Card */}
          <TaskActivityTimeline events={events ?? []} />
        </div>
      </div>

      <ConfirmDialog
        open={isDiscardConfirmOpen}
        onOpenChange={setIsDiscardConfirmOpen}
        title={tasksContent.discardDraft.title}
        description={tasksContent.discardDraft.description}
        confirmLabel={
          discardDraft.isPending
            ? tasksContent.discardDraft.confirming
            : tasksContent.discardDraft.confirm
        }
        tone="danger"
        isPending={discardDraft.isPending}
        onConfirm={() => {
          discardDraft.mutate(task.id, {
            onSuccess: () => {
              toast.success(tasksContent.discardDraft.success);
              setIsDiscardConfirmOpen(false);
              void navigate(ROUTES.developer.root);
            },
            onError: (cause) => {
              toast.error(cause instanceof ApiError ? cause.message : common.errors.generic);
            },
          });
        }}
      />
    </PageContainer>
  );
}
