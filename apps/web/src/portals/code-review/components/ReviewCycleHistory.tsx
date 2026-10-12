import { useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  Clock,
  FileText,
  History,
  MessageSquare,
  MessageSquareWarning,
  User,
} from 'lucide-react';
import type { ReviewComment, ReviewHistoryEntry, ReviewScreenshot } from '@sdp/contracts';
import { cn } from '@/components/ui';
import { RankBadge, StatusBadge, Tag } from '@/portals/code-review/components/badges.tsx';
import { ScreenshotPreviewCard } from '@/portals/code-review/components/ScreenshotPreviewCard.tsx';
import { ImageLightboxModal } from '@/portals/code-review/components/ImageLightboxModal.tsx';
import { formatDateTime, textOr } from '@/lib/formatters.ts';
import reviews from '@/content/reviews.json';

/**
 * Determines whether a comment has substantive content (text or attached evidence).
 * Guards against empty strings, whitespace-only strings, null, and undefined text.
 */
function isValidComment(comment: ReviewComment | null | undefined): boolean {
  if (!comment) return false;
  const hasText = Boolean(comment.text && comment.text.trim() !== '');
  const hasScreenshots = Array.isArray(comment.screenshots) && comment.screenshots.length > 0;
  return hasText || hasScreenshots;
}

/**
 * Dedicated empty state rendered within a cycle card when no review comments,
 * developer responses, or screenshots exist for that cycle.
 */
function CycleEmptyState({ isApproved }: { isApproved: boolean }) {
  return (
    <div
      data-testid="cycle-empty-state"
      className="space-y-2 rounded-xl border border-dashed border-line/80 bg-surface/60 p-6 text-center"
    >
      <div
        className={cn(
          'mx-auto flex size-10 items-center justify-center rounded-full border shadow-2xs',
          isApproved
            ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
            : 'border-line bg-surface text-ink-400',
        )}
      >
        {isApproved ? (
          <CheckCircle2 className="size-5" aria-hidden="true" />
        ) : (
          <MessageSquare className="size-5" aria-hidden="true" />
        )}
      </div>
      <div className="space-y-0.5">
        <p className="text-sm font-semibold text-ink-900">{reviews.form.emptyCommentsTitle}</p>
        <p className="mx-auto max-w-sm text-xs text-ink-500">
          {isApproved
            ? reviews.form.emptyCommentsApprovedHint
            : reviews.form.emptyCommentsChangesRequestedHint}
        </p>
      </div>
    </div>
  );
}

export interface ReviewCycleHistoryProps {
  entries: readonly ReviewHistoryEntry[];
  countedCycle?: number | undefined;
  defaultAllCollapsed?: boolean | undefined;
  className?: string;
}

/**
 * Modernized Review Cycle History component.
 * Displays completed and active review cycles in descending order (newest first).
 *
 * Each cycle is presented as an accessible, collapsible card with clear status accents,
 * review comments, attached evidence screenshots with lightbox zoom, and developer responses.
 */
