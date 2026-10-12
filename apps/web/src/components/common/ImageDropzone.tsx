import { useRef, useState } from 'react';
import { ImagePlus, Trash2, Upload } from 'lucide-react';
import { cn } from '@/components/ui';
import { Button } from '@/components/ui/Button.tsx';
import { IconButton, Textarea } from '@/components/ui/controls.tsx';
import { interpolate } from '@/lib/formatters.ts';
import common from '@/content/common.json';
import {
  MAX_ATTACHMENTS,
  rejectAttachment,
  remainingAttachmentSlots,
  type AttachmentRejection,
} from '@/lib/attachments.ts';

/**
 * Attach images, with per-image captions.
 *
 * Used by both sides of a review: the reviewer's Issue Screenshot Feedback
 * (spec §2.9.2.6), where a Rank 2/3 review must carry at least one, and the
 * developer's optional supporting attachments on the submit step.
 *
 * Whether attachments are REQUIRED is the caller's rule, not this component's —
 * it renders a dropzone and reports what was added. That is why the same
 * component serves a mandatory field and an optional one.
 *
 * Files are validated against `lib/attachments.ts` before upload so the user is
 * told immediately rather than after a round trip. The server checks again: this
 * is a courtesy, not a control.
 */

/** The shape both a review screenshot and a task attachment satisfy. */
export interface DropzoneImage {
  id: string;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
  storageRef: string;
  /** Reviewer's annotation, or the developer's caption. */
  comment: string;
}

export function ImageDropzone({
  images,
  onAdd,
  onComment,
  onRemove,
  disabled = false,
}: {
  images: readonly DropzoneImage[];
  onAdd: (file: { fileName: string; sizeBytes: number; mimeType: string; dataUrl: string }) => void;
  onComment: (screenshotId: string, comment: string) => void;
  onRemove: (screenshotId: string) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [rejection, setRejection] = useState<AttachmentRejection | null>(null);
  const [rejectedName, setRejectedName] = useState('');

  /**
   * Comments are edited locally and committed on blur.
   *
   * The obvious alternative — firing `onComment` per keystroke — makes the
   * textarea a controlled field whose value round-trips through the server. Two
   * in-flight saves can then land out of order and rewrite what the user is
   * still typing. Editing locally and committing once removes the race instead
   * of debouncing it.
   */
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  async function accept(files: FileList | null) {
    if (files === null || disabled) return;
    setRejection(null);

    let count = images.length;
    for (const file of Array.from(files)) {
      const reason = rejectAttachment(
        { name: file.name, sizeBytes: file.size, mimeType: file.type },
        count,
      );

      if (reason !== null) {
        setRejection(reason);
        setRejectedName(file.name);
        // Stop at the first rejection rather than silently skipping files — the
        // reviewer needs to know which one failed and why.
        break;
      }

      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          resolve(typeof reader.result === 'string' ? reader.result : '');
        };
        reader.readAsDataURL(file);
      });

      onAdd({
        fileName: file.name,
        sizeBytes: file.size,
        mimeType: file.type,
        dataUrl,
      });
      count += 1;
    }
  }

  const slotsLeft = remainingAttachmentSlots(images.length);

  return (
    <div className="space-y-3">
      {/*
        A label wrapping a file input, not a div with a click handler: this is
        keyboard-reachable and announced as a file control for free, which a
        hand-rolled dropzone has to reimplement and usually gets wrong.
      */}
      <label
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => {
          setIsDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          void accept(event.dataTransfer.files);
        }}
        /*
         * Sized to the Power App reference.
         *
         * This was a compact `py-8` control with `text-sm`/`text-xs` copy, which
         * inside the long review form read as one more field rather than as a
         * place to drop a file onto. A drop target has to look like a target.
         */
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-card border-2 border-dashed px-6 py-12 text-center transition-colors',
          'focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-violet-600',
          disabled && 'pointer-events-none opacity-50',
          isDragging ? 'border-violet-600 bg-violet-50' : 'border-line-strong bg-surface',
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          multiple
          disabled={disabled || slotsLeft === 0}
          className="sr-only"
          onChange={(event) => {
            void accept(event.target.files);
            // Reset so re-selecting the same file fires `change` again.
            event.target.value = '';
          }}
        />
        {/* The icon sits on a tinted disc, as in the reference — a bare glyph
            is lost in the middle of a zone this size. */}
        <span
          className="mb-2 grid size-12 place-items-center rounded-full bg-canvas text-ink-400"
          aria-hidden="true"
        >
          <ImagePlus className="size-6" />
        </span>
        <span className="text-base font-semibold text-ink-900">{common.dropzone.dropzone}</span>
        <span className="text-sm text-ink-500">{common.dropzone.dropzoneOr}</span>
        <span className="text-sm text-ink-400">{common.dropzone.dropzoneTypes}</span>
        <span className="mt-4">
          <Button
            variant="secondary"
            type="button"
            disabled={disabled || slotsLeft === 0}
            onClick={(event) => {
              // The label would open the picker anyway; stopping propagation
              // prevents it opening twice.
              event.preventDefault();
              inputRef.current?.click();
            }}
          >
            <Upload className="size-4" aria-hidden="true" />
            {common.dropzone.selectImages}
          </Button>
        </span>
      </label>

      {/* Centred under the zone rather than flush left: it describes the zone,
          and the reference reads it as that zone's caption. */}
      <p className="text-center text-sm text-ink-500" aria-live="polite">
        {interpolate(common.dropzone.imageCount, {
          count: images.length,
          max: MAX_ATTACHMENTS,
        })}
      </p>

      {rejection === null ? null : (
        <p role="alert" className="text-center text-sm font-medium text-danger">
          {interpolate(common.dropzone.imageRejected[rejection], {
            fileName: rejectedName,
          })}
        </p>
      )}

      {images.length === 0 ? null : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {images.map((shot) => (
            <li key={shot.id} className="rounded-card border border-line bg-surface p-3">
              <div className="flex items-start gap-3">
                {/*
                  `alt` is the file name, not "screenshot": the reviewer's own
                  comment below carries the meaning, and a generic alt would add
                  noise for a screen-reader user without adding information.
                */}
                <img
                  src={shot.storageRef}
                  alt={shot.fileName}
                  className="size-16 shrink-0 rounded-lg border border-line object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-900">{shot.fileName}</p>
                  <p className="text-xs text-ink-500">{(shot.sizeBytes / 1024).toFixed(0)} KB</p>
                </div>
                <IconButton
                  label={interpolate(common.dropzone.removeImage, {
                    fileName: shot.fileName,
                  })}
                  icon={<Trash2 className="size-4" />}
                  tone="danger"
                  size="sm"
                  disabled={disabled}
                  onClick={() => {
                    onRemove(shot.id);
                  }}
                />
              </div>

              <Textarea
                value={drafts[shot.id] ?? shot.comment}
                onChange={(event) => {
                  const { value } = event.target;
                  setDrafts((current) => ({ ...current, [shot.id]: value }));
                }}
                onBlur={(event) => {
                  if (event.target.value !== shot.comment) onComment(shot.id, event.target.value);
                }}
                disabled={disabled}
                rows={2}
                className="mt-2 min-h-0"
                aria-label={interpolate(common.dropzone.imageComment, {
                  fileName: shot.fileName,
                })}
                placeholder={common.dropzone.imageCommentPlaceholder}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
