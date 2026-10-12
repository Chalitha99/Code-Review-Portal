import { useState } from 'react';
import {
  AlertCircle,
  Award,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  MessageSquare,
  User,
} from 'lucide-react';
import type { Review, ReviewHistoryEntry, ReviewScreenshot } from '@sdp/contracts';
import { cn } from '@/components/ui';
import { RankBadge, Tag } from '@/portals/code-review/components/badges.tsx';
import { Card, CardBody, CardHeader } from '@/components/ui/Card.tsx';
import { formatDateTime, textOr } from '@/lib/formatters.ts';
import { getRankLabel } from '../domain/reviewRules.ts';
import { ScreenshotPreviewCard } from '@/portals/code-review/components/ScreenshotPreviewCard.tsx';
import { ImageLightboxModal } from '@/portals/code-review/components/ImageLightboxModal.tsx';

export interface CompletedReviewSummaryProps {
  review: Review | ReviewHistoryEntry;
  taskCode?: string;
  className?: string;
}

/**
 * Read-only presentation of a completed review cycle.
 * Renders for tasks in ChangesRequested or Approved state.
 *
 * Guarantees zero editable controls and no active review validation alerts.
 */
export function CompletedReviewSummary({
  review,
  taskCode,
  className,
}: CompletedReviewSummaryProps) {
  const [lightboxScreenshot, setLightboxScreenshot] = useState<ReviewScreenshot | null>(null);
  const [lightboxShots, setLightboxShots] = useState<readonly ReviewScreenshot[]>([]);

  const isApproved = review.decision === 'Approved';
  const comments = review.comments ?? [];
  const rankLabel = getRankLabel(review.rank);

  return (
    <Card
      collapsible
      defaultExpanded={false}
      resetKey={review.taskId}
      summary={`Round ${String(review.reviewRound)}`}
      className={cn(
        'overflow-hidden border-2 shadow-sm transition-all',
        isApproved ? 'border-emerald-200/90 bg-white' : 'border-amber-200/90 bg-white',
        className,
      )}
    >
      <CardHeader
        title={
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-base font-bold text-ink-900 sm:text-lg">Review Completed</span>
            <Tag
              className={cn(
                'px-2.5 py-0.5 text-xs font-bold',
                isApproved ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900',
              )}
            >
              {isApproved ? 'Approved' : 'Changes Requested'}
            </Tag>
            {review.rank !== null && <RankBadge rank={review.rank} />}
            <Tag className="bg-violet-100 text-xs font-bold text-violet-700">
              Round {review.reviewRound}
            </Tag>
          </div>
        }
        description={
          taskCode
            ? `Finalized assessment for task ${taskCode} (Round ${review.reviewRound})`
            : `Finalized assessment for Round ${review.reviewRound}`
        }
        icon={
          isApproved ? (
            <CheckCircle2 className="size-5 text-emerald-600" />
          ) : (
            <AlertCircle className="size-5 text-amber-600" />
          )
        }
      />

      <CardBody className="space-y-6 pt-2">
        {/* Status Callout Banner */}
        <div
          role="status"
          className={cn(
            'flex items-start gap-3 rounded-xl border p-4 transition-colors',
            isApproved
              ? 'border-emerald-200 bg-emerald-50/60 text-emerald-950'
              : 'border-amber-200 bg-amber-50/70 text-amber-950',
          )}
        >
          {isApproved ? (
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden="true" />
          ) : (
            <Clock className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden="true" />
          )}
          <div className="space-y-1 text-sm">
            <p className="font-bold">
              {isApproved
                ? 'Quality Criteria Satisfied — Task Approved'
                : 'Waiting for Developer Changes'}
            </p>
            <p className="text-xs leading-relaxed text-ink-700 sm:text-sm">
              {isApproved
                ? `This review was concluded on ${review.decidedAt ? formatDateTime(review.decidedAt) : 'recently'} by ${review.reviewerName}. All quality and verification criteria have been met.`
                : `This review was concluded on ${review.decidedAt ? formatDateTime(review.decidedAt) : 'recently'} by ${review.reviewerName}. Changes were requested. The task is currently with the developer to address the findings below and re-submit.`}
            </p>
          </div>
        </div>

        {/* Metadata Grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="space-y-1 rounded-lg border border-line bg-surface/50 p-3">
            <span className="flex items-center gap-1.5 text-xs font-medium text-ink-500">
              <User className="size-3.5 text-ink-400" />
              Reviewed by
            </span>
            <p className="truncate text-sm font-semibold text-ink-900">
              {textOr(review.reviewerName, 'Unknown Reviewer')}
            </p>
          </div>

          <div className="space-y-1 rounded-lg border border-line bg-surface/50 p-3">
            <span className="flex items-center gap-1.5 text-xs font-medium text-ink-500">
              <Calendar className="size-3.5 text-ink-400" />
              Decided At
            </span>
            <p className="truncate text-sm font-semibold text-ink-900">
              {review.decidedAt ? formatDateTime(review.decidedAt) : '—'}
            </p>
          </div>

          <div className="space-y-1 rounded-lg border border-line bg-surface/50 p-3">
            <span className="flex items-center gap-1.5 text-xs font-medium text-ink-500">
              <Award className="size-3.5 text-ink-400" />
              Quality Rank
            </span>
            <p className="truncate text-sm font-semibold text-ink-900" title={rankLabel}>
              {rankLabel}
            </p>
          </div>

          <div className="space-y-1 rounded-lg border border-line bg-surface/50 p-3">
            <span className="flex items-center gap-1.5 text-xs font-medium text-ink-500">
              <MessageSquare className="size-3.5 text-ink-400" />
              Comments Recorded
            </span>
            <p className="text-sm font-semibold text-ink-900">{comments.length}</p>
          </div>
        </div>

        {/* Recorded Comments List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-line pb-2">
            <h3 className="flex items-center gap-2 text-sm font-bold text-ink-900">
              <FileText className="size-4 text-ink-500" />
              Recorded Review Comments ({comments.length})
            </h3>
            {comments.length > 0 && (
              <span className="text-xs text-ink-400">Read-only historical view</span>
            )}
          </div>

          {comments.length === 0 ? (
            <div className="rounded-lg border border-line/60 bg-surface/40 p-4 text-center">
              <p className="text-ink-600 text-sm">
                {isApproved
                  ? 'No defect comments were recorded for this round. Task met all quality requirements.'
                  : 'No individual review comments were recorded.'}
              </p>

              {/* Legacy Feedback Summary fallback */}
              {review.feedbackSummary && review.feedbackSummary.trim() !== '' && (
                <div className="mt-3 rounded border border-line bg-white p-3 text-left">
                  <p className="mb-1 text-xs font-bold tracking-wider text-ink-500 uppercase">
                    Feedback Summary
                  </p>
                  <p className="text-ink-800 text-sm whitespace-pre-wrap">
                    {review.feedbackSummary}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <ul className="space-y-4">
              {comments.map((comment, index) => {
                const shots = comment.screenshots ?? [];

                return (
                  <li
                    key={comment.id}
                    className="space-y-3 rounded-xl border border-line bg-surface p-4 shadow-2xs"
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-line/60 pb-2">
                      <span className="text-xs font-bold text-ink-900">Comment #{index + 1}</span>
                      {comment.createdAt && (
                        <span className="text-2xs text-ink-400">
                          {formatDateTime(comment.createdAt)}
                        </span>
                      )}
                    </div>

                    <p className="text-ink-800 text-sm leading-relaxed whitespace-pre-wrap">
                      {comment.text}
                    </p>

                    {/* Attached Evidence Screenshots */}
                    {shots.length > 0 && (
                      <div className="space-y-2 pt-2">
                        <span className="text-2xs font-bold tracking-wider text-ink-500 uppercase">
                          Attached Evidence ({shots.length})
                        </span>
                        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                          {shots.map((shot) => (
                            <ScreenshotPreviewCard
                              key={shot.id}
                              shot={shot}
                              readOnly={true}
                              onPreview={(selected) => {
                                setLightboxScreenshot(selected);
                                setLightboxShots(shots);
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </CardBody>

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
    </Card>
  );
}
