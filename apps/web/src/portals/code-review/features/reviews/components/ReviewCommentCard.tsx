import { useRef, useState } from 'react';
import { AlertCircle, Image as ImageIcon, Trash2, Upload } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import type { ReviewComment, ReviewScreenshot } from '@sdp/contracts';
import { Field } from '@/components/ui/Field.tsx';
import { Textarea } from '@/components/ui/controls.tsx';
import { cn } from '@/components/ui';
import { rejectAttachment } from '@/lib/attachments.ts';
import { generateDefaultScreenshotName } from '@/portals/code-review/components/screenshotNaming.ts';
import { isCommentOwnedBy, isCommentFromOtherReviewer } from '../domain/reviewRules.ts';
import { ScreenshotPreviewCard } from '@/portals/code-review/components/ScreenshotPreviewCard.tsx';
import { useFocusOnMount } from '@/hooks/useFocusOnMount.ts';

function formatCommentDate(isoString?: string): string | null {
  if (!isoString) return null;
  try {
    return format(parseISO(isoString), 'MMM d, yyyy h:mm a');
  } catch {
    return null;
  }
}

export interface ReviewCommentCardProps {
  comment: ReviewComment;
  index: number;
  taskCode?: string | undefined;
  currentUserId?: string | undefined;
  currentReviewSessionId?: string | undefined;
  readOnly?: boolean | undefined;
  forceValidation?: boolean | undefined;
  allScreenshots: readonly { fileName: string }[];
  onUpdateText: (commentId: string, text: string) => void;
  onRemoveComment: (commentId: string) => void;
  onAttachScreenshots: (commentId: string, shots: ReviewScreenshot[]) => void;
  onRemoveScreenshot: (commentId: string, screenshotId: string) => void;
  onPreviewScreenshot: (
    shot: ReviewScreenshot,
    commentScreenshots?: readonly ReviewScreenshot[],
  ) => void;
  onRenameScreenshot: (shot: ReviewScreenshot) => void;
}

