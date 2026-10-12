import { describe, expect, it } from 'vitest';
import { assertProtectedCommentUnchanged, isEditableFinding } from './reviews.service.js';

const FORM = 'form-current';
const ME = 'reviewer-me';
const SESSION = 'session-now';

describe('isEditableFinding', () => {
  it('lets a reviewer edit only their own comment from this session on this round', () => {
    expect(
      isEditableFinding(
        { reviewFormId: FORM, createdBy: ME, reviewSessionId: SESSION },
        FORM,
        ME,
        SESSION,
      ),
    ).toBe(true);
  });

  it.each([
    ['another reviewer', { reviewFormId: FORM, createdBy: 'other', reviewSessionId: SESSION }],
    [
      'an earlier session of the same reviewer',
      { reviewFormId: FORM, createdBy: ME, reviewSessionId: 'old' },
    ],
    ['an earlier round', { reviewFormId: 'form-old', createdBy: ME, reviewSessionId: SESSION }],
  ])('treats a comment from %s as read-only', (_label, finding) => {
    expect(isEditableFinding(finding, FORM, ME, SESSION)).toBe(false);
  });
});

describe('assertProtectedCommentUnchanged', () => {
  const stored = { commentText: 'Rename this', screenshots: [{ id: 'shot-1' }] };
  const same = (id: string) => `shot-${id}`;

  it('accepts a read-only comment sent back unchanged (whitespace aside)', () => {
    expect(() =>
      assertProtectedCommentUnchanged(
        stored,
        { text: ' Rename this ', screenshots: [{ id: '1' }] },
        same,
      ),
    ).not.toThrow();
  });

  it('refuses edited text with 403', () => {
    expect(() =>
      assertProtectedCommentUnchanged(
        stored,
        { text: 'Changed', screenshots: [{ id: '1' }] },
        same,
      ),
    ).toThrow(expect.objectContaining({ code: 'FORBIDDEN', status: 403 }));
  });

  it('refuses added or removed screenshots with 403', () => {
    expect(() =>
      assertProtectedCommentUnchanged(stored, { text: 'Rename this', screenshots: [] }, same),
    ).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
    expect(() =>
      assertProtectedCommentUnchanged(
        stored,
        { text: 'Rename this', screenshots: [{ id: '1' }, { id: '2' }] },
        same,
      ),
    ).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
  });
});
