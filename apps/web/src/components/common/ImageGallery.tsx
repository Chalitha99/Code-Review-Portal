import { ImageOff } from 'lucide-react';
import type { DropzoneImage } from '@/components/common/ImageDropzone.tsx';
import { EmptyState, EmptyStateIcon } from '@/components/common/states.tsx';

/**
 * Read-only counterpart to `ImageDropzone`.
 *
 * The developer attaches supporting screenshots while the task is editable; from
 * then on — on Task Details after submission, and on the reviewer's Review page —
 * they are evidence, not a form, so nothing here can add, caption or remove.
 * That distinction is enforced by the handlers too (`canEditTask`); this is the
 * matching UI, not the control.
 */
export function ImageGallery({
  images,
  emptyText,
  emptyTitle,
}: {
  images: readonly DropzoneImage[];
  emptyText: string;
  /**
   * Promotes the empty state from a line of grey text to a centred panel with a
   * tiled icon — the Power App treatment, for a card whose whole body is the
   * gallery. Omit it where the gallery sits among other content and a full
   * empty state would shout.
   */
  emptyTitle?: string | undefined;
}) {
  if (images.length === 0) {
    return emptyTitle === undefined ? (
      <p className="text-sm text-ink-500">{emptyText}</p>
    ) : (
      <EmptyState
        icon={
          <EmptyStateIcon>
            <ImageOff className="size-6" aria-hidden="true" />
          </EmptyStateIcon>
        }
        title={emptyTitle}
        hint={emptyText}
      />
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {images.map((image) => (
        <li key={image.id} className="rounded-card border border-line bg-surface p-3">
          <div className="flex items-start gap-3">
            <img
              src={image.storageRef}
              alt={image.fileName}
              className="size-16 shrink-0 rounded-lg border border-line object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink-900">{image.fileName}</p>
              <p className="text-xs text-ink-500">{(image.sizeBytes / 1024).toFixed(0)} KB</p>
              {image.comment.trim() === '' ? null : (
                // Developer-authored text is untrusted: escaped, never HTML.
                <p className="mt-1 text-sm whitespace-pre-wrap text-ink-700">{image.comment}</p>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
