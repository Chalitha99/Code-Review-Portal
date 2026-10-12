import { describe, expect, it } from 'vitest';
import { MAX_SCREENSHOT_BYTES, MAX_SCREENSHOTS_PER_REVIEW } from '@sdp/contracts';
import { rejectAttachment, remainingAttachmentSlots } from '@/lib/attachments.ts';

/**
 * Caps apply identically to a reviewer's evidence and a developer's supporting
 * images (spec FL 2.9.2.6-01). One rule, tested once.
 */

describe('image attachment rules (FL 2.9.2.6-01)', () => {
  const png = { name: 'shot.png', sizeBytes: 1024, mimeType: 'image/png' };

  it('accepts the permitted image types', () => {
    for (const mimeType of ['image/png', 'image/jpeg', 'image/gif', 'image/webp']) {
      expect(rejectAttachment({ ...png, mimeType }, 0)).toBeNull();
    }
  });

  it('rejects anything else, including a PDF pretending to be evidence', () => {
    expect(rejectAttachment({ ...png, mimeType: 'application/pdf' }, 0)).toBe('wrongType');
    expect(rejectAttachment({ ...png, mimeType: 'image/svg+xml' }, 0)).toBe('wrongType');
  });

  it('rejects a file over 5MB but accepts one exactly at the cap', () => {
    expect(rejectAttachment({ ...png, sizeBytes: MAX_SCREENSHOT_BYTES }, 0)).toBeNull();
    expect(rejectAttachment({ ...png, sizeBytes: MAX_SCREENSHOT_BYTES + 1 }, 0)).toBe('tooLarge');
  });

  it('rejects the eleventh screenshot', () => {
    expect(rejectAttachment(png, MAX_SCREENSHOTS_PER_REVIEW - 1)).toBeNull();
    expect(rejectAttachment(png, MAX_SCREENSHOTS_PER_REVIEW)).toBe('tooMany');
  });

  it('reports the remaining slots without going negative', () => {
    expect(remainingAttachmentSlots(0)).toBe(MAX_SCREENSHOTS_PER_REVIEW);
    expect(remainingAttachmentSlots(MAX_SCREENSHOTS_PER_REVIEW)).toBe(0);
    expect(remainingAttachmentSlots(MAX_SCREENSHOTS_PER_REVIEW + 5)).toBe(0);
  });
});
