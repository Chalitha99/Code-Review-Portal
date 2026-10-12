import { describe, expect, it } from 'vitest';
import type { Review, Task } from '@sdp/contracts';
import { ROUTES } from '@/config/routes.ts';
import {
  buildReviewerTaskUrl,
  getLabelForReviewerPath,
  getReviewerReturnDestination,
  isValidReviewerReturnPath,
} from '@/portals/code-review/features/reviews/domain/reviewerNavigation.ts';

const ME = { id: 'u-rev', roles: ['Reviewer'] };

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 't-1',
    taskCode: 'AASL-001',
    title: 'AASL-CRIM-1',
    crimId: 'CRIM-1',
    version: null,
    customerId: 'c-aasl',
    priority: 'Medium',
    status: 'Submitted',
    reviewRound: 1,
    countedCycle: 1,
    adjustedCycles: [],
    developerId: 'u-dev',
    reviewerId: null,
    taskTypeIds: [],
    isChecklistComplete: true,
    isHandedOver: false,
    noteToReviewer: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    submittedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('isValidReviewerReturnPath', () => {
  it('accepts the four reviewer lists, with or without a query', () => {
    expect(isValidReviewerReturnPath(ROUTES.reviewer.root)).toBe(true);
    expect(isValidReviewerReturnPath(`${ROUTES.reviewer.history}?status=Approved`)).toBe(true);
  });

  it('lives under the portal prefix, so the bare legacy path is refused', () => {
    expect(ROUTES.reviewer.root.startsWith('/crp/')).toBe(true);
    expect(isValidReviewerReturnPath('/reviewer')).toBe(false);
  });

  it('refuses open redirects, other workspaces, detail pages and chained returns', () => {
    for (const path of [
      null,
      '',
      '   ',
      'https://evil.example/crp/reviewer',
      '//evil.example',
      '/crp/reviewer\\..',
      'javascript:alert(1)',
      ROUTES.developer.root,
      ROUTES.reviewer.task('t-1'),
      `${ROUTES.reviewer.myTasks}?returnTo=%2Fcrp%2Freviewer`,
    ]) {
      expect(isValidReviewerReturnPath(path)).toBe(false);
    }
  });
});

describe('getLabelForReviewerPath', () => {
  it('names each list', () => {
    expect(getLabelForReviewerPath(ROUTES.reviewer.myTasks)).toBe('Back to My Review Tasks');
    expect(getLabelForReviewerPath(ROUTES.reviewer.history)).toBe('Back to Review History');
    expect(getLabelForReviewerPath(ROUTES.reviewer.analytics)).toBe('Back to Analytics');
    expect(getLabelForReviewerPath(ROUTES.reviewer.root)).toBe('Back to Available Tasks');
    expect(getLabelForReviewerPath('/elsewhere')).toBe('Back to Reviewer Dashboard');
  });
});

describe('buildReviewerTaskUrl', () => {
  it('encodes a valid return path and drops an invalid one', () => {
    expect(buildReviewerTaskUrl('t-1', ROUTES.reviewer.myTasks)).toBe(
      `${ROUTES.reviewer.task('t-1')}?returnTo=${encodeURIComponent(ROUTES.reviewer.myTasks)}`,
    );
    expect(buildReviewerTaskUrl('t-1', '//evil')).toBe(ROUTES.reviewer.task('t-1'));
    expect(buildReviewerTaskUrl('t-1')).toBe(ROUTES.reviewer.task('t-1'));
  });
});

describe('getReviewerReturnDestination', () => {
  it('prefers an explicit, valid return path', () => {
    const searchParams = new URLSearchParams({ returnTo: ROUTES.reviewer.history });
    expect(getReviewerReturnDestination({ searchParams }).to).toBe(ROUTES.reviewer.history);
    expect(
      getReviewerReturnDestination({ locationStateReturnTo: ROUTES.reviewer.analytics }).to,
    ).toBe(ROUTES.reviewer.analytics);
  });

  it('falls back on the task relationship when there is no usable return path', () => {
    const invalid = new URLSearchParams({ returnTo: '%E0%A4%A' });
    expect(
      getReviewerReturnDestination({
        searchParams: invalid,
        task: task({ status: 'InReview', reviewerId: ME.id }),
        currentUser: ME,
      }).to,
    ).toBe(ROUTES.reviewer.myTasks);

    expect(
      getReviewerReturnDestination({
        task: task({ status: 'Approved' }),
        currentUser: ME,
        latestCompletedReview: { reviewerId: ME.id } as Review,
      }).to,
    ).toBe(ROUTES.reviewer.history);

    expect(getReviewerReturnDestination({ task: task(), currentUser: ME })).toEqual({
      to: ROUTES.reviewer.root,
      label: 'Back to Available Tasks',
    });
  });

  it('defaults to the reviewer dashboard', () => {
    expect(getReviewerReturnDestination({})).toEqual({
      to: ROUTES.reviewer.root,
      label: 'Back to Reviewer Dashboard',
    });
    expect(
      getReviewerReturnDestination({ task: task({ status: 'Cancelled' }), currentUser: ME }).label,
    ).toBe('Back to Reviewer Dashboard');
  });
});
