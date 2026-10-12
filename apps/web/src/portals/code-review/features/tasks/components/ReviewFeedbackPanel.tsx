import { useState, useCallback } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  MessageSquare,
  MessageSquareWarning,
  Send,
  User,
  XCircle,
} from 'lucide-react';
import type {
  IssueResponseRecord,
  Review,
  ReviewHistoryEntry,
  ReviewScreenshot,
} from '@sdp/contracts';
import { cn } from '@/components/ui';
import { RankBadge, Tag } from '@/portals/code-review/components/badges.tsx';
import { Alert } from '@/components/ui/Alert.tsx';
import { Button } from '@/components/ui/Button.tsx';
import { Card, CardBody, CardHeader } from '@/components/ui/Card.tsx';
import { Field } from '@/components/ui/Field.tsx';
import { Textarea } from '@/components/ui/controls.tsx';
import { ScreenshotPreviewCard } from '@/portals/code-review/components/ScreenshotPreviewCard.tsx';
import { ImageLightboxModal } from '@/portals/code-review/components/ImageLightboxModal.tsx';
import { interpolate } from '@/lib/formatters.ts';
import tasks from '@/content/tasks.json';
import {
  issuesFromReview,
  resubmitReadiness,
  type Issue,
  type ResponseLike,
} from '../domain/responseRules.ts';
import { useFocusOnMount } from '@/hooks/useFocusOnMount.ts';

