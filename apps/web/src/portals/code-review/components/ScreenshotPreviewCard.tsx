import { Download, Eye, Pencil, Trash2 } from 'lucide-react';
import type { ReviewScreenshot } from '@sdp/contracts';
import { cn } from '@/components/ui';
import { downloadScreenshot } from './screenshotNaming.ts';
import { textOr } from '@/lib/formatters.ts';

export interface ScreenshotPreviewCardProps {
  shot: ReviewScreenshot;
  readOnly?: boolean;
  canModify?: boolean;
  onPreview: (shot: ReviewScreenshot) => void;
  onDownload?: (shot: ReviewScreenshot) => void;
  onRename?: (shot: ReviewScreenshot) => void;
  onRemove?: (shotId: string) => void;
  className?: string;
}

export function ScreenshotPreviewCard({
  shot,
  readOnly = false,
  canModify = true,
  onPreview,
  onDownload = downloadScreenshot,
  onRename,
  onRemove,
  className,
}: ScreenshotPreviewCardProps) {
  const sizeKb = (shot.sizeBytes / 1024).toFixed(0);
  const ext = textOr(shot.fileName.split('.').pop()?.toUpperCase(), 'PNG');
  const isEditable = !readOnly && canModify;

  return (
    <div
      className={cn(
        'group flex flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-2xs transition-all duration-150 hover:border-violet-300',
        className,
      )}
    >
      {/* Non-cropping Image Preview Area */}
      <div
        onClick={() => onPreview(shot)}
        className="relative flex h-[200px] w-full cursor-pointer items-center justify-center border-b border-line/60 bg-canvas/80 p-2.5 select-none sm:h-[230px]"
        title="Click to view full size"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onPreview(shot);
          }
        }}
        aria-label={`View full size ${shot.fileName}`}
      >
        <img
          src={shot.storageRef}
          alt={shot.fileName}
          className="max-h-full max-w-full rounded object-contain transition-transform duration-200 group-hover:scale-[1.01]"
        />

        {/* Hover preview pill overlay */}
        <div className="bg-ink-950/20 absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface/90 px-3 py-1.5 text-xs font-semibold text-ink-900 shadow-md backdrop-blur-sm">
            <Eye className="size-3.5 text-violet-600" aria-hidden="true" />
            Preview
          </span>
        </div>
      </div>

      {/* Metadata & Actions Bar */}
      <div className="flex items-center justify-between gap-2 bg-surface p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold text-ink-900" title={shot.fileName}>
            {shot.fileName}
          </p>
          <p className="text-2xs mt-0.5 font-medium text-ink-400">
            {ext} • {sizeKb} KB
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => onPreview(shot)}
            className="rounded-lg p-1.5 text-ink-500 transition-colors hover:bg-violet-50 hover:text-violet-700"
            title="Preview screenshot"
            aria-label={`Preview ${shot.fileName}`}
          >
            <Eye className="size-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => onDownload(shot)}
            className="rounded-lg p-1.5 text-ink-500 transition-colors hover:bg-canvas hover:text-ink-900"
            title="Download screenshot"
            aria-label={`Download ${shot.fileName}`}
          >
            <Download className="size-4" aria-hidden="true" />
          </button>

          {isEditable && onRename && (
            <button
              type="button"
              onClick={() => onRename(shot)}
              className="rounded-lg p-1.5 text-ink-500 transition-colors hover:bg-canvas hover:text-ink-900"
              title="Rename screenshot"
              aria-label={`Rename ${shot.fileName}`}
            >
              <Pencil className="size-4" aria-hidden="true" />
            </button>
          )}

          {isEditable && onRemove && (
            <button
              type="button"
              onClick={() => onRemove(shot.id)}
              className="rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
              title="Remove screenshot"
              aria-label={`Remove ${shot.fileName}`}
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
