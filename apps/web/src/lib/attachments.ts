import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_SCREENSHOT_BYTES,
  MAX_SCREENSHOTS_PER_REVIEW,
} from '@sdp/contracts';

/**
 * Image-attachment rules, shared by both sides of the review.
 *
 * The reviewer attaches screenshots to evidence a finding (spec §2.9.2.6); the
 * developer attaches them to a submission as supporting context. Same caps, same
 * accepted types, one implementation — a file that is too large for one is too
 * large for the other, and duplicating the check is how the two drift.
 *
 * Lives in `lib/` beside `permissions.ts` and `statusMachine.ts`: framework-free
 * rules that outgrew a single feature.
 */

export const ATTACHMENT_REJECTIONS = ['tooLarge', 'wrongType', 'tooMany'] as const;
export type AttachmentRejection = (typeof ATTACHMENT_REJECTIONS)[number];

export interface AttachmentCandidate {
  name: string;
  sizeBytes: number;
  mimeType: string;
}

/** Both surfaces cap at ten files; the constant is named for its first use. */
export const MAX_ATTACHMENTS = MAX_SCREENSHOTS_PER_REVIEW;

/**
 * Why a file cannot be attached, or `null` if it can.
 *
 * Phase 1 trusts the MIME type the browser reports. Phase 2 must additionally
 * sniff magic bytes server-side (plan §2.8) — a declared `image/png` is a claim,
 * not a fact — so this is a usability check, not a security control.
 */
export function rejectAttachment(
  candidate: AttachmentCandidate,
  existingCount: number,
): AttachmentRejection | null {
  if (existingCount >= MAX_ATTACHMENTS) return 'tooMany';
  if (!(ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(candidate.mimeType)) {
    return 'wrongType';
  }
  if (candidate.sizeBytes > MAX_SCREENSHOT_BYTES) return 'tooLarge';
  return null;
}

/** How many more files this collection will accept. */
export function remainingAttachmentSlots(existingCount: number): number {
  return Math.max(MAX_ATTACHMENTS - existingCount, 0);
}
