import { useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  MessageSquare,
  Plus,
  Save,
  UserCheck,
} from 'lucide-react';
import type {
  ReviewComment,
  ReviewDecision,
  ReviewDraft,
  ReviewRank,
  ReviewScreenshot,
} from '@sdp/contracts';
import { Alert } from '@/components/ui/Alert.tsx';
import { Button } from '@/components/ui/Button.tsx';
import { Card, CardBody, CardHeader } from '@/components/ui/Card.tsx';
import { Checkbox } from '@/components/ui/controls.tsx';
import { Tag } from '@/portals/code-review/components/badges.tsx';
import { cn } from '@/components/ui';
import {
  reviewBlockers,
  isDefectRank,
  isCommentOwnedBy,
  isCommentFromOtherReviewer,
} from '../domain/reviewRules.ts';
import { useCurrentUser } from '@/hooks/useCurrentUser.ts';
import { ReviewCommentCard } from './ReviewCommentCard.tsx';
import { ImageLightboxModal } from '@/portals/code-review/components/ImageLightboxModal.tsx';
import { RenameScreenshotDialog } from './RenameScreenshotDialog.tsx';

export interface ReviewerAssessmentProps {
  draft: ReviewDraft;
  taskCode?: string | undefined;
  reviewRound?: number | undefined;
  /** Legacy alias for reviewRound */
  reviewCycle?: number | undefined;
  currentUserId?: string | undefined;
  onChange: (draft: ReviewDraft) => void;
  onDecide: (decision: ReviewDecision) => void;
  onSaveDraft?: (() => void) | undefined;
  onHandover?: (() => void) | undefined;
  isDeciding: boolean;
  isSavingDraft?: boolean | undefined;
  isAutosaving?: boolean | undefined;
  saveStatus?: 'saved' | 'unsaved' | 'saving' | 'error' | undefined;
  autosaveStatus?: 'saved' | 'unsaved' | 'saving' | 'error' | undefined;
  hasPendingRejections?: boolean | undefined;
  hasPendingAdjudication?: boolean | undefined;
  hasUnresolvedIssues?: boolean | undefined;
  readOnly?: boolean | undefined;
  currentReviewSessionId?: string | undefined;
}

const RANK_CARDS: {
  rank: ReviewRank;
  title: string;
  subtitle: string;
  description: string;
  tone: 'clean' | 'minor' | 'major';
}[] = [
  {
    rank: 1,
    title: 'Rank 1',
    subtitle: 'Good / Approved Quality',
    description:
      'Review did not show up any serious issues. Development can be delivered after functional testing.',
    tone: 'clean',
  },
  {
    rank: 2,
    title: 'Rank 2',
    subtitle: 'Minor Issues / Needs Improvement',
    description:
      'Review showed up minor issues that need to be fixed before delivery. A re-review must be done prior to delivery.',
    tone: 'minor',
  },
  {
    rank: 3,
    title: 'Rank 3',
    subtitle: 'Major Issues / Significant Changes Required',
    description:
      'Review showed up serious issues requiring significant implementation changes. A re-review must be done prior to delivery.',
    tone: 'major',
  },
];

