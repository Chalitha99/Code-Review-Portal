import { useState } from 'react';
import { Pencil } from 'lucide-react';
import type { ReviewScreenshot } from '@sdp/contracts';
import { Button } from '@/components/ui/Button.tsx';
import { Dialog } from '@/components/ui/Dialog.tsx';
import { Field, Input } from '@/components/ui/Field.tsx';
import {
  sanitizeBaseFilename,
  splitFilename,
} from '@/portals/code-review/components/screenshotNaming.ts';
import { useFocusOnMount } from '@/hooks/useFocusOnMount.ts';

export interface RenameScreenshotDialogProps {
  shot: ReviewScreenshot | null;
  onClose: () => void;
  onSave: (shotId: string, newFileName: string) => void;
}

export function RenameScreenshotDialog({ shot, onClose, onSave }: RenameScreenshotDialogProps) {
  const focusOnMount = useFocusOnMount<HTMLInputElement>();
  const [baseName, setBaseName] = useState(() => {
    if (!shot) return '';
    return splitFilename(shot.fileName).baseName;
  });
  const [error, setError] = useState<string | undefined>(undefined);

  if (!shot) return null;

  const { extension } = splitFilename(shot.fileName);

  function handleSave() {
    const sanitized = sanitizeBaseFilename(baseName);
    if (!sanitized) {
      setError('Please enter a valid filename.');
      return;
    }
    if (sanitized.length > 80) {
      setError('Filename cannot exceed 80 characters.');
      return;
    }

    const fullFileName = extension ? `${sanitized}.${extension}` : sanitized;
    onSave(shot!.id, fullFileName);
    onClose();
  }

  return (
    <Dialog
      open={Boolean(shot)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Rename Screenshot"
      subtitle="Update the display name of this evidence screenshot."
      icon={<Pencil className="size-5 text-violet-600" aria-hidden="true" />}
      size="sm"
      footer={
        <div className="flex w-full items-center justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            className="bg-violet-600 text-white hover:bg-violet-700"
          >
            Save Name
          </Button>
        </div>
      }
    >
      <div className="space-y-4 pt-1">
        <Field label="Screenshot Name" required error={error}>
          <div className="flex items-center gap-2">
            <Input
              value={baseName}
              onChange={(e) => {
                setBaseName(e.target.value);
                if (error) setError(undefined);
              }}
              placeholder="e.g. login-validation-error"
              ref={focusOnMount}
              className="flex-1 font-mono text-sm"
              aria-label="Screenshot Name"
            />
            {extension ? (
              <span className="rounded-lg border border-line bg-canvas px-2.5 py-1.5 font-mono text-xs font-bold text-ink-500 select-none">
                .{extension}
              </span>
            ) : null}
          </div>
        </Field>
      </div>
    </Dialog>
  );
}
