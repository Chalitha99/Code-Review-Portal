import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  downloadScreenshot,
  generateDefaultScreenshotName,
  getNextScreenshotSequence,
  sanitizeBaseFilename,
  splitFilename,
} from '@/portals/code-review/components/screenshotNaming.ts';

const shots = (...names: string[]) => names.map((fileName) => ({ fileName }));

describe('getNextScreenshotSequence', () => {
  it('continues after the highest number, never reusing one after a deletion', () => {
    expect(getNextScreenshotSequence('BLOM-010', [])).toBe(1);
    expect(
      getNextScreenshotSequence(
        'BLOM-010',
        shots('BLOM-010-screenshot-1.png', 'blom-010-screenshot-4.jpg', 'screenshot-2.png'),
      ),
    ).toBe(5);
  });

  it('ignores names that do not follow the pattern', () => {
    expect(
      getNextScreenshotSequence('BLOM-010', shots('login-error.png', 'OTHER-screenshot-9.png')),
    ).toBe(1);
    expect(getNextScreenshotSequence(undefined, shots('task-screenshot-3.png'))).toBe(4);
  });
});

describe('generateDefaultScreenshotName', () => {
  it('builds {taskCode}-screenshot-{n}.{ext} from the original extension', () => {
    expect(
      generateDefaultScreenshotName('BLOM-010', shots('BLOM-010-screenshot-1.png'), {
        name: 'Capture.PNG',
      }),
    ).toBe('BLOM-010-screenshot-2.png');
  });

  it('falls back to a generic prefix and png when either is missing', () => {
    expect(generateDefaultScreenshotName('  ', [], { name: 'file.' })).toBe(
      'screenshot-screenshot-1.png',
    );
  });
});

describe('sanitizeBaseFilename and splitFilename', () => {
  it('replaces unsafe characters and whitespace', () => {
    expect(sanitizeBaseFilename('  login / error: "x"?  ')).toBe('login---error---x--');
  });

  it('splits on the last dot, leaving dotfiles and extensionless names whole', () => {
    expect(splitFilename('a.b.png')).toEqual({ baseName: 'a.b', extension: 'png' });
    expect(splitFilename('.env')).toEqual({ baseName: '.env', extension: '' });
    expect(splitFilename('README')).toEqual({ baseName: 'README', extension: '' });
  });
});

describe('downloadScreenshot', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('downloads through a temporary link that keeps the visible filename', () => {
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    downloadScreenshot({ storageRef: 'blob:abc', fileName: 'BLOM-010-screenshot-1.png' });

    expect(click).toHaveBeenCalledTimes(1);
    const link = click.mock.contexts[0] as HTMLAnchorElement;
    expect(link.download).toBe('BLOM-010-screenshot-1.png');
    expect(document.body.contains(link)).toBe(false);
  });
});