export function ReviewCycleHistory({
  entries,
  countedCycle,
  defaultAllCollapsed = false,
  className,
}: ReviewCycleHistoryProps) {
  // Sort descending: highest round number first, then latest decidedAt
  const ordered = [...entries].sort((a, b) => {
    if (b.reviewRound !== a.reviewRound) {
      return b.reviewRound - a.reviewRound;
    }
    return (b.decidedAt ?? '').localeCompare(a.decidedAt ?? '');
  });

  const [expandedCycles, setExpandedCycles] = useState<Record<string, boolean>>(() => {
    if (defaultAllCollapsed || ordered.length === 0) {
      return {};
    }
    // Expand the most recent cycle by default
    return { [ordered[0]?.id ?? '']: true };
  });

  const [lightboxScreenshot, setLightboxScreenshot] = useState<ReviewScreenshot | null>(null);
  const [lightboxShots, setLightboxShots] = useState<readonly ReviewScreenshot[]>([]);

  // Refetched active cycles can arrive after mount; show the newest by default.
  const isCycleExpanded = (id: string) =>
    expandedCycles[id] ?? (!defaultAllCollapsed && id === ordered[0]?.id);

  // Toggle single cycle expanded state
  const toggleCycle = (id: string) => {
    setExpandedCycles((prev) => ({
      ...prev,
      [id]: !isCycleExpanded(id),
    }));
  };

  if (ordered.length === 0) {
    return (
      <div
        className={cn(
          'space-y-2 rounded-xl border border-dashed border-line bg-surface/40 p-8 text-center',
          className,
        )}
      >
        <div className="mx-auto flex size-10 items-center justify-center rounded-full border border-line bg-surface shadow-2xs">
          <History className="size-5 text-ink-400" aria-hidden="true" />
        </div>
        <p className="text-ink-800 text-sm font-semibold">No completed reviews yet</p>
        <p className="mx-auto max-w-sm text-xs text-ink-500">
          Historical review cycles, comments, and decision outcomes will appear here once finalized.
        </p>
      </div>
    );
  }

  // Map all comments across all history entries for multi-cycle lineage resolution
  const allCommentsMap = new Map<string, ReviewComment>();
  ordered.forEach((e) => {
    (e.comments ?? []).forEach((c) => {
      if (!allCommentsMap.has(c.id)) {
        allCommentsMap.set(c.id, c);
      }
    });
  });

  return (
    <div className={cn('space-y-4', className)}>
      {/* Overview Badges Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-1">
        <div className="flex flex-wrap items-center gap-2">
          <Tag className="bg-ink-100 text-ink-800 text-xs font-bold">
            Completed Reviews: {ordered.filter((entry) => entry.decision !== null).length}
          </Tag>
          {countedCycle !== undefined && (
            <Tag className="bg-violet-100 text-xs font-medium text-violet-800">
              Cycle: {countedCycle}
            </Tag>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const anyOpen = ordered.some((e) => isCycleExpanded(e.id));
              const next: Record<string, boolean> = {};
              ordered.forEach((e) => {
                next[e.id] = !anyOpen;
              });
              setExpandedCycles(next);
            }}
            className="text-xs font-semibold text-violet-700 transition-colors hover:text-violet-900"
          >
            {ordered.some((e) => isCycleExpanded(e.id)) ? 'Collapse All' : 'Expand All'}
          </button>
        </div>
      </div>

      {/* Vertical Cycle Cards Timeline */}
      <div className="relative space-y-4 pl-6 before:absolute before:top-3 before:bottom-3 before:left-2.5 before:w-0.5 before:bg-line sm:pl-7">
        {ordered.map((entry) => {
          const isExpanded = isCycleExpanded(entry.id);
          const isApproved = entry.decision === 'Approved';
          const isPending = entry.decision === null;
          const validComments = (entry.comments ?? []).filter(isValidComment);
          const authoredCommentIds = new Set(validComments.map((c) => c.id));

          // Find any carried forward comments that have responses in this cycle
          const followUpComments: ReviewComment[] = [];
          (entry.responses ?? []).forEach((r) => {
            if (r.commentId && !authoredCommentIds.has(r.commentId)) {
              authoredCommentIds.add(r.commentId);
              const priorComment = allCommentsMap.get(r.commentId);
              if (priorComment) {
                followUpComments.push(priorComment);
              }
            }
          });

          const allDisplayComments = [...validComments, ...followUpComments];
          const hasComments = allDisplayComments.length > 0;

          // Check legacy fixture fallback fields for substantive content
          const hasFeedbackSummary = Boolean(
            entry.feedbackSummary && entry.feedbackSummary.trim() !== '',
          );
          const hasIncorrectCode = Boolean(
            entry.findings?.incorrectCode && entry.findings.incorrectCode.trim() !== '',
          );
          const hasIncompleteImplementation = Boolean(
            entry.findings?.incompleteImplementation &&
            entry.findings.incompleteImplementation.trim() !== '',
          );
          const hasSourceFormatting = Boolean(
            entry.findings?.sourceFormatting && entry.findings.sourceFormatting.trim() !== '',
          );
          const hasLegacyFindings =
            hasIncorrectCode || hasIncompleteImplementation || hasSourceFormatting;
          const legacyScreenshots = (entry.screenshots ?? []).filter(Boolean);
          const hasLegacyScreenshots = legacyScreenshots.length > 0;
          const hasLegacyContent = hasFeedbackSummary || hasLegacyFindings || hasLegacyScreenshots;

          return (
            <div key={entry.id} className="group relative">
              {/* Timeline Node Indicator Icon */}
              <div
                className={cn(
                  'absolute top-3.5 -left-6 grid size-5 -translate-x-1/2 place-items-center rounded-full bg-surface shadow-2xs ring-4 ring-surface sm:-left-7',
                  isApproved ? 'text-emerald-600' : isPending ? 'text-sky-600' : 'text-amber-500',
                )}
                aria-hidden="true"
              >
                {isApproved ? (
                  <CheckCircle2 className="size-4 fill-emerald-100 text-emerald-600" />
                ) : isPending ? (
                  <Clock className="size-4 fill-sky-100 text-sky-600" />
                ) : (
                  <MessageSquareWarning className="size-4 fill-amber-100 text-amber-600" />
                )}
              </div>

              {/* Cycle Card */}
              <div
                className={cn(
                  'overflow-hidden rounded-xl border shadow-2xs transition-all duration-200',
                  isApproved
                    ? 'border-emerald-200/80 bg-emerald-50/15'
                    : isPending
                      ? 'border-sky-200/80 bg-sky-50/15'
                      : 'border-amber-200/80 bg-amber-50/15',
                )}
              >
                {/* Header Action Button */}
                <button
                  type="button"
                  onClick={() => toggleCycle(entry.id)}
                  aria-expanded={isExpanded}
                  className="flex w-full items-center justify-between gap-3 p-3.5 text-left transition-colors hover:bg-surface/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 sm:p-4"
                >
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <Tag className="bg-violet-100 text-xs font-bold text-violet-700">
                      Round {entry.reviewRound}
                    </Tag>

                    {entry.decision !== null ? (
                      <StatusBadge
                        status={entry.decision === 'Approved' ? 'Approved' : 'ChangesRequested'}
                      />
                    ) : (
                      <Tag className="border border-sky-200 bg-sky-100 text-xs font-semibold text-sky-800">
                        Pending Review
                      </Tag>
                    )}

                    {entry.rank !== null && <RankBadge rank={entry.rank} />}

                    <span className="text-ink-600 flex items-center gap-1 text-xs font-medium">
                      <User className="size-3 text-ink-400" aria-hidden="true" />
                      {textOr(entry.reviewerName, isPending ? 'Awaiting Reviewer' : 'Reviewer')}
                    </span>

                    <span className="flex items-center gap-1 text-xs font-medium text-ink-500">
                      <MessageSquare className="size-3 text-ink-400" aria-hidden="true" />
                      {allDisplayComments.length}{' '}
                      {allDisplayComments.length === 1 ? 'comment' : 'comments'}
                    </span>
                  </div>

                  <div className="flex shrink-0 items-center gap-2.5">
                    {entry.decidedAt !== null && (
                      <span className="hidden text-xs text-ink-400 sm:inline">
                        {formatDateTime(entry.decidedAt)}
                      </span>
                    )}
                    <span className="hidden text-xs font-medium text-ink-500 md:inline">
                      {isExpanded ? 'Hide details' : 'View details'}
                    </span>
                    <ChevronDown
                      className={cn(
                        'size-4 text-ink-400 transition-transform duration-200',
                        isExpanded && 'rotate-180',
                      )}
                      aria-hidden="true"
                    />
                  </div>
                </button>

                {/* Collapsible Details Panel */}
                {isExpanded && (
                  <div className="space-y-4 border-t border-line/50 px-3.5 pt-1 pb-4 sm:px-4 sm:pb-4">
                    {/* Previous Feedback Review Note (if provided during approval) */}
                    {entry.previousFeedbackReviewNote &&
                      entry.previousFeedbackReviewNote.trim() !== '' && (
                        <div className="space-y-1 rounded-xl border border-violet-200 bg-violet-50/50 p-3.5">
                          <div className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-violet-900 uppercase">
                            <FileText className="size-3.5 text-violet-700" />
                            <span>Previous Feedback Review Note</span>
                          </div>
                          <p className="text-ink-800 text-xs leading-relaxed whitespace-pre-wrap">
                            {entry.previousFeedbackReviewNote}
                          </p>
                        </div>
                      )}

                    {/* Active Workflow: Review Comments */}
                    {hasComments ? (
                      <div className="space-y-3">
                        <p className="text-xs font-bold tracking-wider text-ink-500 uppercase">
                          Review Comments ({allDisplayComments.length})
                        </p>
                        <ul className="space-y-3">
                          {allDisplayComments.map((comment, idx) => {
                            const response = (entry.responses ?? []).find(
                              (r) => r.commentId === comment.id,
                            );
                            const shots = comment.screenshots ?? [];
                            const isFollowUp = followUpComments.some((f) => f.id === comment.id);
                            const isPreviousAuthor = entry.currentReviewSessionId
                              ? comment.reviewSessionId !== entry.currentReviewSessionId
                              : Boolean(
                                  comment.reviewerId &&
                                  entry.reviewerId &&
                                  comment.reviewerId !== entry.reviewerId,
                                );

                            return (
                              <li
                                key={comment.id}
                                className="space-y-2.5 rounded-xl border border-line bg-surface p-3.5 shadow-2xs"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-xs font-bold text-ink-900">
                                      Comment #{idx + 1}
                                    </span>
                                    {comment.reviewerName && (
                                      <span className="text-2xs font-medium text-ink-500">
                                        by {comment.reviewerName}
                                      </span>
                                    )}
                                    {isFollowUp && (
                                      <Tag className="text-2xs border-indigo-200 bg-indigo-50 font-semibold text-indigo-700">
                                        Follow-Up from Round {comment.reviewRound}
                                      </Tag>
                                    )}
                                    {isPreviousAuthor && !isFollowUp && (
                                      <Tag className="text-2xs bg-slate-100 font-semibold text-slate-700">
                                        Previous Reviewer / Handover Context
                                      </Tag>
                                    )}
                                  </div>

                                  {response && (
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <Tag
                                        className={
                                          response.kind === 'Resolved'
                                            ? 'text-2xs bg-emerald-100 font-bold text-emerald-800'
                                            : 'text-2xs bg-amber-100 font-bold text-amber-900'
                                        }
                                      >
                                        Developer: {response.kind}
                                      </Tag>
                                      {response.verdict === 'Pending' ? (
                                        <Tag className="text-2xs bg-amber-100 font-semibold text-amber-800">
                                          {response.kind === 'Rejected'
                                            ? 'Verdict: Pending Adjudication'
                                            : 'Reviewer Verification: Pending'}
                                        </Tag>
                                      ) : response.verdict === 'Accepted' ? (
                                        <Tag className="text-2xs bg-emerald-100 font-semibold text-emerald-800">
                                          Verdict:{' '}
                                          {response.kind === 'Resolved'
                                            ? 'Resolution Verified'
                                            : 'Rejection Accepted'}
                                        </Tag>
                                      ) : response.verdict === 'Overruled' ? (
                                        <Tag className="text-2xs bg-rose-100 font-semibold text-rose-800">
                                          Verdict:{' '}
                                          {response.kind === 'Resolved'
                                            ? 'Not Resolved'
                                            : 'Not Accepted'}
                                        </Tag>
                                      ) : null}
                                    </div>
                                  )}
                                </div>

                                {comment.text && comment.text.trim() !== '' && (
                                  <p className="text-ink-800 text-sm leading-relaxed whitespace-pre-wrap">
                                    {comment.text}
                                  </p>
                                )}

                                {/* Screenshots attached to this comment */}
                                {shots.length > 0 && (
                                  <div className="space-y-1.5 pt-1">
                                    <p className="text-2xs font-bold tracking-wider text-ink-500 uppercase">
                                      Attached Evidence ({shots.length})
                                    </p>
                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                      {shots.map((shot) => (
                                        <ScreenshotPreviewCard
                                          key={shot.id}
                                          shot={shot}
                                          readOnly={true}
                                          onPreview={(s) => {
                                            setLightboxScreenshot(s);
                                            setLightboxShots(shots);
                                          }}
                                        />
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Developer Rejection Reason */}
                                {response?.kind === 'Rejected' &&
                                  response.rejectionReason &&
                                  response.rejectionReason.trim() !== '' && (
                                    <div className="space-y-1 rounded border border-amber-200/80 bg-amber-50/40 p-2.5 text-xs">
                                      <span className="text-2xs font-bold tracking-wider text-amber-900 uppercase">
                                        Developer Rejection Reason:
                                      </span>
                                      <p className="text-ink-800 whitespace-pre-wrap">
                                        {response.rejectionReason}
                                      </p>
                                    </div>
                                  )}

                                {/* Reviewer Follow-up Explanation / Verdict Note */}
                                {response?.reviewerComment &&
                                  response.reviewerComment.trim() !== '' && (
                                    <div className="space-y-1 rounded border border-indigo-200/80 bg-indigo-50/40 p-2.5 text-xs">
                                      <span className="text-2xs font-bold tracking-wider text-indigo-900 uppercase">
                                        Reviewer Follow-up Explanation:
                                      </span>
                                      <p className="text-ink-800 whitespace-pre-wrap">
                                        {response.reviewerComment}
                                      </p>
                                    </div>
                                  )}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ) : hasLegacyContent ? (
                      /* Backward Compatibility Fallback for Legacy Fixture Cycles */
                      <div className="space-y-3">
                        {hasFeedbackSummary && (
                          <div className="rounded-lg border border-line bg-surface p-3 shadow-2xs">
                            <p className="mb-1 text-xs font-bold tracking-wider text-ink-500 uppercase">
                              Reviewer Feedback Summary
                            </p>
                            <p className="text-ink-800 text-sm leading-relaxed whitespace-pre-wrap">
                              {entry.feedbackSummary}
                            </p>
                          </div>
                        )}

                        {hasLegacyFindings && (
                          <div className="space-y-1.5 rounded-lg border border-line bg-surface p-3 text-xs shadow-2xs">
                            {hasIncorrectCode && (
                              <p>
                                <span className="font-bold text-ink-700">Incorrect Code: </span>
                                {entry.findings.incorrectCode}
                              </p>
                            )}
                            {hasIncompleteImplementation && (
                              <p>
                                <span className="font-bold text-ink-700">
                                  Incomplete Implementation:{' '}
                                </span>
                                {entry.findings.incompleteImplementation}
                              </p>
                            )}
                            {hasSourceFormatting && (
                              <p>
                                <span className="font-bold text-ink-700">Formatting: </span>
                                {entry.findings.sourceFormatting}
                              </p>
                            )}
                          </div>
                        )}

                        {hasLegacyScreenshots && (
                          <div className="space-y-1.5 pt-1">
                            <p className="text-2xs font-bold tracking-wider text-ink-500 uppercase">
                              Attached Evidence ({legacyScreenshots.length})
                            </p>
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                              {legacyScreenshots.map((shot) => (
                                <ScreenshotPreviewCard
                                  key={shot.id}
                                  shot={shot}
                                  readOnly={true}
                                  onPreview={(s) => {
                                    setLightboxScreenshot(s);
                                    setLightboxShots(legacyScreenshots);
                                  }}
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Empty State when cycle has 0 comments, no responses, no screenshots */
                      <CycleEmptyState isApproved={isApproved} />
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Evidence Lightbox Viewer */}
      <ImageLightboxModal
        shot={lightboxScreenshot}
        shots={lightboxShots}
        onClose={() => {
          setLightboxScreenshot(null);
          setLightboxShots([]);
        }}
        onSelectShot={(shot) => setLightboxScreenshot(shot)}
      />
    </div>
  );
}

/** Canonical domain name alias for ReviewCycleHistory */
export const ReviewRoundHistory = ReviewCycleHistory;