export function ReviewerAssessment({
  draft,
  taskCode,
  reviewRound,
  reviewCycle,
  currentUserId,
  currentReviewSessionId,
  onChange,
  onDecide,
  onSaveDraft,
  onHandover,
  isDeciding,
  isSavingDraft = false,
  saveStatus,
  autosaveStatus = 'saved',
  hasPendingRejections = false,
  hasPendingAdjudication = false,
  hasUnresolvedIssues = false,
  readOnly = false,
}: ReviewerAssessmentProps) {
  const activeRound = reviewRound ?? reviewCycle ?? 1;
  const currentSaveStatus = saveStatus ?? autosaveStatus;
  const [lightboxShot, setLightboxShot] = useState<ReviewScreenshot | null>(null);
  const [lightboxShots, setLightboxShots] = useState<readonly ReviewScreenshot[]>([]);
  const [renamingShot, setRenamingShot] = useState<ReviewScreenshot | null>(null);
  const [forceValidation, setForceValidation] = useState(false);

  const { data: currentUser } = useCurrentUser();
  const effectiveUserId = currentUserId ?? currentUser?.id;
  const effectiveSessionId = currentReviewSessionId ?? draft.currentReviewSessionId ?? undefined;

  const comments = draft.comments ?? [];
  const ownComments =
    effectiveSessionId || effectiveUserId
      ? comments.filter((c) => isCommentOwnedBy(c, effectiveUserId, effectiveSessionId))
      : comments;
  const previousComments =
    effectiveSessionId || effectiveUserId
      ? comments.filter((c) => isCommentFromOtherReviewer(c, effectiveUserId, effectiveSessionId))
      : [];

  const isPending = Boolean(hasPendingAdjudication || hasPendingRejections);

  const approveBlockers = reviewBlockers(
    {
      draft,
      hasPendingAdjudication: isPending,
      hasUnresolvedIssues,
      currentUserId: effectiveUserId,
      currentReviewSessionId: effectiveSessionId,
    },
    'Approved',
  );
  const changesBlockers = reviewBlockers(
    {
      draft,
      hasPendingAdjudication: isPending,
      hasUnresolvedIssues,
      currentUserId: effectiveUserId,
      currentReviewSessionId: effectiveSessionId,
    },
    'ChangesRequested',
  );

  const canApproveDecision =
    draft.rank === 1 &&
    approveBlockers.length === 0 &&
    !hasUnresolvedIssues &&
    !isPending &&
    !readOnly &&
    !isDeciding;

  const canRequestChangesDecision =
    draft.rank !== null &&
    isDefectRank(draft.rank) &&
    changesBlockers.length === 0 &&
    !isPending &&
    !readOnly &&
    !isDeciding;

  // All screenshots currently in the draft (for sequence generation)
  const allScreenshots = comments.flatMap((c) => c.screenshots ?? []);

  function handleSelectRank(rank: ReviewRank) {
    if (readOnly) return;
    onChange({
      ...draft,
      rank: draft.rank === rank ? null : rank,
    });
  }

  function handleAddComment() {
    if (readOnly) return;
    setForceValidation(false);
    const newComment: ReviewComment = {
      id: `rc-${Date.now()}-${comments.length + 1}`,
      reviewRound: activeRound,
      reviewerId: effectiveUserId,
      reviewerName: currentUser?.name,
      reviewSessionId: effectiveSessionId,
      text: '',
      screenshots: [],
      createdAt: new Date().toISOString(),
    };
    onChange({
      ...draft,
      comments: [...comments, newComment],
    });
  }

  function handleUpdateCommentText(commentId: string, text: string) {
    if (readOnly) return;
    const target = comments.find((c) => c.id === commentId);
    if (
      (effectiveSessionId || effectiveUserId) &&
      target &&
      !isCommentOwnedBy(target, effectiveUserId, effectiveSessionId)
    )
      return;
    const nextComments = comments.map((c) =>
      c.id === commentId ? { ...c, text, updatedAt: new Date().toISOString() } : c,
    );
    onChange({ ...draft, comments: nextComments });
  }

  function handleRemoveComment(commentId: string) {
    if (readOnly) return;
    const target = comments.find((c) => c.id === commentId);
    if (
      (effectiveSessionId || effectiveUserId) &&
      target &&
      !isCommentOwnedBy(target, effectiveUserId, effectiveSessionId)
    )
      return;
    const nextComments = comments.filter((c) => c.id !== commentId);
    if (!nextComments.some((c) => c.text.trim() === '')) {
      setForceValidation(false);
    }
    onChange({ ...draft, comments: nextComments });
  }

  function handleAttachScreenshots(commentId: string, shots: ReviewScreenshot[]) {
    if (readOnly || shots.length === 0) return;
    const target = comments.find((c) => c.id === commentId);
    if (
      (effectiveSessionId || effectiveUserId) &&
      target &&
      !isCommentOwnedBy(target, effectiveUserId, effectiveSessionId)
    )
      return;
    const nextComments = comments.map((c) =>
      c.id === commentId
        ? {
            ...c,
            screenshots: [...(c.screenshots ?? []), ...shots],
            updatedAt: new Date().toISOString(),
          }
        : c,
    );
    onChange({ ...draft, comments: nextComments });
  }

  function handlePreviewScreenshot(
    shot: ReviewScreenshot,
    commentScreenshots?: readonly ReviewScreenshot[],
  ) {
    setLightboxShot(shot);
    setLightboxShots(commentScreenshots ?? [shot]);
  }

  function handleRemoveScreenshot(commentId: string, screenshotId: string) {
    if (readOnly) return;
    const target = comments.find((c) => c.id === commentId);
    if (
      (effectiveSessionId || effectiveUserId) &&
      target &&
      !isCommentOwnedBy(target, effectiveUserId, effectiveSessionId)
    )
      return;
    const nextComments = comments.map((c) =>
      c.id === commentId
        ? {
            ...c,
            screenshots: (c.screenshots ?? []).filter((s) => s.id !== screenshotId),
            updatedAt: new Date().toISOString(),
          }
        : c,
    );
    onChange({ ...draft, comments: nextComments });
  }

  function handleSaveRename(shotId: string, newFileName: string) {
    if (readOnly) return;
    const parent = comments.find((c) => (c.screenshots ?? []).some((s) => s.id === shotId));
    if (
      (effectiveSessionId || effectiveUserId) &&
      parent &&
      !isCommentOwnedBy(parent, effectiveUserId, effectiveSessionId)
    )
      return;
    const nextComments = comments.map((c) => ({
      ...c,
      screenshots: (c.screenshots ?? []).map((s) =>
        s.id === shotId ? { ...s, fileName: newFileName } : s,
      ),
    }));
    onChange({ ...draft, comments: nextComments });
  }

  return (
    <>
      <Card
        collapsible
        defaultExpanded={!readOnly}
        resetKey={`${taskCode ?? 'task'}:${String(reviewCycle)}`}
        summary={readOnly ? 'Read only' : 'Active review'}
        className="border-violet-200/80 bg-gradient-to-b from-violet-50/15 via-surface to-surface shadow-card"
      >
        <CardHeader
          title="Reviewer Assessment"
          description="Evaluate the submission and document findings."
          icon={<UserCheck className="size-4 text-violet-600" />}
        />

        <CardBody className="space-y-7 pt-4">
          {/* SECTION 1: REVIEW COMMENTS (COMMENT-FIRST) */}
          <section aria-labelledby="review-comments-heading" className="space-y-4">
            {previousComments.length > 0 ? (
              <div className="space-y-6">
                {/* Subsection A: Previous Reviewer Feedback (Historical Context) */}
                <Card
                  collapsible
                  defaultExpanded={false}
                  resetKey={`${taskCode ?? 'task'}:${String(reviewCycle)}:previous-feedback`}
                  summary={`${previousComments.length} ${previousComments.length === 1 ? 'comment' : 'comments'}`}
                  className="overflow-hidden border-slate-200 bg-slate-50 shadow-none"
                >
                  <CardHeader
                    title="Previous Reviewer Feedback"
                    description="Read-only historical context preserved from previous review sessions."
                    icon={<Clock className="size-4 text-slate-500" />}
                  />
                  <CardBody className="pt-0">
                    <ul className="space-y-3">
                      {previousComments.map((comment, index) => (
                        <ReviewCommentCard
                          key={comment.id}
                          comment={comment}
                          index={index}
                          taskCode={taskCode}
                          currentUserId={effectiveUserId}
                          currentReviewSessionId={effectiveSessionId}
                          readOnly={true}
                          forceValidation={false}
                          allScreenshots={allScreenshots}
                          onUpdateText={handleUpdateCommentText}
                          onRemoveComment={handleRemoveComment}
                          onAttachScreenshots={handleAttachScreenshots}
                          onRemoveScreenshot={handleRemoveScreenshot}
                          onPreviewScreenshot={handlePreviewScreenshot}
                          onRenameScreenshot={(shot) => setRenamingShot(shot)}
                        />
                      ))}
                    </ul>
                  </CardBody>
                </Card>

                {/* Subsection B: Current Reviewer Feedback (Active Reviewer Workspace) */}
                <div className="space-y-4 rounded-2xl border border-violet-200/90 bg-surface p-4 shadow-xs ring-1 ring-violet-500/10 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/60 pb-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-violet-100 text-violet-700">
                          <MessageSquare className="size-4 text-violet-600" aria-hidden="true" />
                        </div>
                        <h3
                          id="review-comments-heading"
                          className="text-xs font-bold tracking-wider text-ink-900 uppercase"
                        >
                          Current Reviewer Feedback
                        </h3>
                        <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-800">
                          Editable
                        </span>
                        <span className="rounded-md border border-line bg-canvas px-2 py-0.5 text-xs font-semibold text-ink-500">
                          {ownComments.length} {ownComments.length === 1 ? 'comment' : 'comments'}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-ink-500">
                        Record actionable feedback and attach supporting evidence when useful.
                      </p>
                    </div>

                    {!readOnly && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={handleAddComment}
                        className="gap-1.5 border-violet-200 font-semibold text-violet-700 shadow-2xs hover:bg-violet-50"
                      >
                        <Plus className="size-3.5" aria-hidden="true" />
                        Add Comment
                      </Button>
                    )}
                  </div>

                  {ownComments.length === 0 ? (
                    <div className="rounded-xl border border-line/70 bg-canvas/30 p-6 text-center sm:p-8">
                      <div className="mx-auto mb-2 grid size-10 place-items-center rounded-xl bg-violet-100/70 text-violet-600">
                        <MessageSquare className="size-5" aria-hidden="true" />
                      </div>
                      <p className="text-sm font-bold text-ink-900">
                        No review comments added for this review yet
                      </p>
                      <p className="mx-auto mt-1 max-w-md text-xs text-ink-500">
                        Add feedback if you identify issues requiring changes in this review cycle.
                      </p>
                      {!readOnly && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={handleAddComment}
                          className="mt-3.5 gap-1.5 border-violet-200 text-xs font-semibold text-violet-700 shadow-2xs hover:bg-violet-50"
                        >
                          <Plus className="size-3.5" aria-hidden="true" />
                          Add First Comment
                        </Button>
                      )}
                    </div>
                  ) : (
                    <ul className="space-y-4">
                      {ownComments.map((comment, index) => (
                        <ReviewCommentCard
                          key={comment.id}
                          comment={comment}
                          index={previousComments.length + index}
                          taskCode={taskCode}
                          currentUserId={effectiveUserId}
                          currentReviewSessionId={effectiveSessionId}
                          readOnly={readOnly}
                          forceValidation={forceValidation}
                          allScreenshots={allScreenshots}
                          onUpdateText={handleUpdateCommentText}
                          onRemoveComment={handleRemoveComment}
                          onAttachScreenshots={handleAttachScreenshots}
                          onRemoveScreenshot={handleRemoveScreenshot}
                          onPreviewScreenshot={handlePreviewScreenshot}
                          onRenameScreenshot={(shot) => setRenamingShot(shot)}
                        />
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ) : (
              /* Single Reviewer Flow */
              <div className="space-y-4 rounded-2xl border border-violet-200/70 bg-surface p-4 shadow-xs sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/60 pb-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-violet-100 text-violet-700">
                        <MessageSquare className="size-4 text-violet-600" aria-hidden="true" />
                      </div>
                      <h3
                        id="review-comments-heading"
                        className="text-xs font-bold tracking-wider text-ink-900 uppercase"
                      >
                        Review Comments
                      </h3>
                      <span className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-800">
                        {comments.length}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-ink-500">
                      Record actionable feedback and attach supporting evidence when useful.
                    </p>
                  </div>

                  {!readOnly && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={handleAddComment}
                      className="gap-1.5 border-violet-200 font-semibold text-violet-700 shadow-2xs hover:bg-violet-50"
                    >
                      <Plus className="size-3.5" aria-hidden="true" />
                      Add Comment
                    </Button>
                  )}
                </div>

                {comments.length === 0 ? (
                  <div className="rounded-xl border border-line/70 bg-canvas/30 p-6 text-center sm:p-8">
                    <div className="mx-auto mb-2.5 grid size-10 place-items-center rounded-xl bg-violet-100/70 text-violet-600">
                      <MessageSquare className="size-5" aria-hidden="true" />
                    </div>
                    <p className="text-sm font-bold text-ink-900">No review comments yet</p>
                    <p className="mx-auto mt-1 max-w-md text-xs text-ink-500">
                      Add feedback when you identify an issue in the submission.
                    </p>
                    {!readOnly && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={handleAddComment}
                        className="mt-4 gap-1.5 border-violet-200 text-xs font-semibold text-violet-700 shadow-2xs hover:bg-violet-50"
                      >
                        <Plus className="size-3.5" aria-hidden="true" />
                        Add First Comment
                      </Button>
                    )}
                  </div>
                ) : (
                  <ul className="space-y-4">
                    {comments.map((comment, index) => (
                      <ReviewCommentCard
                        key={comment.id}
                        comment={comment}
                        index={index}
                        taskCode={taskCode}
                        currentUserId={effectiveUserId}
                        currentReviewSessionId={effectiveSessionId}
                        readOnly={readOnly}
                        forceValidation={forceValidation}
                        allScreenshots={allScreenshots}
                        onUpdateText={handleUpdateCommentText}
                        onRemoveComment={handleRemoveComment}
                        onAttachScreenshots={handleAttachScreenshots}
                        onRemoveScreenshot={handleRemoveScreenshot}
                        onPreviewScreenshot={handlePreviewScreenshot}
                        onRenameScreenshot={(shot) => setRenamingShot(shot)}
                      />
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>

          {/* SECTION 2: REVIEW RANKING (DECISION STAGE) */}
          <section
            aria-labelledby="review-ranking-heading"
            className="space-y-4 rounded-2xl border border-line/80 bg-gradient-to-b from-surface via-surface to-canvas/25 p-5 shadow-xs sm:p-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/60 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-2xs rounded-full border border-violet-200/80 bg-violet-100 px-2 py-0.5 font-bold tracking-wider text-violet-800 uppercase">
                    Assessment Decision
                  </span>
                  <h3
                    id="review-ranking-heading"
                    className="flex items-center gap-1 text-xs font-bold tracking-wider text-ink-900 uppercase"
                  >
                    Review Ranking
                    <span className="text-rose-500" aria-hidden="true">
                      *
                    </span>
                  </h3>
                </div>
                <p className="mt-1 text-xs text-ink-500">
                  Select the overall review result based on the findings above.
                </p>
              </div>

              {draft.rank === null ? (
                <Tag className="border border-amber-200 bg-amber-100 font-semibold text-amber-800">
                  Ranking Required
                </Tag>
              ) : (
                <Tag className="border border-violet-200 bg-violet-100 font-bold text-violet-800">
                  Rank {draft.rank} Selected
                </Tag>
              )}
            </div>

            <div
              className="grid grid-cols-1 gap-3.5 sm:grid-cols-3"
              role="radiogroup"
              aria-labelledby="review-ranking-heading"
            >
              {RANK_CARDS.map((card) => {
                const isSelected = draft.rank === card.rank;
                const toneStyles =
                  card.tone === 'clean'
                    ? isSelected
                      ? 'border-emerald-500 bg-emerald-50/50 ring-2 ring-emerald-500/20 shadow-xs'
                      : 'border-line/90 hover:border-emerald-300 hover:bg-emerald-50/10'
                    : card.tone === 'minor'
                      ? isSelected
                        ? 'border-amber-500 bg-amber-50/50 ring-2 ring-amber-500/20 shadow-xs'
                        : 'border-line/90 hover:border-amber-300 hover:bg-amber-50/10'
                      : isSelected
                        ? 'border-rose-500 bg-rose-50/50 ring-2 ring-rose-500/20 shadow-xs'
                        : 'border-line/90 hover:border-rose-300 hover:bg-rose-50/10';

                const isRank1Disabled =
                  card.rank === 1 && Boolean(isPending || hasUnresolvedIssues);
                const isCardDisabled = readOnly || isRank1Disabled;

                return (
                  <button
                    key={card.rank}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    disabled={isCardDisabled}
                    onClick={() => handleSelectRank(card.rank)}
                    className={cn(
                      'relative flex flex-col rounded-xl border bg-surface p-4 text-left transition-all duration-150',
                      toneStyles,
                      isCardDisabled && 'cursor-not-allowed opacity-60',
                    )}
                  >
                    <div className="mb-1.5 flex w-full items-center justify-between">
                      <span className="text-sm font-bold text-ink-900">{card.title}</span>
                      <span
                        className={cn(
                          'grid size-4 shrink-0 place-items-center rounded-full border transition-colors',
                          isSelected
                            ? card.tone === 'clean'
                              ? 'border-emerald-600 bg-emerald-600 text-white'
                              : card.tone === 'minor'
                                ? 'border-amber-600 bg-amber-600 text-white'
                                : 'border-rose-600 bg-rose-600 text-white'
                            : 'border-ink-300 bg-surface',
                        )}
                      >
                        {isSelected && <span className="size-1.5 rounded-full bg-white" />}
                      </span>
                    </div>
                    <span className="mb-1 text-xs font-semibold text-ink-700">{card.subtitle}</span>
                    <p className="mt-auto text-xs leading-relaxed text-ink-500">
                      {card.description}
                    </p>
                    {isRank1Disabled && (
                      <span className="text-2xs mt-1.5 font-semibold text-rose-600">
                        {isPending ? 'Pending adjudication' : 'Blocked: issues remain unresolved'}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* SECTION 3: VALIDATION STATE BANNERS */}
            {!readOnly && draft.rank === 1 && previousComments.length > 0 && (
              <div
                data-testid="previous-feedback-acknowledgement"
                className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4"
              >
                <div className="flex items-start gap-2.5">
                  <AlertTriangle
                    className="mt-0.5 size-4 shrink-0 text-amber-600"
                    aria-hidden="true"
                  />
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold tracking-wider text-amber-900 uppercase">
                      Previous Reviewer Feedback Exists
                    </h4>
                    <p className="text-xs leading-relaxed text-amber-800">
                      A previous reviewer identified findings during an earlier review session.
                    </p>
                    <p className="text-xs leading-relaxed font-medium text-amber-800">
                      Please confirm that you reviewed these findings before approving this task.
                    </p>
                  </div>
                </div>

                <div className="border-t border-amber-200/80 pt-2">
                  <Checkbox
                    checked={draft.previousFeedbackAcknowledged ?? false}
                    onCheckedChange={(checked) => {
                      onChange({
                        ...draft,
                        previousFeedbackAcknowledged: checked,
                      });
                    }}
                    label={
                      <span className="text-xs font-semibold text-ink-900">
                        I have reviewed the previous reviewer feedback and considered these findings
                        before approving this task.
                      </span>
                    }
                  />
                </div>
              </div>
            )}

            {!readOnly &&
            draft.rank === 1 &&
            previousComments.length > 0 &&
            !draft.previousFeedbackAcknowledged ? (
              <Alert tone="warning" title="Acknowledgement Required">
                <p className="text-xs leading-relaxed">
                  Please acknowledge previous reviewer feedback before approving this task.
                </p>
              </Alert>
            ) : !readOnly && draft.rank === 1 && comments.length > 0 ? (
              <Alert tone="info" title="Rank 1 Assessment">
                <p className="text-xs leading-relaxed">
                  Rank 1 indicates that no unresolved issues remain. Review comments can be used as
                  findings, documentation, or assessment context.
                </p>
              </Alert>
            ) : isDefectRank(draft.rank) && ownComments.length === 0 ? (
              <Alert tone="info" title="Review Comments Required">
                <p className="text-xs leading-relaxed">
                  Rank {draft.rank} requires at least one review comment from the current reviewer
                  describing required changes.
                </p>
              </Alert>
            ) : draft.rank === null ? (
              <Alert tone="warning" title="Ranking Required">
                <p className="text-xs leading-relaxed">
                  Select a review ranking above to proceed with approval or change request.
                </p>
              </Alert>
            ) : isPending ? (
              <Alert tone="warning" title="Adjudication Pending">
                <p className="text-xs leading-relaxed">
                  All developer responses from the previous cycle must be verified or evaluated
                  before making a review decision.
                </p>
              </Alert>
            ) : hasUnresolvedIssues ? (
              <Alert tone="warning" title="Unresolved Findings / Overruled Rejections">
                <p className="text-xs leading-relaxed">
                  One or more developer responses are marked Not Resolved or Rejection Not Accepted.
                  Approval (Rank 1) is blocked. Select Rank 2 or Rank 3 to Request Changes.
                </p>
              </Alert>
            ) : null}
          </section>

          {/* SECTION 4: BOTTOM STICKY ACTION AREA */}
          <div className="sticky bottom-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface/95 p-3 shadow-lg backdrop-blur">
            <div className="flex items-center gap-2">
              {!readOnly && onSaveDraft && (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={isDeciding || isSavingDraft}
                  onClick={() => {
                    if (comments.some((c) => c.text.trim() === '')) {
                      setForceValidation(true);
                    }
                    onSaveDraft();
                  }}
                  className="gap-1.5 text-xs font-semibold"
                >
                  <Save className="size-3.5" aria-hidden="true" />
                  {isSavingDraft ? 'Saving...' : 'Save as Draft'}
                </Button>
              )}

              {currentSaveStatus === 'saving' && (
                <span className="text-xs font-medium text-ink-500 select-none" aria-live="polite">
                  Saving...
                </span>
              )}
              {currentSaveStatus === 'saved' && (
                <span
                  className="flex items-center gap-1 text-xs font-medium text-ink-500 select-none"
                  aria-live="polite"
                >
                  <Check className="size-3 text-success" aria-hidden="true" />
                  Saved
                </span>
              )}
              {currentSaveStatus === 'unsaved' && (
                <span className="text-xs font-medium text-ink-400 select-none" aria-live="polite">
                  Unsaved changes
                </span>
              )}
              {currentSaveStatus === 'error' && (
                <span className="text-xs font-medium text-danger select-none" aria-live="polite">
                  Save failed
                </span>
              )}

              {!readOnly && onHandover && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={isDeciding}
                  onClick={onHandover}
                  className="text-ink-600 text-xs font-semibold hover:text-ink-900"
                >
                  Hand Over
                </Button>
              )}
            </div>

            <div
              className="flex items-center gap-2.5"
              onClickCapture={() => {
                if (comments.some((c) => c.text.trim() === '')) {
                  setForceValidation(true);
                }
              }}
            >
              <Button
                size="sm"
                variant="danger"
                disabled={!canRequestChangesDecision}
                onClick={() => {
                  if (comments.some((c) => c.text.trim() === '')) {
                    setForceValidation(true);
                    return;
                  }
                  if (!canRequestChangesDecision) {
                    return;
                  }
                  onDecide('ChangesRequested');
                }}
                className="gap-1.5 text-xs font-bold shadow-2xs"
              >
                Request Changes
              </Button>

              <Button
                size="sm"
                variant="success"
                disabled={!canApproveDecision}
                onClick={() => {
                  if (comments.some((c) => c.text.trim() === '')) {
                    setForceValidation(true);
                    return;
                  }
                  if (!canApproveDecision) {
                    return;
                  }
                  onDecide('Approved');
                }}
                className="gap-1.5 text-xs font-bold shadow-2xs"
              >
                <CheckCircle2 className="size-3.5" aria-hidden="true" />
                Approve Task
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Full-Screen Lightbox Image Viewer */}
      <ImageLightboxModal
        shot={lightboxShot}
        shots={lightboxShots}
        onClose={() => {
          setLightboxShot(null);
          setLightboxShots([]);
        }}
        onSelectShot={(shot) => setLightboxShot(shot)}
      />

      {/* Rename Screenshot Dialog */}
      <RenameScreenshotDialog
        shot={renamingShot}
        onClose={() => setRenamingShot(null)}
        onSave={handleSaveRename}
      />
    </>
  );
}
