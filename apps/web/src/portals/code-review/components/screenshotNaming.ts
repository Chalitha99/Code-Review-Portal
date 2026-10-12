import type { ReviewScreenshot } from '@sdp/contracts';
import { textOr } from '@/lib/formatters.ts';

/**
 * Extracts all existing sequence numbers matching `{taskCode}-screenshot-{N}.{ext}`
 * or `screenshot-{N}.{ext}` across the provided collection.
 *
 * Returns `maxSeq + 1` (starting at 1) to ensure newly added screenshots never
 * reuse sequence numbers even after deletions, re-ordering, or renames.
 */
export function getNextScreenshotSequence(
  taskCode: string | undefined,
  existingScreenshots: readonly { fileName: string }[],
): number {
  const code = textOr(taskCode?.trim(), 'task').toLowerCase();
  const escapedCode = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^(?:${escapedCode}-)?screenshot-(\\d+)\\.[^.]+$`, 'i');

  let maxSeq = 0;
  for (const shot of existingScreenshots) {
    const match = shot.fileName.match(pattern);
    if (match?.[1]) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxSeq) {
        maxSeq = num;
      }
    }
  }

  return maxSeq + 1;
}

/**
 * Generates the user-friendly canonical default display name for a newly uploaded screenshot.
 * Format: `{taskCode}-screenshot-{seq}.{ext}`
 *
 * Example: `BLOM-010-screenshot-1.png`
 */
export function generateDefaultScreenshotName(
  taskCode: string | undefined,
  existingScreenshots: readonly { fileName: string }[],
  originalFile: { name: string },
): string {
  const ext = textOr(originalFile.name.split('.').pop()?.toLowerCase(), 'png');
  const prefix = textOr(taskCode?.trim(), 'screenshot');
  const nextSeq = getNextScreenshotSequence(taskCode, existingScreenshots);
  return `${prefix}-screenshot-${nextSeq}.${ext}`;
}

/**
 * Sanitizes a proposed base filename by stripping unsafe path/filesystem characters.
 */
export function sanitizeBaseFilename(name: string): string {
  return name
    .trim()
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, '-');
}

/**
 * Splits a filename into base name and extension.
 */
export function splitFilename(fileName: string): { baseName: string; extension: string } {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot <= 0) {
    return { baseName: fileName, extension: '' };
  }
  return {
    baseName: fileName.slice(0, lastDot),
    extension: fileName.slice(lastDot + 1),
  };
}

/**
 * Triggers an authorized browser download of the screenshot preserving its user-visible filename.
 */
export function downloadScreenshot(shot: Pick<ReviewScreenshot, 'storageRef' | 'fileName'>): void {
  const link = document.createElement('a');
  link.href = shot.storageRef;
  link.download = shot.fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
