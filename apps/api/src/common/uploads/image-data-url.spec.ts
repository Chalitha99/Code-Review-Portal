import { describe, expect, it } from 'vitest';
import { MAX_SCREENSHOT_BYTES } from '@sdp/contracts';
import { inspectImageDataUrl } from './image-data-url.js';

const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function dataUrl(mime: string, bytes: number[] | Buffer): string {
  return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
}

describe('inspectImageDataUrl', () => {
  it('accepts a real PNG and reports the decoded size, not a declared one', () => {
    const png = [...PNG_HEADER, 1, 2, 3, 4];
    expect(inspectImageDataUrl(dataUrl('image/png', png))).toEqual({
      ok: true,
      mimeType: 'image/png',
      sizeBytes: png.length,
    });
  });

  it.each([
    ['image/jpeg', [0xff, 0xd8, 0xff, 0xe0, 0, 0]],
    ['image/gif', [...Buffer.from('GIF89a'), 0, 0]],
    ['image/webp', [...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBP')]],
  ])('accepts %s by its magic number', (mime, bytes) => {
    expect(inspectImageDataUrl(dataUrl(mime, bytes))).toMatchObject({ ok: true, mimeType: mime });
  });

  it('rejects bytes that do not match the declared image type', () => {
    expect(inspectImageDataUrl(dataUrl('image/png', [0xff, 0xd8, 0xff, 0xe0]))).toEqual({
      ok: false,
      reason: 'wrongType',
    });
  });

  it('rejects types outside the allow-list, including SVG', () => {
    expect(inspectImageDataUrl(dataUrl('image/svg+xml', [...Buffer.from('<svg/>')]))).toEqual({
      ok: false,
      reason: 'wrongType',
    });
  });

  it.each([
    'javascript:alert(1)',
    'https://example.com/a.png',
    'data:image/png,not-base64',
    'data:image/png;charset=utf-8;base64,AAAA',
    'data:image/png;base64,',
  ])('rejects %s as malformed', (value) => {
    expect(inspectImageDataUrl(value)).toEqual({ ok: false, reason: 'malformed' });
  });

  it('rejects an image over 5 MB without decoding it', () => {
    const oversized = Buffer.alloc(MAX_SCREENSHOT_BYTES + 1);
    PNG_HEADER.forEach((byte, index) => oversized.writeUInt8(byte, index));
    expect(inspectImageDataUrl(dataUrl('image/png', oversized))).toEqual({
      ok: false,
      reason: 'tooLarge',
    });
  });
});
