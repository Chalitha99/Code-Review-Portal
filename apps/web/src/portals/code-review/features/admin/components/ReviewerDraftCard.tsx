import { useState } from 'react';
import { AlertCircle, Camera, FileText, Info, MessageSquare } from 'lucide-react';
import type { Review, ReviewScreenshot } from '@sdp/contracts';
import { cn } from '@/components/ui';
import { Card, CardBody, CardHeader } from '@/components/ui/Card.tsx';
import { formatDateTime } from '@/lib/formatters.ts';
import { ScreenshotPreviewCard } from '@/portals/code-review/components/ScreenshotPreviewCard.tsx';
import { ImageLightboxModal } from '@/portals/code-review/components/ImageLightboxModal.tsx';
import { downloadScreenshot } from '@/portals/code-review/components/screenshotNaming.ts';

export interface ReviewerDraftCardProps {
  review: Review | null | undefined;
  isLoading?: boolean;
  className?: string;
}

/**
 * Read-only presentation of the active review draft preserved during handover.
 *
 * Enforces admin read-only rules:
 * - Shows preserved comments and comment authors
 * - Shows screenshot evidence with Preview and Download
 * - Strictly zero editable controls (no rename, remove, add comment, approve, or request changes)
 */
export function ReviewerDraftCard({
  review,
  isLoading = false,
  className,
}: ReviewerDraftCardProps) {
  const [lightboxScreenshot, setLightboxScreenshot] = useState<ReviewScreenshot | null>(null);
  const [lightboxShots, setLightboxShots] = useState<readonly ReviewScreenshot[]>([]);

  if (isLoading) {
    return (
      <Card
        collapsible
        defaultExpanded={false}
        resetKey="reviewer-draft-loading"
        summary="Loading"
        data-testid="reviewer-draft-loading"
        className={cn('overflow-hidden', className)}
      >
        <CardHeader
          title="Reviewer Draft"
          description="Loading preserved review draft..."
          icon={<FileText className="size-5 text-violet-600" />}
        />
        <CardBody className="p-6 text-center text-sm text-ink-500">
          <div className="inline-flex items-center gap-2">
            <span className="size-4 animate-spin rounded-full border-2 border-violet-600 border-t-transparent" />
            Loading preserved review work...
          </div>
        </CardBody>
      </Card>
    );
  }

  const comments = review?.comments ?? [];
  const totalScreenshots = comments.reduce(
    (acc, comment) => acc + (comment.screenshots?.length ?? 0),
    0,
  );

  const isEmpty = !review || comments.length === 0;

  return (
    <Card
      collapsible
      defaultExpanded={false}
      resetKey={review?.taskId ?? 'empty-reviewer-draft'}
      summary={`${comments.length} ${comments.length === 1 ? 'comment' : 'comments'} · ${totalScreenshots} ${totalScreenshots === 1 ? 'attachment' : 'attachments'}`}
      data-testid="reviewer-draft-card"
      className={cn('overflow-hidden border border-line shadow-sm', className)}
    >
      <CardHeader
        title={
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-base font-bold text-ink-900 sm:text-lg">Reviewer Draft</span>
            <span className="text-2xs rounded border border-line bg-surface px-2 py-0.5 font-semibold tracking-wider text-ink-500 uppercase">
              Read-Only Inspection
            </span>
          </div>
        }
        description="Review work preserved at the time of handover."
        icon={<FileText className="size-5 text-violet-600" />}
      />

      <CardBody className="space-y-5 pt-2">
        {isEmpty ? (
          <div
            data-testid="empty-draft-message"
            className="space-y-1.5 rounded-xl border border-dashed border-line bg-surface/50 p-6 text-center"
          >
            <AlertCircle className="mx-auto size-6 text-ink-400" aria-hidden="true" />
            <p className="text-ink-800 text-sm font-semibold">
              No review findings had been entered before this handover.
            </p>
            <p className="mx-auto max-w-md text-xs text-ink-500">
              No review comments or supporting evidence were added. Final review assessment pending.
            </p>
          </div>
        ) : (
          <>
            {/* Status notice */}
            <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface/60 px-4 py-3 text-xs">
              <div className="flex items-center gap-2 font-medium text-ink-700">
                <Info className="size-4 shrink-0 text-ink-400" aria-hidden="true" />
                <span>Final review assessment pending</span>
              </div>
              <span className="text-2xs font-medium text-ink-400">Preserved review context</span>
            </div>

            {/* Comments & Evidence Statistics */}
            <div className="flex items-center justify-between border-b border-line pb-2">
              <h3 className="flex items-center gap-2 text-sm font-bold text-ink-900">
                <MessageSquare className="size-4 text-ink-500" />
                <span>Preserved Review Comments ({comments.length})</span>
              </h3>
              <div className="flex items-center gap-3 text-xs text-ink-500">
                <span className="flex items-center gap-1">
                  <Camera className="size-3.5 text-ink-400" />
                  {totalScreenshots} Evidence Screenshot{totalScreenshots === 1 ? '' : 's'}
                </span>
              </div>
            </div>

            {/* Preserved Comments List */}
            {comments.length === 0 ? (
              <p className="py-2 text-xs text-ink-500 italic">
                No individual review comments were recorded in this draft.
              </p>
            ) : (
              <ul className="space-y-4" data-testid="preserved-comments-list">
                {comments.map((comment, index) => {
                  const shots = comment.screenshots ?? [];

                  return (
                    <li
                      key={comment.id}
                      className="space-y-3 rounded-xl border border-line bg-surface p-4 shadow-2xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-2 text-xs">
                        <div className="flex items-center gap-2 font-bold text-ink-900">
                          <span>Review Comment #{index + 1}</span>
                          {comment.reviewerName && (
                            <span className="font-normal text-ink-500">
                              by <strong className="text-ink-800">{comment.reviewerName}</strong>
                            </span>
                          )}
                        </div>
                        {comment.createdAt && (
                          <span className="text-2xs text-ink-400">
                            {formatDateTime(comment.createdAt)}
                          </span>
                        )}
                      </div>

                      {/* Comment text */}
                      <p className="text-ink-800 text-sm leading-relaxed whitespace-pre-wrap">
                        {comment.text}
                      </p>

                      {/* Supporting Evidence Screenshots */}
                      {shots.length > 0 && (
                        <div className="space-y-2 pt-2">
                          <span className="text-2xs flex items-center gap-1.5 font-bold tracking-wider text-ink-500 uppercase">
                            <Camera className="size-3 text-ink-400" />
                            Supporting Evidence ({shots.length})
                          </span>
                          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                            {shots.map((shot) => (
                              <ScreenshotPreviewCard
                                key={shot.id}
                                shot={shot}
                                readOnly={true}
                                canModify={false}
                                onPreview={(selected) => {
                                  setLightboxScreenshot(selected);
                                  setLightboxShots(shots);
                                }}
                                onDownload={(selected) => downloadScreenshot(selected)}
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
          </>
        )}
      </CardBody>

      {/* Lightbox Viewer for Admin Inspection */}
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
