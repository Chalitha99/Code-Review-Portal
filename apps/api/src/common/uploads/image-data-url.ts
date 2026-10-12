import { ALLOWED_IMAGE_MIME_TYPES, MAX_SCREENSHOT_BYTES } from '@sdp/contracts';

export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

export type ImageInspection =
  | { ok: true; mimeType: AllowedImageMimeType; sizeBytes: number }
  | { ok: false; reason: 'malformed' | 'wrongType' | 'tooLarge' };

/** `data:<mime>;base64,<payload>` and nothing else: no parameters, no other schemes. */
const DATA_URL = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]*={0,2})$/;

/** Largest base64 payload that can still decode to an allowed image. */
const MAX_BASE64_CHARS = Math.ceil(MAX_SCREENSHOT_BYTES / 3) * 4;

function startsWith(bytes: Buffer, signature: readonly number[], offset = 0): boolean {
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

/** The type the bytes actually are, from their magic number; never the client's word. */
function sniffImageType(bytes: Buffer): AllowedImageMimeType | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  const head = bytes.subarray(0, 6).toString('latin1');
  if (head === 'GIF87a' || head === 'GIF89a') return 'image/gif';
  if (
    bytes.subarray(0, 4).toString('latin1') === 'RIFF' &&
    bytes.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

/**
 * Validates an uploaded image sent as a base64 data URL (task attachments and
 * review screenshots), the server-side half of the web client's
 * `rejectAttachment` (5 MB, PNG/JPEG/GIF/WebP).
 *
 * Every check is on the decoded bytes: the declared size and MIME type are only
 * hints from the browser. Requiring a `data:image/...` URL also keeps any other
 * scheme (`javascript:`, `https:`) out of `storageRef`, which the web app puts
 * straight into `<img src>` and download links.
 */
export function inspectImageDataUrl(dataUrl: string): ImageInspection {
  // Cheap length gate first, so an oversized payload is never decoded.
  const comma = dataUrl.indexOf(',');
  if (comma === -1) return { ok: false, reason: 'malformed' };
  if (dataUrl.length - comma - 1 > MAX_BASE64_CHARS) return { ok: false, reason: 'tooLarge' };

  const match = DATA_URL.exec(dataUrl);
  if (!match) return { ok: false, reason: 'malformed' };
  const [, declaredType = '', payload = ''] = match;
  if (!(ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(declaredType)) {
    return { ok: false, reason: 'wrongType' };
  }

  const bytes = Buffer.from(payload, 'base64');
  if (bytes.length === 0) return { ok: false, reason: 'malformed' };
  if (bytes.length > MAX_SCREENSHOT_BYTES) return { ok: false, reason: 'tooLarge' };

  const actualType = sniffImageType(bytes);
  if (actualType === null || actualType !== declaredType) return { ok: false, reason: 'wrongType' };
  return { ok: true, mimeType: actualType, sizeBytes: bytes.length };
}

/** The user-facing sentence for each rejection, shared by both upload paths. */
export const IMAGE_REJECTION_MESSAGES: Record<'malformed' | 'wrongType' | 'tooLarge', string> = {
  malformed: 'The image could not be read. Upload it again.',
  wrongType: 'Only PNG, JPEG, GIF and WebP images can be uploaded.',
  tooLarge: 'Each image must be 5 MB or smaller.',
};