export function ReviewCommentCard({
  comment,
  index,
  taskCode,
  currentUserId,
  currentReviewSessionId,
  readOnly = false,
  forceValidation = false,
  allScreenshots,
  onUpdateText,
  onRemoveComment,
  onAttachScreenshots,
  onRemoveScreenshot,
  onPreviewScreenshot,
  onRenameScreenshot,
}: ReviewCommentCardProps) {
  const focusOnMount = useFocusOnMount<HTMLTextAreaElement>();
  const [uploadError, setUploadError] = useState<string | undefined>(undefined);
  const [isDragging, setIsDragging] = useState(false);
  const [isTouched, setIsTouched] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isOwnComment = isCommentOwnedBy(comment, currentUserId, currentReviewSessionId);
  const isPreviousReviewer = isCommentFromOtherReviewer(
    comment,
    currentUserId,
    currentReviewSessionId,
  );
  const isCommentReadOnly = readOnly || !isOwnComment;
  const hasEmptyText = comment.text.trim() === '';
  const showError = hasEmptyText && isOwnComment && !readOnly && (isTouched || forceValidation);
  const screenshots = comment.screenshots ?? [];
  const formattedDate = formatCommentDate(comment.createdAt);

  async function processFiles(files: FileList | null) {
    if (!files || files.length === 0 || isCommentReadOnly) return;
    setUploadError(undefined);

    const newShots: ReviewScreenshot[] = [];
    let runningPool = [...allScreenshots];
    const errors: string[] = [];

    for (const file of Array.from(files)) {
      const rejection = rejectAttachment(
        { name: file.name, sizeBytes: file.size, mimeType: file.type },
        runningPool.length,
      );

      if (rejection !== null) {
        if (rejection === 'wrongType') {
          errors.push(`"${file.name}" is not an accepted image format (PNG, JPG, WebP).`);
        } else if (rejection === 'tooLarge') {
          errors.push(`"${file.name}" exceeds the 10MB maximum file size limit.`);
        } else {
          errors.push('Maximum screenshot limit (10) reached for this review.');
          break;
        }
        continue;
      }

      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
        reader.onerror = () => resolve('');
        reader.readAsDataURL(file);
      });

      if (!dataUrl) {
        errors.push(`Failed to read "${file.name}".`);
        continue;
      }

      const defaultFileName = generateDefaultScreenshotName(taskCode, runningPool, file);

      const newShot: ReviewScreenshot = {
        id: `shot-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        fileName: defaultFileName,
        sizeBytes: file.size,
        mimeType: file.type,
        storageRef: dataUrl,
        comment: '',
        uploadedAt: new Date().toISOString(),
      };

      runningPool = [...runningPool, newShot];
      newShots.push(newShot);
    }

    if (errors.length > 0) {
      setUploadError(errors.join(' '));
    }

    if (newShots.length > 0) {
      onAttachScreenshots(comment.id, newShots);
    }
  }

  return (
    <li
      className={cn(
        'space-y-4 rounded-2xl border p-4 shadow-2xs transition-all duration-150 sm:p-5',
        isPreviousReviewer
          ? 'border-slate-200 bg-white'
          : 'border-violet-200/80 bg-surface hover:border-violet-300',
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 border-b border-line/60 pb-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold',
                isPreviousReviewer
                  ? 'bg-slate-200 text-slate-700'
                  : 'bg-violet-600 text-white shadow-2xs',
              )}
            >
              {index + 1}
            </span>
            <span className="text-sm font-bold text-ink-900">Review Comment #{index + 1}</span>
            {isPreviousReviewer && (
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                Read-only
              </span>
            )}
          </div>

          {(Boolean(comment.reviewerName) || Boolean(formattedDate)) && (
            <div className="flex flex-wrap items-center gap-1.5 pl-8 text-xs text-ink-500">
              {comment.reviewerName && (
                <span className="font-medium">
                  By {comment.reviewerName} ·{' '}
                  {isPreviousReviewer ? 'Previous Reviewer' : 'Current Reviewer'}
                </span>
              )}
              {formattedDate && (
                <>
                  {comment.reviewerName && <span aria-hidden="true">·</span>}
                  <span>{formattedDate}</span>
                </>
              )}
            </div>
          )}
        </div>

        {!readOnly && isOwnComment && (
          <button
            type="button"
            onClick={() => onRemoveComment(comment.id)}
            className="shrink-0 rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
            title="Delete comment"
            aria-label={`Delete comment #${index + 1}`}
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Reviewer Feedback Text */}
      <Field
        label="Reviewer Feedback"
        required={!isCommentReadOnly}
        error={showError ? 'Enter feedback for this review comment.' : undefined}
      >
        <Textarea
          value={comment.text}
          onChange={(e) => {
            onUpdateText(comment.id, e.target.value);
            if (e.target.value.trim() !== '') {
              setIsTouched(false);
            }
          }}
          onBlur={(e) => {
            if (e.target.value.trim() === '') {
              setIsTouched(true);
            }
          }}
          placeholder="Describe the actionable issue clearly so the developer understands what requires attention..."
          rows={3}
          disabled={isCommentReadOnly}
          className={cn(
            'min-h-[85px] text-sm leading-relaxed transition-colors',
            isCommentReadOnly
              ? 'cursor-not-allowed border-slate-200 bg-slate-50/70 text-slate-800 select-text'
              : 'bg-surface text-ink-900 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20',
          )}
          ref={comment.text === '' && !isCommentReadOnly ? focusOnMount : undefined}
        />
      </Field>

      {/* Supporting Evidence Sub-Panel */}
      <div className="space-y-3 rounded-xl border border-line/70 bg-canvas/40 p-3.5">
        {!isCommentReadOnly && (
          <input
            type="file"
            ref={fileInputRef}
            accept="image/png,image/jpeg,image/webp"
            multiple
            className="hidden"
            aria-label="Upload screenshots"
            onChange={(e) => {
              void processFiles(e.target.files);
              e.target.value = '';
            }}
          />
        )}

        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-ink-700 uppercase">
            <ImageIcon
              className={cn('size-3.5', isPreviousReviewer ? 'text-slate-500' : 'text-violet-600')}
              aria-hidden="true"
            />
            Supporting Evidence {screenshots.length > 0 ? `(${screenshots.length})` : '(Optional)'}
          </span>
          {!isCommentReadOnly && (
            <span className="text-2xs font-medium text-ink-400">PNG, JPG, WebP up to 10MB</span>
          )}
        </div>

        {/* Compact dropzone when 0 screenshots and editable */}
        {screenshots.length === 0 && !isCommentReadOnly && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              void processFiles(e.dataTransfer.files);
            }}
            className={cn(
              'rounded-xl border border-dashed px-3 py-3.5 text-center transition-all duration-150',
              isDragging
                ? 'border-violet-500 bg-violet-50/50'
                : 'border-line/90 bg-surface/40 hover:border-violet-300 hover:bg-surface/80',
            )}
          >
            <p className="text-ink-600 flex flex-wrap items-center justify-center gap-1.5 text-xs">
              <Upload className="size-3 text-ink-400" aria-hidden="true" />
              <span>Drag & drop screenshots here, or</span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="cursor-pointer rounded-xs font-bold text-violet-700 underline hover:text-violet-800 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-1"
                aria-label="Browse files"
              >
                Browse files
              </button>
            </p>
          </div>
        )}

        {uploadError && (
          <p className="flex items-center gap-1 text-xs font-medium text-danger">
            <AlertCircle className="size-3.5 shrink-0" />
            {uploadError}
          </p>
        )}

        {/* Grid of Attached Screenshots */}
        {screenshots.length > 0 && (
          <div className="space-y-3">
            <div
              className={cn(
                'grid gap-3',
                screenshots.length === 1 ? 'max-w-xl grid-cols-1' : 'grid-cols-1 sm:grid-cols-2',
              )}
            >
              {screenshots.map((shot) => (
                <ScreenshotPreviewCard
                  key={shot.id}
                  shot={shot}
                  readOnly={readOnly}
                  canModify={isOwnComment}
                  onPreview={(s) => onPreviewScreenshot(s, screenshots)}
                  onRename={onRenameScreenshot}
                  onRemove={(shotId) => onRemoveScreenshot(comment.id, shotId)}
                />
              ))}
            </div>

            {/* Persistent dropzone below gallery when screenshots exist */}
            {!isCommentReadOnly && (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  void processFiles(e.dataTransfer.files);
                }}
                className={cn(
                  'rounded-xl border border-dashed px-3 py-2.5 text-center transition-all duration-150',
                  isDragging
                    ? 'border-violet-500 bg-violet-50/50'
                    : 'border-line/90 bg-surface/30 hover:border-violet-300 hover:bg-surface/80',
                )}
              >
                <p className="text-ink-600 flex flex-wrap items-center justify-center gap-1.5 text-xs">
                  <Upload className="size-3 text-ink-400" aria-hidden="true" />
                  <span>Drag & drop more screenshots here, or</span>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="cursor-pointer rounded-xs font-bold text-violet-700 underline hover:text-violet-800 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-1"
                    aria-label="Browse files"
                  >
                    Browse files
                  </button>
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