function IssueRow({
  issue,
  response,
  priorResponse,
  onRespond,
  onDelete,
  onDraftChange,
  onPreviewScreenshot,
  disabled,
}: {
  issue: Issue;
  response: IssueResponseRecord | undefined;
  priorResponse?: IssueResponseRecord | undefined;
  onRespond: (input: ResponseLike) => void;
  onDelete?: ((responseId: string) => void) | undefined;
  onDraftChange?: ((issueKey: string, isDrafting: boolean) => void) | undefined;
  onPreviewScreenshot: (
    shot: ReviewScreenshot,
    issueScreenshots?: readonly ReviewScreenshot[],
  ) => void;
  disabled: boolean;
}) {
  const focusOnMount = useFocusOnMount<HTMLTextAreaElement>();
  const issueKey = issue.commentId
    ? `c-${issue.commentId}`
    : issue.screenshotId
      ? `s-${issue.screenshotId}`
      : 'overall';
  const [isDrafting, setIsDrafting] = useState(false);
  const [draftReason, setDraftReason] = useState(response?.rejectionReason ?? '');
  const [touched, setTouched] = useState(false);

  // If an active response was passed but it has a completed reviewer verdict ('Overruled' or 'Accepted'),
  // it is part of the prior turn history, not the current rework cycle's pending response.
  const priorRecord =
    priorResponse ??
    (response && (response.verdict === 'Overruled' || response.verdict === 'Accepted')
      ? response
      : undefined);

  // Active response is strictly the record for this rework cycle that has not been adjudicated yet
  const currentResponse =
    response && response.verdict !== 'Overruled' && response.verdict !== 'Accepted'
      ? response
      : undefined;

  const hasPreviousTurn =
    issue.isFollowUp === true ||
    Boolean(issue.previousResponseKind) ||
    priorRecord?.verdict === 'Overruled' ||
    priorRecord?.verdict === 'Accepted';

  const previousAction =
    issue.previousResponseKind ??
    (priorRecord && (priorRecord.verdict === 'Overruled' || priorRecord.verdict === 'Accepted')
      ? priorRecord.kind
      : null);

  const previousRejectionReason =
    issue.previousRejectionReason ??
    (priorRecord && (priorRecord.verdict === 'Overruled' || priorRecord.verdict === 'Accepted')
      ? priorRecord.rejectionReason
      : null);

  const reviewerVerdict = issue.isFollowUp
    ? issue.previousResponseKind === 'Resolved'
      ? 'Not Resolved'
      : 'Rejection Not Accepted'
    : priorRecord?.verdict === 'Overruled'
      ? priorRecord.kind === 'Resolved'
        ? 'Not Resolved'
        : 'Rejection Not Accepted'
      : priorRecord?.verdict === 'Accepted'
        ? priorRecord.kind === 'Resolved'
          ? 'Resolution Verified'
          : 'Rejection Accepted'
        : null;

  const reviewerExplanation =
    issue.reviewerExplanation ??
    (priorRecord?.verdict === 'Overruled' || priorRecord?.verdict === 'Accepted'
      ? priorRecord.reviewerComment
      : null);

  // Follow the server's reason while not drafting (adjusted during render; `undefined` syncs on mount).
  const reasonSyncKey = isDrafting ? null : (currentResponse?.rejectionReason ?? '');
  const [syncedReasonKey, setSyncedReasonKey] = useState<string | null | undefined>(undefined);
  if (reasonSyncKey !== syncedReasonKey) {
    setSyncedReasonKey(reasonSyncKey);
    if (reasonSyncKey !== null) setDraftReason(reasonSyncKey);
  }

  const handleStartDraft = () => {
    setDraftReason(
      currentResponse?.kind === 'Rejected' ? (currentResponse.rejectionReason ?? '') : '',
    );
    setTouched(false);
    setIsDrafting(true);
    onDraftChange?.(issueKey, true);
  };

  const handleCancelDraft = () => {
    setIsDrafting(false);
    setTouched(false);
    setDraftReason(currentResponse?.rejectionReason ?? '');
    onDraftChange?.(issueKey, false);
  };

  const handleResolveClick = () => {
    if (isDrafting) {
      handleCancelDraft();
      onRespond({
        commentId: issue.commentId,
        screenshotId: issue.screenshotId,
        kind: 'Resolved',
      });
      return;
    }

    if (currentResponse?.kind === 'Resolved') {
      // Clicking Resolve again deselects and returns to Pending
      if (onDelete && currentResponse.id) {
        onDelete(currentResponse.id);
      }
      return;
    }

    // Save as Resolved (from Pending or from Saved Rejected)
    onRespond({
      commentId: issue.commentId,
      screenshotId: issue.screenshotId,
      kind: 'Resolved',
    });
  };

  const handleRejectClick = () => {
    if (isDrafting) {
      handleCancelDraft();
      return;
    }

    handleStartDraft();
  };

  const handleSaveRejection = () => {
    setTouched(true);
    if (draftReason.trim() === '') return;

    setIsDrafting(false);
    onDraftChange?.(issueKey, false);
    onRespond({
      commentId: issue.commentId,
      screenshotId: issue.screenshotId,
      kind: 'Rejected',
      rejectionReason: draftReason.trim(),
    });
  };

  return (
    <li className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs transition-all hover:border-slate-300">
      {/* Header: Issue Label and Single Unambiguous Status Badge */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/75 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-semibold text-slate-900">{issue.label}</span>
          {issue.originCycle ? (
            <Tag className="text-2xs border-slate-200 bg-white px-1.5 py-0 font-medium text-slate-600">
              Cycle {issue.originCycle}
            </Tag>
          ) : null}
        </div>
        {isDrafting ? (
          <Tag className="border-amber-300 bg-amber-50 text-xs font-semibold text-amber-800">
            Drafting Rejection
          </Tag>
        ) : currentResponse === undefined ? (
          <Tag className="border-amber-300 bg-amber-50 text-xs font-semibold text-amber-800">
            Action Required (Pending Response)
          </Tag>
        ) : (
          <Tag
            className={cn(
              'flex items-center gap-1 text-xs font-bold',
              currentResponse.kind === 'Resolved'
                ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                : 'border-slate-300 bg-slate-100 text-slate-800',
            )}
          >
            {currentResponse.kind === 'Resolved' ? (
              <CheckCircle2 className="size-3 text-emerald-600" aria-hidden="true" />
            ) : (
              <XCircle className="size-3 text-slate-600" aria-hidden="true" />
            )}
            {currentResponse.kind === 'Resolved'
              ? tasks.response.resolved
              : tasks.response.rejected}
          </Tag>
        )}
      </div>

      {/* GitHub Discussion-style Flattened Timeline Thread */}
      <div className="p-4 sm:p-5">
        <div className="relative space-y-6 pl-8 before:absolute before:top-2 before:bottom-3 before:left-[11px] before:w-0.5 before:bg-slate-200">
          {/* Node 1: Reviewer Finding (Shades of Blue) */}
          <div className="relative">
            {/* Timeline Avatar Node */}
            <div
              className="absolute top-0.5 -left-8 flex size-6 items-center justify-center rounded-full bg-blue-600 text-white shadow-2xs ring-4 ring-white"
              aria-hidden="true"
            >
              <MessageSquare className="size-3.5" />
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold tracking-wider text-blue-950 uppercase">
                    Reviewer Finding
                  </span>
                  {issue.originCycle ? (
                    <Tag className="text-2xs border-blue-200 bg-blue-50 px-1.5 py-0 font-medium text-blue-700">
                      Cycle {issue.originCycle}
                    </Tag>
                  ) : null}
                </div>
                <Tag className="text-2xs border-blue-200 bg-blue-50 font-semibold text-blue-700">
                  Reviewer
                </Tag>
              </div>

              <p className="text-sm leading-relaxed whitespace-pre-wrap text-slate-800">
                {issue.detail}
              </p>

              {/* Attached Screenshots */}
              {issue.screenshots && issue.screenshots.length > 0 && (
                <div className="space-y-1.5 pt-2">
                  <p className="text-2xs font-bold tracking-wider text-slate-500 uppercase">
                    Attached Evidence ({issue.screenshots.length})
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {issue.screenshots.map((shot) => (
                      <ScreenshotPreviewCard
                        key={shot.id}
                        shot={shot}
                        readOnly={true}
                        onPreview={(s) => onPreviewScreenshot(s, issue.screenshots)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Node 2: Developer Previous Response (Shades of Green / Slate - Muted Activity Item) */}
          {hasPreviousTurn && (
            <div className="relative">
              {/* Timeline Avatar Node */}
              <div
                className={cn(
                  'absolute top-0.5 -left-8 flex size-6 items-center justify-center rounded-full shadow-2xs ring-4 ring-white',
                  previousAction === 'Resolved'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-slate-100 text-slate-700',
                )}
                aria-hidden="true"
              >
                {previousAction === 'Resolved' ? (
                  <CheckCircle2 className="size-3.5" />
                ) : (
                  <XCircle className="size-3.5" />
                )}
              </div>

              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold tracking-wider text-slate-900 uppercase">
                    Developer Previous Response
                  </span>
                  <div className="flex items-center gap-1.5">
                    {previousAction ? (
                      <Tag className="text-2xs border-slate-200 bg-slate-100 font-semibold text-slate-700">
                        Prior Turn: {previousAction}
                      </Tag>
                    ) : null}
                    {previousAction ? (
                      <Tag
                        className={cn(
                          'text-2xs font-bold',
                          previousAction === 'Resolved'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-amber-200 bg-amber-50 text-amber-800',
                        )}
                      >
                        Developer: {previousAction}
                      </Tag>
                    ) : null}
                  </div>
                </div>

                {previousAction === 'Resolved' ? (
                  <p className="text-xs text-slate-600">
                    Developer marked this finding as{' '}
                    <strong className="text-emerald-700">Resolved</strong> in the prior review turn.
                  </p>
                ) : null}

                {previousRejectionReason ? (
                  <div className="space-y-1 rounded-lg border-l-2 border-slate-300 bg-slate-50/80 px-3.5 py-2.5 text-xs text-slate-700">
                    <span className="text-2xs block font-bold tracking-wider text-slate-600 uppercase">
                      Previous Rejection Reason:
                    </span>
                    <p className="leading-relaxed whitespace-pre-wrap text-slate-800 italic">
                      "{previousRejectionReason}"
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {/* Node 3: Reviewer Follow-up Decision (Shades of Blue - Prominent Callout) */}
          {hasPreviousTurn && (Boolean(reviewerExplanation) || Boolean(reviewerVerdict)) && (
            <div className="relative">
              {/* Timeline Avatar Node */}
              <div
                className="absolute top-0.5 -left-8 flex size-6 items-center justify-center rounded-full bg-blue-600 text-white shadow-2xs ring-4 ring-white"
                aria-hidden="true"
              >
                <AlertCircle className="size-3.5" />
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold tracking-wider text-blue-950 uppercase">
                    Reviewer Follow-up
                  </span>
                  {reviewerVerdict ? (
                    <Tag className="text-2xs border-blue-200 bg-blue-100 font-bold text-blue-800">
                      Reviewer: {reviewerVerdict}
                    </Tag>
                  ) : null}
                </div>

                {/* Reviewer Verdict Callout Box */}
                <div className="space-y-2 rounded-r-lg border-l-3 border-blue-500 bg-blue-50/60 p-3.5 text-xs">
                  <div className="flex items-center gap-1.5 font-bold">
                    <span className="text-slate-700">Verdict:</span>
                    <span className="font-extrabold text-blue-700">{reviewerVerdict}</span>
                  </div>

                  {reviewerExplanation ? (
                    <div className="space-y-1 pt-1">
                      <span className="text-2xs block font-bold tracking-wider text-blue-900 uppercase">
                        Reviewer Follow-up Explanation:
                      </span>
                      <p className="text-sm leading-relaxed font-medium whitespace-pre-wrap text-slate-900">
                        {reviewerExplanation}
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          )}

          {/* Node 4: Developer Current Response ("Your Next Response" / Action Required) */}
          <div className="relative">
            {/* Timeline Avatar Node */}
            <div
              className={cn(
                'absolute top-1 -left-8 flex size-6 items-center justify-center rounded-full shadow-2xs ring-4 ring-white',
                currentResponse?.kind === 'Resolved' && !isDrafting
                  ? 'bg-emerald-600 text-white'
                  : isDrafting || currentResponse?.kind === 'Rejected'
                    ? 'bg-amber-600 text-white'
                    : 'bg-slate-800 text-white',
              )}
              aria-hidden="true"
            >
              {currentResponse?.kind === 'Resolved' && !isDrafting ? (
                <CheckCircle2 className="size-3.5" />
              ) : isDrafting ? (
                <User className="size-3.5" />
              ) : currentResponse?.kind === 'Rejected' ? (
                <XCircle className="size-3.5" />
              ) : (
                <Send className="size-3.5" />
              )}
            </div>

            {/* Action Area Box */}
            <div className="space-y-3.5 rounded-xl border border-slate-200 bg-slate-50/60 p-4 shadow-2xs">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold tracking-wider text-slate-900 uppercase">
                    Your Next Response
                  </span>
                  <Tag className="text-2xs border-slate-300 bg-slate-200 font-semibold text-slate-800">
                    Required Action
                  </Tag>
                </div>

                {currentResponse?.kind === 'Resolved' && !isDrafting ? (
                  <span className="text-2xs flex items-center gap-1 font-semibold text-emerald-700">
                    <CheckCircle2 className="size-3" /> Marked as resolved for this rework cycle
                  </span>
                ) : currentResponse?.kind === 'Rejected' && !isDrafting ? (
                  <span className="text-2xs flex items-center gap-1 font-semibold text-slate-700">
                    <XCircle className="size-3" /> Marked as rejected for this rework cycle
                  </span>
                ) : (
                  <span className="text-2xs font-semibold text-amber-800">
                    Response required before resubmitting
                  </span>
                )}
              </div>

              <p className="text-xs text-slate-600">
                Choose your response to this finding for the current rework cycle:
              </p>

              {/* Action Buttons: Resolve / Reject (strictly under Your Next Response) */}
              <div className="flex flex-wrap gap-2 pt-0.5">
                <Button
                  variant={
                    !isDrafting && currentResponse?.kind === 'Resolved' ? 'success' : 'secondary'
                  }
                  size="sm"
                  disabled={disabled}
                  onClick={handleResolveClick}
                  className="gap-1.5 text-xs font-semibold"
                >
                  <CheckCircle2 className="size-3.5" aria-hidden="true" />
                  {tasks.response.resolve}
                </Button>

                <Button
                  variant={
                    isDrafting || currentResponse?.kind === 'Rejected' ? 'danger' : 'secondary'
                  }
                  size="sm"
                  disabled={disabled}
                  onClick={handleRejectClick}
                  className="gap-1.5 text-xs font-semibold"
                >
                  <XCircle className="size-3.5" aria-hidden="true" />
                  {tasks.response.reject}
                </Button>
              </div>

              {/* Drafting Mode: Inline Textarea + Save / Cancel */}
              {isDrafting ? (
                <div className="space-y-2.5 rounded-lg border border-amber-300 bg-amber-50/60 p-3.5">
                  <Field
                    label={tasks.response.reasonLabel}
                    required
                    error={
                      touched && draftReason.trim() === ''
                        ? tasks.response.reasonRequired
                        : undefined
                    }
                  >
                    <Textarea
                      value={draftReason}
                      onChange={(event) => {
                        setDraftReason(event.target.value);
                      }}
                      placeholder={tasks.response.reasonPlaceholder}
                      disabled={disabled}
                      rows={2}
                      className="text-sm"
                      ref={focusOnMount}
                    />
                  </Field>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      className="text-xs font-semibold"
                      disabled={disabled}
                      onClick={handleSaveRejection}
                    >
                      {tasks.response.saveRejection}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="text-xs font-semibold"
                      disabled={disabled}
                      onClick={handleCancelDraft}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}

              {/* Saved Rejected Mode: Developer summary with Change/Remove */}
              {!isDrafting &&
              currentResponse?.kind === 'Rejected' &&
              currentResponse.rejectionReason ? (
                <div className="space-y-1.5 rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-2xs">
                  <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-1.5">
                    <span className="text-2xs font-bold tracking-wider text-slate-700 uppercase">
                      Developer Response
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={handleStartDraft}
                        className="text-2xs cursor-pointer font-semibold text-blue-600 hover:text-blue-800 hover:underline disabled:opacity-50"
                      >
                        Change response
                      </button>
                      <span className="text-slate-300">·</span>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          if (onDelete && currentResponse.id) {
                            onDelete(currentResponse.id);
                          }
                        }}
                        className="text-2xs cursor-pointer font-semibold text-rose-600 hover:text-rose-700 hover:underline disabled:opacity-50"
                      >
                        Remove response
                      </button>
                    </div>
                  </div>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap text-slate-800">
                    {currentResponse.rejectionReason}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}

export function ReviewFeedbackPanel({
  review,
  allReviews,
  responses,
  activeRound: explicitActiveRound,
  activeCycle: explicitActiveCycle,
  onRespond,
  onDelete,
  onResubmit,
  isResubmitting,
  disabled = false,
}: {
  review: Review | null;
  allReviews?: readonly ReviewHistoryEntry[] | null;
  responses: readonly IssueResponseRecord[];
  activeRound?: number;
  /** Legacy alias for activeRound */
  activeCycle?: number;
  onRespond: (input: ResponseLike) => void;
  onDelete?: ((responseId: string) => void) | undefined;
  onResubmit: () => void;
  isResubmitting: boolean;
  disabled?: boolean;
}) {
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('all');
  const [previewScreenshot, setPreviewScreenshot] = useState<ReviewScreenshot | null>(null);
  const [previewScreenshots, setPreviewScreenshots] = useState<readonly ReviewScreenshot[]>([]);
  const [draftingKeys, setDraftingKeys] = useState<Record<string, boolean>>({});

  const handleDraftChange = useCallback((issueKey: string, isDrafting: boolean) => {
    setDraftingKeys((prev) => {
      if (Boolean(prev[issueKey]) === isDrafting) return prev;
      const next = { ...prev };
      if (isDrafting) {
        next[issueKey] = true;
      } else {
        delete next[issueKey];
      }
      return next;
    });
  }, []);

  const issues = issuesFromReview(review, allReviews, responses);
  if (issues.length === 0 || review === null) return null;

  const effectiveActiveRound = explicitActiveRound ?? explicitActiveCycle ?? review.reviewRound;

  // Active responses are strictly the developer's responses for the current rework round that are pending/unadjudicated
  const activeResponses = responses.filter(
    (r) =>
      r.verdict !== 'Overruled' &&
      r.verdict !== 'Accepted' &&
      (effectiveActiveRound != null ? r.reviewRound === effectiveActiveRound : true),
  );

  const activeSessionId = review.currentReviewSessionId;
  const previousReviewerComments = activeSessionId
    ? (review.comments ?? []).filter((c) => c.reviewSessionId !== activeSessionId)
    : (review.comments ?? []).filter((c) =>
        Boolean(c.reviewerId && review.reviewerId && c.reviewerId !== review.reviewerId),
      );

  const readiness = resubmitReadiness(issues, activeResponses);
  const hasUnsavedDrafts = Object.values(draftingKeys).some(Boolean);
  const canResubmit = readiness.canResubmit && !hasUnsavedDrafts;

  const readinessMessage = hasUnsavedDrafts
    ? 'Save or cancel your rejection draft before resubmitting.'
    : readiness.unjustified > 0
      ? tasks.response.blockedByReason
      : readiness.unanswered > 0
        ? interpolate(
            readiness.unanswered === 1
              ? tasks.response.blockedByUnanswered
              : tasks.response.blockedByUnansweredPlural,
            { count: readiness.unanswered },
          )
        : 'All review findings have been addressed. Ready to resubmit.';

  const totalCount = issues.length;
  const answeredIssues = issues.filter((issue) => {
    const res = activeResponses.find(
      (r) =>
        (r.commentId != null && r.commentId === issue.commentId) ||
        (issue.screenshotId != null && r.screenshotId === issue.screenshotId),
    );
    if (!res) return false;
    if (res.kind === 'Rejected') return (res.rejectionReason ?? '').trim() !== '';
    return true;
  });
  const resolvedCount = answeredIssues.length;
  const openCount = totalCount - resolvedCount;

  const filteredIssues = issues.filter((issue) => {
    const isAnswered = answeredIssues.includes(issue);
    if (filter === 'open') return !isAnswered;
    if (filter === 'resolved') return isAnswered;
    return true;
  });

  return (
    <>
      <Card
        collapsible
        defaultExpanded
        resetKey={review.taskId}
        summary={`${resolvedCount}/${totalCount} addressed`}
        className="border-amber-200/80 bg-gradient-to-b from-amber-50/20 via-surface to-surface shadow-card"
      >
        <CardHeader
          title={tasks.response.title}
          description={interpolate(tasks.response.subtitle, {
            reviewer: review.reviewerName ?? 'Reviewer',
            round: review.reviewRound,
            cycle: review.reviewRound,
          })}
          icon={<MessageSquareWarning className="size-4 text-amber-600" />}
          action={review.rank === null ? null : <RankBadge rank={review.rank} />}
        />

        <CardBody className="space-y-4 pt-3 pb-5">
          {/* Issue Status & Filter Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-canvas/60 p-2.5">
            <div className="flex items-center gap-2 px-1 text-xs font-semibold text-ink-700">
              <span className="font-bold text-ink-900">
                {totalCount} {totalCount === 1 ? 'Review Comment' : 'Review Comments'}
              </span>
              <span className="text-ink-300">·</span>
              <span className={openCount > 0 ? 'font-bold text-amber-700' : 'text-ink-500'}>
                {openCount} Open
              </span>
              <span className="text-ink-300">·</span>
              <span className={resolvedCount > 0 ? 'font-bold text-emerald-700' : 'text-ink-500'}>
                {resolvedCount} Addressed
              </span>
            </div>

            <div className="flex items-center gap-1">
              {(['all', 'open', 'resolved'] as const).map((key) => {
                const label =
                  key === 'all'
                    ? `All (${totalCount})`
                    : key === 'open'
                      ? `Open (${openCount})`
                      : `Addressed (${resolvedCount})`;
                const isSelected = filter === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilter(key)}
                    className={cn(
                      'rounded-lg px-2.5 py-1 text-xs font-semibold transition-all',
                      isSelected
                        ? 'border border-line bg-surface font-bold text-ink-900 shadow-2xs'
                        : 'hover:text-ink-800 text-ink-500 hover:bg-surface/50',
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {filteredIssues.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line bg-canvas/30 p-8 text-center">
              <CheckCircle2 className="mx-auto mb-2 size-6 text-emerald-500" />
              <p className="text-xs font-semibold text-ink-700">
                {filter === 'open'
                  ? 'All review comments have been addressed!'
                  : 'No review comments in this view.'}
              </p>
            </div>
          ) : (
            <ul className="space-y-3 pb-3">
              {filteredIssues.map((issue) => {
                const currentResponse = activeResponses.find(
                  (r) =>
                    (r.commentId != null && r.commentId === issue.commentId) ||
                    (issue.screenshotId != null && r.screenshotId === issue.screenshotId),
                );

                const priorResponse = responses
                  .filter(
                    (r) =>
                      ((r.commentId != null && r.commentId === issue.commentId) ||
                        (issue.screenshotId != null && r.screenshotId === issue.screenshotId)) &&
                      (r.verdict === 'Overruled' ||
                        r.verdict === 'Accepted' ||
                        (review.reviewRound != null && r.reviewRound < review.reviewRound)),
                  )
                  .sort((a, b) => b.reviewRound - a.reviewRound)[0];

                return (
                  <IssueRow
                    key={issue.commentId}
                    issue={issue}
                    response={currentResponse}
                    priorResponse={priorResponse}
                    onRespond={onRespond}
                    onDelete={onDelete}
                    onDraftChange={handleDraftChange}
                    onPreviewScreenshot={(shot, shots) => {
                      setPreviewScreenshot(shot);
                      setPreviewScreenshots(shots ?? [shot]);
                    }}
                    disabled={disabled || isResubmitting}
                  />
                );
              })}
            </ul>
          )}

          {/* Handover Context: Previous Reviewer Comments (Informational / Read-Only) */}
          {previousReviewerComments.length > 0 && (
            <div className="space-y-3 rounded-xl border border-line/80 bg-canvas/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold tracking-wider text-ink-700 uppercase">
                    Handover Context: Previous Reviewer Comments ({previousReviewerComments.length})
                  </span>
                  <Tag className="text-2xs bg-slate-100 font-semibold text-slate-600">
                    Informational Only
                  </Tag>
                </div>
                <span className="text-2xs text-ink-500">No action required</span>
              </div>
              <ul className="space-y-2.5">
                {previousReviewerComments.map((c, i) => (
                  <li
                    key={c.id}
                    className="space-y-2 rounded-lg border border-line bg-surface p-3 text-xs"
                  >
                    <div className="text-2xs flex items-center justify-between text-ink-500">
                      <span className="font-semibold text-ink-700">Previous Comment #{i + 1}</span>
                      {c.reviewerName && <span>by {c.reviewerName}</span>}
                    </div>
                    <p className="text-ink-800 whitespace-pre-wrap">{c.text}</p>
                    {c.screenshots && c.screenshots.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {c.screenshots.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => {
                              setPreviewScreenshot(s);
                              setPreviewScreenshots(c.screenshots ?? [s]);
                            }}
                            className="text-2xs text-ink-600 flex items-center gap-1 rounded border border-line bg-canvas px-2 py-1 hover:text-ink-900"
                          >
                            <span>📷 {s.fileName}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Resubmit Readiness Banner */}
          {!canResubmit && (
            <Alert tone="warning" title="Resubmission Blocked">
              <p className="text-xs leading-relaxed">
                {hasUnsavedDrafts
                  ? 'You have an unsaved rejection draft. Save or cancel your rejection draft before resubmitting.'
                  : readiness.unanswered > 0 && readiness.unjustified > 0
                    ? `Please address ${readiness.unanswered} remaining comment(s) and provide rejection reason(s) for ${readiness.unjustified} rejected comment(s).`
                    : readiness.unanswered > 0
                      ? `Please respond (Resolve or Reject) to ${readiness.unanswered} remaining review comment(s) before resubmitting.`
                      : `Please provide a non-empty rejection reason for ${readiness.unjustified} rejected review comment(s).`}
              </p>
            </Alert>
          )}

          {/* Sticky Bottom Action Dock */}
          <div
            className="sticky bottom-3 z-20 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3.5 shadow-lg"
            data-testid="developer-resubmit-dock"
          >
            <div className="flex min-w-0 items-center gap-2" role="status" aria-live="polite">
              {canResubmit ? (
                <>
                  <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />
                  <span className="text-ink-800 text-xs font-semibold">
                    All review findings have been addressed. Ready to resubmit.
                  </span>
                </>
              ) : (
                <>
                  <AlertCircle className="size-4 shrink-0 text-amber-600" aria-hidden="true" />
                  <span className="text-ink-800 text-xs font-semibold">{readinessMessage}</span>
                </>
              )}
            </div>

            <Button
              onClick={onResubmit}
              disabled={!canResubmit || isResubmitting || disabled}
              variant="success"
              size="sm"
              className="shrink-0 gap-1.5 text-xs font-bold shadow-2xs"
            >
              <Send className="size-3.5" aria-hidden="true" />
              {isResubmitting ? tasks.detail.submitting : tasks.response.resubmit}
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Preview Dialog */}
      <ImageLightboxModal
        shot={previewScreenshot}
        shots={previewScreenshots}
        onClose={() => {
          setPreviewScreenshot(null);
          setPreviewScreenshots([]);
        }}
        onSelectShot={(shot) => setPreviewScreenshot(shot)}
      />
    </>
  );
}
