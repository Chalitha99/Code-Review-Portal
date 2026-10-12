import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ClipboardCheck,
  Clock,
  History,
  Image as ImageIcon,
  Info,
  User,
} from 'lucide-react';
import { useBlocker, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { Review, ReviewDecision, ReviewDraft } from '@sdp/contracts';
import { TaskDetailHeaderMetadata } from '@/portals/code-review/components/TaskDetailHeaderMetadata.tsx';
import { Button } from '@/components/ui/Button.tsx';
import { Card, CardBody, CardHeader } from '@/components/ui/Card.tsx';
import { BackLink, PageHeader } from '@/components/common/PageHeader.tsx';
import { ErrorState, LoadingState } from '@/components/common/states.tsx';
import { ROUTES } from '@/config/routes.ts';
import { ApiError } from '@/lib/apiClient.ts';
import { interpolate, textOr } from '@/lib/formatters.ts';
import { useCurrentUser } from '@/hooks/useCurrentUser.ts';
import {
  useTask,
  useTaskAttachments,
  useTaskChecklist,
  useChecklistSubmissions,
  useIssueResponses,
  useTaskEvents,
} from '@/portals/code-review/hooks/useTasks.ts';
import common from '@/content/common.json';
import reviews from '@/content/reviews.json';
import { ChecklistHistory } from '@/portals/code-review/components/ChecklistHistory.tsx';
import { ImageGallery } from '@/components/common/ImageGallery.tsx';
import { canDecideReview, canHandOver } from '@/lib/statusMachine.ts';
import {
  useCurrentReview,
  useDecideReview,
  useReviewHistory,
  useSaveReviewDraft,
  useUpdateVerdict,
} from '../api/queries.ts';
import { ReviewerAssessment } from '../components/ReviewerAssessment.tsx';
import { DeveloperRejectionsReview } from '../components/DeveloperRejectionsReview.tsx';
import { HandoverDialog } from '../components/HandoverDialog.tsx';
import { ReviewSidebar } from '../components/ReviewSidebar.tsx';
import { CompletedReviewSummary } from '../components/CompletedReviewSummary.tsx';
import { PreviousReviewSummaryCard } from '../components/PreviousReviewSummaryCard.tsx';
import { HandedOverSummary } from '../components/HandedOverSummary.tsx';
import { ReviewCycleHistory } from '@/portals/code-review/components/ReviewCycleHistory.tsx';
import { PageContainer } from '@/components/common/PageContainer.tsx';
import { ConfirmDialog } from '@/components/common/ConfirmDialog.tsx';
import { ReviewDecisionDialog } from '../components/ReviewDecisionDialog.tsx';
import { getReviewerReturnDestination } from '../domain/reviewerNavigation.ts';
import { resolveActiveReviewRound } from '../domain/reviewRules.ts';

import {
  AUTOSAVE_DELAY_MS,
  EMPTY_DRAFT,
  createEditableSnapshot,
  reviewToDraft,
} from '../domain/reviewDraftState.ts';

export interface ReviewFormSectionProps {
  review: Review | null;
  currentUserId?: string | undefined;
  currentReviewSessionId?: string | undefined;
  taskCode?: string | undefined;
  reviewRound?: number | undefined;
  /** Legacy alias for reviewRound */
  reviewCycle?: number | undefined;
  onSaveDraft?: (draft: ReviewDraft) => Promise<unknown> | void;
  onDraftChange?: (draft: ReviewDraft) => void;
  onManualSaveDraft?: (draft: ReviewDraft) => Promise<unknown> | void;
  onHandover?: (() => void) | undefined;
  onDecide: (decision: ReviewDecision, draft: ReviewDraft) => void;
  isDeciding: boolean;
  isSavingDraft?: boolean | undefined;
  hasPendingRejections?: boolean | undefined;
  hasPendingAdjudication?: boolean | undefined;
  hasUnresolvedIssues?: boolean | undefined;
  readOnly: boolean;
}

export function ReviewFormSection({
  review,
  currentUserId,
  currentReviewSessionId,
  taskCode,
  reviewRound,
  reviewCycle,
  onSaveDraft,
  onDraftChange,
  onManualSaveDraft,
  onHandover,
  onDecide,
  isDeciding,
  isSavingDraft = false,
  hasPendingRejections = false,
  hasPendingAdjudication = false,
  hasUnresolvedIssues = false,
  readOnly,
}: ReviewFormSectionProps) {
  const [draft, setDraft] = useState<ReviewDraft>(() => reviewToDraft(review));
  const [isManualSaving, setIsManualSaving] = useState(false);
  const [isAutosaving, setIsAutosaving] = useState(false);
  const [hasSaveError, setHasSaveError] = useState(false);

  const latestDraft = useRef<ReviewDraft>(draft);
  // State, not a ref: the dirty flag and autosave status render from it.
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState(() =>
    createEditableSnapshot(draft, currentUserId, currentReviewSessionId),
  );

  // Latest callbacks for effects and async handlers, synced after each render.
  const onDraftChangeRef = useRef(onDraftChange);
  const onSaveDraftRef = useRef(onSaveDraft);
  const onManualSaveDraftRef = useRef(onManualSaveDraft);
  useLayoutEffect(() => {
    onDraftChangeRef.current = onDraftChange;
    onSaveDraftRef.current = onSaveDraft;
    onManualSaveDraftRef.current = onManualSaveDraft;
  });

  // Hydrate from server only if draft was uninitialized/clean and review arrives later
  useEffect(() => {
    if (review) {
      const initialDraft = reviewToDraft(review);
      const snapshot = createEditableSnapshot(initialDraft, currentUserId, currentReviewSessionId);
      if (
        createEditableSnapshot(latestDraft.current, currentUserId, currentReviewSessionId) ===
        createEditableSnapshot(EMPTY_DRAFT, currentUserId, currentReviewSessionId)
      ) {
        setDraft(initialDraft);
        latestDraft.current = initialDraft;
        setLastSavedSnapshot(snapshot);
        setHasSaveError(false);
      } else {
        setDraft((prev) => {
          const serverComments = review.comments ?? [];
          const updatedComments = (prev.comments ?? []).map((dc) => {
            const matching = serverComments.find((sc) => sc.id === dc.id);
            if (matching?.reviewSessionId && !dc.reviewSessionId) {
              return { ...dc, reviewSessionId: matching.reviewSessionId };
            }
            return dc;
          });
          const updatedDraft = {
            ...prev,
            currentReviewSessionId: review.currentReviewSessionId ?? prev.currentReviewSessionId,
            comments: updatedComments,
          };
          latestDraft.current = updatedDraft;
          return updatedDraft;
        });
      }
    }
  }, [review, currentReviewSessionId, currentUserId]);

  const handleDraftChange = useCallback((next: ReviewDraft) => {
    setDraft(next);
    latestDraft.current = next;
    setHasSaveError(false);
    onDraftChangeRef.current?.(next);
  }, []);

  const handleManualSave = useCallback(async () => {
    if (readOnly || isManualSaving) return;

    const draftBeingSaved = latestDraft.current;
    const snapshotBeingSaved = createEditableSnapshot(
      draftBeingSaved,
      currentUserId,
      currentReviewSessionId,
    );

    // No-op if already clean / saved
    if (snapshotBeingSaved === lastSavedSnapshot) {
      return;
    }

    setIsManualSaving(true);
    setHasSaveError(false);

    try {
      if (onManualSaveDraftRef.current) {
        await onManualSaveDraftRef.current(draftBeingSaved);
      }
      setLastSavedSnapshot(snapshotBeingSaved);
      setHasSaveError(false);
    } catch {
      setHasSaveError(true);
    } finally {
      setIsManualSaving(false);
    }
  }, [readOnly, isManualSaving, currentUserId, currentReviewSessionId, lastSavedSnapshot]);

  const handleDecide = useCallback(
    (decision: ReviewDecision) => {
      onDecide(decision, latestDraft.current);
    },
    [onDecide],
  );

  const currentSnapshot = createEditableSnapshot(draft, currentUserId, currentReviewSessionId);
  const isDirty = currentSnapshot !== lastSavedSnapshot;

  useEffect(() => {
    if (readOnly || !isDirty || isManualSaving || isAutosaving || !onSaveDraftRef.current) return;

    const draftBeingSaved = draft;
    const snapshotBeingSaved = currentSnapshot;
    const timer = window.setTimeout(() => {
      setIsAutosaving(true);
      setHasSaveError(false);
      void Promise.resolve(onSaveDraftRef.current?.(draftBeingSaved))
        .then(() => {
          setLastSavedSnapshot(snapshotBeingSaved);
          setHasSaveError(false);
        })
        .catch(() => {
          setHasSaveError(true);
        })
        .finally(() => {
          setIsAutosaving(false);
        });
    }, AUTOSAVE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [currentSnapshot, draft, isDirty, isManualSaving, isAutosaving, readOnly]);

  let autosaveStatus: 'saved' | 'unsaved' | 'saving' | 'error' = 'saved';
  if (hasSaveError) {
    autosaveStatus = 'error';
  } else if (isManualSaving || isAutosaving) {
    autosaveStatus = 'saving';
  } else if (isDirty) {
    autosaveStatus = 'unsaved';
  } else {
    autosaveStatus = 'saved';
  }

  return (
    <ReviewerAssessment
      draft={draft}
      taskCode={taskCode}
      reviewRound={reviewRound ?? review?.reviewRound ?? reviewCycle ?? 1}
      reviewCycle={reviewRound ?? review?.reviewRound ?? reviewCycle ?? 1}
      currentUserId={currentUserId}
      currentReviewSessionId={currentReviewSessionId}
      onChange={handleDraftChange}
      onDecide={handleDecide}
      onSaveDraft={() => {
        void handleManualSave();
      }}
      onHandover={onHandover}
      isDeciding={isDeciding}
      isSavingDraft={isManualSaving || isSavingDraft}
      isAutosaving={isAutosaving}
      saveStatus={autosaveStatus}
      autosaveStatus={autosaveStatus}
      hasPendingRejections={hasPendingRejections}
      hasPendingAdjudication={hasPendingAdjudication}
      hasUnresolvedIssues={hasUnresolvedIssues}
      readOnly={readOnly}
    />
  );
}

export function ReviewTaskPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const { data: user } = useCurrentUser();

  const { data: task, isPending, error, refetch } = useTask(taskId);
  const { data: current } = useCurrentReview(taskId);
  const { data: history } = useReviewHistory(taskId);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { data: checklist } = useTaskChecklist(taskId);
  const { data: checklistSubmissions = [] } = useChecklistSubmissions(taskId);
  const { data: attachments } = useTaskAttachments(taskId);
  const { data: responses } = useIssueResponses(taskId);
  const { data: events } = useTaskEvents(taskId);

  const decide = useDecideReview(taskId ?? '');
  const saveDraft = useSaveReviewDraft(taskId ?? '');
  const updateVerdict = useUpdateVerdict(taskId ?? '');

  const [liveDraft, setLiveDraft] = useState<ReviewDraft>(EMPTY_DRAFT);
  const [isHandoverOpen, setHandoverOpen] = useState(false);
  const [isTransitioningAfterHandover, setIsTransitioningAfterHandover] = useState(false);
  const [decisionToConfirm, setDecisionToConfirm] = useState<{
    decision: ReviewDecision;
    draft: ReviewDraft;
    reviewRound: number;
    reviewCycle?: number;
  } | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState('');
  const isSubmittingRef = useRef(false);
  const [hydratedFrom, setHydratedFrom] = useState<{
    review: typeof current;
    userId: string | undefined;
    sessionId: string | undefined;
  } | null>(null);

  const handleOpenDecisionConfirm = useCallback(
    (decision: ReviewDecision, draft: ReviewDraft) => {
      setDecisionToConfirm({
        decision,
        draft,
        reviewRound: Math.max(1, task?.historicalCycle ?? task?.reviewCycle ?? 0),
        reviewCycle: Math.max(1, task?.historicalCycle ?? task?.reviewCycle ?? 0),
      });
    },
    [task?.historicalCycle, task?.reviewCycle],
  );

  // A different task starts from a clean slate (adjusted during render).
  const [stateTaskId, setStateTaskId] = useState(taskId);
  if (stateTaskId !== taskId) {
    setStateTaskId(taskId);
    setIsInitialized(false);
    setHydratedFrom(null);
    setIsTransitioningAfterHandover(false);
  }
  useEffect(() => {
    isSubmittingRef.current = false;
  }, [taskId]);

  const currentSessionId =
    task?.currentReviewSessionId ?? current?.currentReviewSessionId ?? undefined;

  // Hydrate the live draft from the server review (adjusted during render). Skipped on the
  // render where the task itself changed, so the reset above lands first.
  const needsHydration =
    stateTaskId === taskId &&
    current !== undefined &&
    (hydratedFrom?.review !== current ||
      hydratedFrom.userId !== user?.id ||
      hydratedFrom.sessionId !== currentSessionId);
  if (needsHydration) {
    setHydratedFrom({ review: current, userId: user?.id, sessionId: currentSessionId });
    if (!isInitialized) {
      setIsInitialized(true);
      const initial = reviewToDraft(current ?? null);
      setLiveDraft(initial);
      setLastSavedSnapshot(createEditableSnapshot(initial, user?.id, currentSessionId));
    } else if (current) {
      if (
        createEditableSnapshot(liveDraft, user?.id, currentSessionId) ===
        createEditableSnapshot(EMPTY_DRAFT, user?.id, currentSessionId)
      ) {
        const initial = reviewToDraft(current);
        setLiveDraft(initial);
        setLastSavedSnapshot(createEditableSnapshot(initial, user?.id, currentSessionId));
      } else {
        // Sync server-assigned session metadata onto liveDraft
        setLiveDraft((prev) => {
          const serverComments = current.comments ?? [];
          const updatedComments = (prev.comments ?? []).map((dc) => {
            const matching = serverComments.find((sc) => sc.id === dc.id);
            if (matching?.reviewSessionId && !dc.reviewSessionId) {
              return { ...dc, reviewSessionId: matching.reviewSessionId };
            }
            return dc;
          });
          return {
            ...prev,
            currentReviewSessionId: current.currentReviewSessionId ?? prev.currentReviewSessionId,
            comments: updatedComments,
          };
        });
      }
    }
  }

  const handleDecide = useCallback(
    async (decision: ReviewDecision, draft: ReviewDraft) => {
      isSubmittingRef.current = true;
      try {
        const updated = await decide.mutateAsync({ decision, draft });
        toast.success(
          interpolate(
            decision === 'Approved' ? reviews.form.approved : reviews.form.changesRequested,
            { taskCode: updated.taskCode },
          ),
        );
        return updated;
      } catch (cause) {
        isSubmittingRef.current = false;
        toast.error(cause instanceof ApiError ? cause.message : common.errors.generic);
        throw cause;
      }
    },
    [decide],
  );

  const saveDraftRef = useRef(saveDraft.mutateAsync);
  useEffect(() => {
    saveDraftRef.current = saveDraft.mutateAsync;
  });

  const handleManualSave = useCallback(
    async (draftToSave: ReviewDraft) => {
      const snapshotToSave = createEditableSnapshot(draftToSave, user?.id, currentSessionId);
      if (snapshotToSave === lastSavedSnapshot) {
        return;
      }
      try {
        await saveDraftRef.current({ draft: draftToSave, source: 'manual' });
        setLastSavedSnapshot(snapshotToSave);
        toast.success(reviews.form.draftSaved);
      } catch (cause) {
        toast.error(cause instanceof ApiError ? cause.message : common.errors.generic);
        throw cause;
      }
    },
    [user?.id, currentSessionId, lastSavedSnapshot],
  );

  const handleAutoSave = useCallback(
    async (draftToSave: ReviewDraft) => {
      const snapshotToSave = createEditableSnapshot(draftToSave, user?.id, currentSessionId);
      await saveDraftRef.current({ draft: draftToSave, source: 'autosave' });
      setLastSavedSnapshot(snapshotToSave);
    },
    [user?.id, currentSessionId],
  );

  const handleDraftChange = useCallback(
    (next: ReviewDraft) => {
      if (!isInitialized) {
        setIsInitialized(true);
        setLastSavedSnapshot(createEditableSnapshot(EMPTY_DRAFT, user?.id, currentSessionId));
      }
      setLiveDraft(next);
    },
    [isInitialized, user?.id, currentSessionId],
  );

  const [adjudicationDrafts, setAdjudicationDrafts] = useState<Record<string, boolean>>({});

  const handleAdjudicationDraftChange = useCallback((responseId: string, isDrafting: boolean) => {
    setAdjudicationDrafts((prev) => {
      if (Boolean(prev[responseId]) === isDrafting) return prev;
      const next = { ...prev };
      if (isDrafting) {
        next[responseId] = true;
      } else {
        delete next[responseId];
      }
      return next;
    });
  }, []);

  const actor = { userId: user?.id ?? '', roles: user?.roles ?? [] };
  const taskSubject = {
    status: task?.status ?? 'Draft',
    developerId: task?.developerId ?? '',
    reviewerId: task?.reviewerId ?? null,
    isHandedOver: task?.isHandedOver ?? false,
  };
  const isEditable = canDecideReview(actor, taskSubject);
  const canUserHandover = canHandOver(actor, taskSubject);

  const isDirty =
    Boolean(isEditable) &&
    isInitialized &&
    createEditableSnapshot(liveDraft, user?.id, currentSessionId) !== lastSavedSnapshot;

  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    Boolean(
      isDirty && !isSubmittingRef.current && currentLocation.pathname !== nextLocation.pathname,
    ),
  );

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (isDirty && !isSubmittingRef.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isDirty]);

  const completedHistory = useMemo(() => {
    return (history ?? [])
      .filter((entry) => entry.decision !== null && entry.decidedAt !== null)
      .sort((a, b) => {
        if (b.reviewRound !== a.reviewRound) {
          return b.reviewRound - a.reviewRound;
        }
        return (b.decidedAt ?? '').localeCompare(a.decidedAt ?? '');
      });
  }, [history]);

  const historyEntries = useMemo(() => {
    return (history ?? [])
      .filter((entry) => entry.decision !== null || (entry.responses && entry.responses.length > 0))
      .sort((a, b) => {
        if (b.reviewRound !== a.reviewRound) {
          return b.reviewRound - a.reviewRound;
        }
        return (b.decidedAt ?? '').localeCompare(a.decidedAt ?? '');
      });
  }, [history]);

  const latestCompletedReview = useMemo(() => {
    return (
      completedHistory[0] ??
      (current && current.decision !== null && current.decidedAt !== null ? current : null)
    );
  }, [completedHistory, current]);

  const locationState = location.state as { returnTo?: string } | null;
  const returnDestination = useMemo(() => {
    return getReviewerReturnDestination({
      locationStateReturnTo: locationState?.returnTo,
      searchParams,
      task: task ?? null,
      currentUser: user ?? null,
      latestCompletedReview: latestCompletedReview ?? null,
    });
  }, [locationState?.returnTo, searchParams, task, user, latestCompletedReview]);

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

  const isReReview =
    completedHistory.length > 0 ||
    (task.reviewRound != null && task.reviewRound > 1) ||
    task.status === 'ReSubmitted';

  const isHandedOver = Boolean(task.isHandedOver) || isTransitioningAfterHandover;

  const isModeB = !isHandedOver && task.status === 'ChangesRequested';
  const isModeE = !isHandedOver && task.status === 'Approved';
  const isModeC = !isHandedOver && task.status === 'ReSubmitted' && !task.reviewerId;
  const isModeD = !isHandedOver && task.status === 'InReview' && Boolean(isEditable) && isReReview;
  const isModeA = !isHandedOver && task.status === 'InReview' && Boolean(isEditable) && !isReReview;

  const activeRound = resolveActiveReviewRound(task, history ?? []);
  const currentResponses = responses ?? [];
  const roundResponses = isReReview
    ? currentResponses.some((r) => r.reviewRound === activeRound)
      ? currentResponses.filter((r) => r.reviewRound === activeRound)
      : currentResponses.filter((r) => {
          const lastCompleted = completedHistory[0];
          return lastCompleted ? r.reviewRound === lastCompleted.reviewRound : true;
        })
    : [];

  const hasActiveAdjudicationDrafts = Object.values(adjudicationDrafts).some(Boolean);

  const hasPendingAdjudication =
    isReReview &&
    roundResponses.length > 0 &&
    (roundResponses.some((r) => !r.verdict || r.verdict === 'Pending') ||
      hasActiveAdjudicationDrafts);

  const hasUnresolvedIssues = isReReview && roundResponses.some((r) => r.verdict === 'Overruled');

  const allRejectionsAccepted =
    isReReview &&
    roundResponses.length > 0 &&
    roundResponses.every((r) => r.kind === 'Rejected' && r.verdict === 'Accepted') &&
    roundResponses.every((r) => r.kind !== 'Resolved');

  const hasPendingRejections = hasPendingAdjudication;

  // Common UI Sections
  const checklistSection = (
    <Card
      collapsible
      defaultExpanded={false}
      resetKey={task.id}
      summary={`${checklist?.answers.length ?? 0} answers`}
    >
      <CardHeader
        title={reviews.form.developerChecklist}
        description={task.developerName}
        icon={<ClipboardCheck className="size-4" />}
      />
      <CardBody className="pt-4">
        <ChecklistHistory submissions={checklistSubmissions} fallback={checklist ?? null} />
      </CardBody>
    </Card>
  );

  const attachmentsSection =
    (attachments ?? []).length > 0 ? (
      <Card
        collapsible
        defaultExpanded={false}
        resetKey={task.id}
        summary={`${attachments?.length ?? 0} attachments`}
      >
        <CardHeader
          title={reviews.form.developerAttachments}
          description={reviews.form.developerAttachmentsHint}
          icon={<ImageIcon className="size-4" />}
        />
        <CardBody className="pt-4">
          <ImageGallery
            images={(attachments ?? []).map((item) => ({ ...item, comment: item.caption }))}
            emptyText=""
          />
        </CardBody>
      </Card>
    ) : null;

  const rejectionsReviewSection = (
    <DeveloperRejectionsReview
      taskId={task.id}
      history={history ?? []}
      responses={responses ?? []}
      activeRound={activeRound}
      activeCycle={activeRound}
      onUpdateVerdict={(responseId, verdict, reviewerComment) => {
        updateVerdict.mutate({ responseId, verdict, reviewerComment });
      }}
      onDraftChange={handleAdjudicationDraftChange}
      isUpdatingVerdict={updateVerdict.isPending}
      readOnly={!isEditable}
    />
  );

  const assessmentSection = (
    <ReviewFormSection
      key={`${task.id}-${String(task.reviewRound)}-${task?.currentReviewSessionId ?? current?.currentReviewSessionId ?? 'open'}`}
      review={current ?? null}
      currentUserId={user?.id}
      currentReviewSessionId={
        task?.currentReviewSessionId ?? current?.currentReviewSessionId ?? undefined
      }
      taskCode={task.taskCode}
      reviewRound={Math.max(1, task.historicalCycle ?? task.reviewCycle ?? task.reviewRound)}
      reviewCycle={Math.max(1, task.historicalCycle ?? task.reviewCycle ?? task.reviewRound)}
      onSaveDraft={handleAutoSave}
      onDraftChange={handleDraftChange}
      onManualSaveDraft={handleManualSave}
      onHandover={
        canUserHandover
          ? () => {
              setHandoverOpen(true);
            }
          : undefined
      }
      onDecide={handleOpenDecisionConfirm}
      isDeciding={decide.isPending}
      isSavingDraft={saveDraft.isPending}
      hasPendingRejections={hasPendingRejections}
      hasPendingAdjudication={hasPendingAdjudication}
      hasUnresolvedIssues={hasUnresolvedIssues}
      readOnly={!isEditable}
    />
  );

  const historySection = (
    <Card
      collapsible
      defaultExpanded={false}
      resetKey={task.id}
      summary={`${completedHistory.length} completed ${completedHistory.length === 1 ? 'round' : 'rounds'}`}
    >
      <CardHeader
        title={reviews.form.historyTitle}
        description={reviews.form.historySubtitle}
        icon={<History className="size-4" />}
      />
      <CardBody className="pt-4">
        <ReviewCycleHistory entries={historyEntries} countedCycle={task.countedCycle} />
      </CardBody>
    </Card>
  );

  return (
    <PageContainer className="space-y-4">
      <BackLink to={returnDestination.to} label={returnDestination.label} />

      <PageHeader
        title={task.title}
        subtitle={
          <TaskDetailHeaderMetadata
            taskCode={task.taskCode}
            status={task.status}
            workflowContext={
              isHandedOver
                ? 'Handed over'
                : isModeD
                  ? 'Re-review in progress'
                  : isModeC
                    ? 'Re-review ready'
                    : undefined
            }
          />
        }
        icon={<ClipboardCheck className="size-5" />}
        tone="reviewer"
      />

      {blocker.state === 'blocked' ? (
        <ConfirmDialog
          open={blocker.state === 'blocked'}
          onOpenChange={(open) => {
            if (!open && blocker.state === 'blocked') {
              blocker.reset();
            }
          }}
          title="Unsaved Changes"
          description="You have unsaved changes on this review. If you leave now, your changes will be discarded."
          confirmLabel="Leave Page"
          cancelLabel="Stay on Page"
          tone="danger"
          onConfirm={() => {
            blocker.proceed();
          }}
        />
      ) : null}

      {isHandoverOpen ? (
        <HandoverDialog
          task={task}
          draft={liveDraft}
          onClearRank={() => {
            setLiveDraft((prev) => ({ ...prev, rank: null, previousFeedbackReviewNote: null }));
          }}
          onSuccess={() => {
            setIsTransitioningAfterHandover(true);
            isSubmittingRef.current = true;
            setLastSavedSnapshot(
              createEditableSnapshot(
                liveDraft,
                user?.id,
                task?.currentReviewSessionId ?? undefined,
              ),
            );
            void navigate(ROUTES.reviewer.root, { replace: true });
          }}
          onClose={() => {
            setHandoverOpen(false);
          }}
        />
      ) : null}

      {decisionToConfirm ? (
        <ReviewDecisionDialog
          open={decisionToConfirm !== null}
          decision={decisionToConfirm.decision}
          draft={decisionToConfirm.draft}
          reviewRound={decisionToConfirm.reviewRound}
          reviewCycle={decisionToConfirm.reviewRound}
          onConfirm={async () => {
            await handleDecide(decisionToConfirm.decision, decisionToConfirm.draft);
          }}
          onSuccess={(decision) => {
            const bucket = decision === 'Approved' ? 'approved' : 'changesRequested';
            const statusParam = decision === 'Approved' ? 'Approved' : 'ChangesRequested';
            void navigate(
              `${ROUTES.reviewer.history}?status=${statusParam}&bucket=${bucket}&decision=${statusParam}`,
              { replace: true },
            );
          }}
          onClose={() => setDecisionToConfirm(null)}
          onOpenChange={(next) => {
            if (!next) setDecisionToConfirm(null);
          }}
        />
      ) : null}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        {/* Main Content Column (8 cols) */}
        <div className="space-y-6 lg:col-span-8">
          {/* Handed Over State */}
          {isHandedOver && (
            <>
              {checklistSection}
              {attachmentsSection}
              <HandedOverSummary task={task} events={events ?? []} />
              {historySection}
            </>
          )}

          {/* Mode B: Changes Requested / Waiting for Developer */}
          {!isHandedOver && isModeB && (
            <>
              {checklistSection}
              {attachmentsSection}
              {latestCompletedReview ? (
                <CompletedReviewSummary review={latestCompletedReview} taskCode={task.taskCode} />
              ) : null}
              {historySection}
            </>
          )}

          {/* Mode E: Approved */}
          {!isHandedOver && isModeE && (
            <>
              {checklistSection}
              {attachmentsSection}
              {latestCompletedReview ? (
                <CompletedReviewSummary review={latestCompletedReview} taskCode={task.taskCode} />
              ) : null}
              {historySection}
            </>
          )}

          {/* Mode C: ReSubmitted / Waiting for Reviewer */}
          {!isHandedOver && isModeC && (
            <>
              <div
                role="status"
                className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-amber-950 shadow-2xs"
              >
                <Clock className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden="true" />
                <div className="space-y-1">
                  <p className="text-sm font-bold">Task Re-submitted — Ready for Re-Review</p>
                  <p className="text-xs leading-relaxed text-ink-700">
                    The developer has addressed previous feedback and resubmitted the task. Pick
                    this task from the review queue to begin the re-review.
                  </p>
                </div>
              </div>
              {checklistSection}
              {rejectionsReviewSection}
              {attachmentsSection}
              {historySection}
            </>
          )}

          {/* Mode D: Active Re-Review */}
          {!isHandedOver && isModeD && (
            <>
              {checklistSection}
              {latestCompletedReview && (
                <PreviousReviewSummaryCard previousReview={latestCompletedReview} />
              )}
              {rejectionsReviewSection}
              {attachmentsSection}
              {assessmentSection}
              {historySection}
            </>
          )}

          {/* Mode A: Active Initial Review */}
          {!isHandedOver && isModeA && (
            <>
              {checklistSection}
              {attachmentsSection}
              {assessmentSection}
              {historySection}
            </>
          )}

          {/* Fallback for other states (e.g., InReview but assigned to another reviewer, or Submitted unassigned) */}
          {!isHandedOver && !isModeA && !isModeB && !isModeC && !isModeD && !isModeE && (
            <>
              {task.status === 'InReview' && !isEditable ? (
                <Card className="border-line bg-surface shadow-xs">
                  <CardHeader
                    title="Task Assigned to Another Reviewer"
                    description={`This task is currently in review by ${textOr(task.reviewerName, 'another reviewer')}.`}
                    icon={<User className="size-5 text-ink-500" />}
                  />
                  <CardBody className="space-y-4 pt-2">
                    <div
                      role="status"
                      className="text-ink-800 flex items-start gap-3 rounded-xl border border-line bg-canvas/60 p-4"
                    >
                      <Info className="mt-0.5 size-5 shrink-0 text-ink-500" aria-hidden="true" />
                      <div className="space-y-1">
                        <p className="text-sm font-bold">Active Review in Progress</p>
                        <p className="text-ink-600 text-xs leading-relaxed">
                          This task is actively being reviewed by{' '}
                          {textOr(task.reviewerName, 'another reviewer')}. You do not have
                          permission to view or edit this active assessment.
                        </p>
                      </div>
                    </div>
                    <div className="flex justify-end pt-2">
                      <Button
                        type="button"
                        variant="primary"
                        onClick={() => {
                          void navigate(returnDestination.to);
                        }}
                        leadingIcon={<ArrowLeft className="size-4" />}
                      >
                        {returnDestination.label}
                      </Button>
                    </div>
                  </CardBody>
                </Card>
              ) : (
                <div
                  role="status"
                  className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50/70 p-4 text-blue-950 shadow-2xs"
                >
                  <Clock className="mt-0.5 size-5 shrink-0 text-blue-600" aria-hidden="true" />
                  <div className="space-y-1">
                    <p className="text-sm font-bold">Task Submitted — In Review Queue</p>
                    <p className="text-xs leading-relaxed text-ink-700">
                      This task is currently unassigned in the review queue. Pick this task from
                      your dashboard to begin reviewing.
                    </p>
                  </div>
                </div>
              )}
              {checklistSection}
              {isReReview && latestCompletedReview && (
                <PreviousReviewSummaryCard previousReview={latestCompletedReview} />
              )}
              {isReReview && rejectionsReviewSection}
              {attachmentsSection}
              {historySection}
            </>
          )}
        </div>

        {/* Supporting Sticky Sidebar Column (4 cols) */}
        <div className="space-y-4 lg:sticky lg:top-6 lg:col-span-4">
          <ReviewSidebar
            task={isTransitioningAfterHandover ? { ...task, isHandedOver: true } : task}
            review={latestCompletedReview ?? (current as Review | null) ?? null}
            draft={liveDraft}
            events={events ?? []}
            allRejectionsAccepted={allRejectionsAccepted}
            hasPendingRejections={hasPendingRejections}
            hasPendingAdjudication={hasPendingAdjudication}
            hasUnresolvedIssues={hasUnresolvedIssues}
            currentUserId={user?.id}
          />
        </div>
      </div>
    </PageContainer>
  );
}
