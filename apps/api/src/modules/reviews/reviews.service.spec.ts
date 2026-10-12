import { DeveloperDecision, NotificationType, ReviewerDecision } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  reviewDraftInputSchema,
  hasValidDeveloperRejectionReason,
  reviewRoundToStart,
  shouldCountReviewCycle,
  stableReviewEntityUuid,
  unrelatedReviewNotificationWhere,
} from './reviews.service.js';

const baseDraft = {
  rank: null,
  generalCheck: [],
  findings: { incorrectCode: '', incompleteImplementation: '', sourceFormatting: '' },
  otherRemarks: '',
  feedbackSummary: '',
};

describe('ReviewsService draft input', () => {
  it('accepts an incomplete blank comment while the review is still a draft', () => {
    const result = reviewDraftInputSchema.safeParse({
      ...baseDraft,
      comments: [
        {
          id: 'rc-client-1',
          reviewCycle: 1,
          text: '',
          screenshots: [],
          createdAt: '2026-10-06T00:00:00.000Z',
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it('maps a client-generated id to the same database UUID on every autosave', () => {
    const namespace = '00000000-0000-4000-8000-000000000001:finding:rc-client-1';
    const first = stableReviewEntityUuid(namespace);
    const second = stableReviewEntityUuid(namespace);

    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('preserves a valid database UUID returned by a previous save', () => {
    const id = '122f5c16-7522-4b2e-b9b4-a6ac68fbf713';
    expect(stableReviewEntityUuid(id)).toBe(id);
  });
});

describe('counted-cycle decision matrix', () => {
  const decision = (
    developerDecision: DeveloperDecision,
    reviewerDecision: ReviewerDecision = ReviewerDecision.ACCEPTED,
  ) => ({ developerDecision, reviewerDecision });

  it.each([
    ['scenario 1: direct approval creates no cycle', 0, [], true],
    [
      'scenario 2: resolved finding remains counted',
      1,
      [decision(DeveloperDecision.RESOLVED)],
      true,
    ],
    [
      'scenario 3: repeated valid changes remain counted',
      1,
      [decision(DeveloperDecision.RESOLVED)],
      true,
    ],
    [
      'scenario 4: sole rejection accepted is excluded',
      1,
      [decision(DeveloperDecision.REJECTED)],
      false,
    ],
    [
      'scenario 5: sole rejection overruled remains counted',
      1,
      [decision(DeveloperDecision.REJECTED, ReviewerDecision.REJECTED)],
      true,
    ],
    [
      'scenario 6: mixed resolve/reject remains counted',
      3,
      [
        decision(DeveloperDecision.REJECTED),
        decision(DeveloperDecision.RESOLVED),
        decision(DeveloperDecision.RESOLVED),
      ],
      true,
    ],
    [
      'scenario 7: all rejections accepted is excluded',
      3,
      [
        decision(DeveloperDecision.REJECTED),
        decision(DeveloperDecision.REJECTED),
        decision(DeveloperDecision.REJECTED),
      ],
      false,
    ],
    [
      'scenario 8: one rejection overruled remains counted',
      3,
      [
        decision(DeveloperDecision.REJECTED),
        decision(DeveloperDecision.REJECTED),
        decision(DeveloperDecision.REJECTED, ReviewerDecision.REJECTED),
      ],
      true,
    ],
    [
      'scenario 9: mixed fixes plus overruled rejection remains counted',
      3,
      [
        decision(DeveloperDecision.REJECTED, ReviewerDecision.REJECTED),
        decision(DeveloperDecision.RESOLVED),
        decision(DeveloperDecision.RESOLVED),
      ],
      true,
    ],
  ])('%s', (_name, findingCount, decisions, expected) => {
    expect(shouldCountReviewCycle(findingCount, decisions)).toBe(expected);
  });

  it('preserves the existing state while any response or verdict is missing', () => {
    expect(shouldCountReviewCycle(2, [decision(DeveloperDecision.REJECTED)])).toBe(true);
    expect(
      shouldCountReviewCycle(1, [decision(DeveloperDecision.REJECTED, ReviewerDecision.PENDING)]),
    ).toBe(true);
  });
});

describe('review-round progression', () => {
  it('starts at zero and increments only when a new review actually starts', () => {
    let round = 0;
    expect(round).toBe(0); // initial submission and pickup
    round = reviewRoundToStart(round, false);
    expect(round).toBe(1); // first draft/decision
    expect(reviewRoundToStart(round, true)).toBe(1); // autosave/retry
    expect(round).toBe(1); // Request Changes and resubmission do not advance it
    round = reviewRoundToStart(round, false);
    expect(round).toBe(2); // actual re-review starts
    expect(reviewRoundToStart(round, true)).toBe(2);
    round = reviewRoundToStart(round, false);
    expect(round).toBe(3);
  });

  it('never derives or reduces the round from a counted-cycle value', () => {
    expect(reviewRoundToStart(2, true)).toBe(2);
    expect(reviewRoundToStart(2, false)).toBe(3);
  });
});

describe('developer rejection validation', () => {
  it('blocks empty and whitespace-only rejection reasons server-side', () => {
    expect(hasValidDeveloperRejectionReason('Rejected', undefined)).toBe(false);
    expect(hasValidDeveloperRejectionReason('Rejected', '')).toBe(false);
    expect(hasValidDeveloperRejectionReason('Rejected', '   ')).toBe(false);
  });

  it('accepts a non-empty rejection reason and does not require one for Resolve', () => {
    expect(hasValidDeveloperRejectionReason('Rejected', 'Not applicable to this CRIM')).toBe(true);
    expect(hasValidDeveloperRejectionReason('Resolved', undefined)).toBe(true);
  });
});

describe('review notification recipients', () => {
  const taskId = '00000000-0000-4000-8000-000000000010';
  const developerId = '00000000-0000-4000-8000-000000000020';

  it('keeps approval notifications for the Developer and Admins only', () => {
    expect(
      unrelatedReviewNotificationWhere(taskId, developerId, NotificationType.TASK_APPROVED, [
        'existing-notification',
      ]),
    ).toEqual({
      taskId,
      notificationType: NotificationType.TASK_APPROVED,
      NOT: {
        OR: [
          { recipientId: developerId },
          {
            recipient: {
              userRoles: {
                some: {
                  role: { code: { in: ['ADMIN', 'SUPER_ADMIN'] }, deletedAt: null },
                },
              },
            },
          },
        ],
      },
      id: { notIn: ['existing-notification'] },
    });
  });

  it('keeps Request Changes notifications for the relevant Developer only', () => {
    expect(
      unrelatedReviewNotificationWhere(taskId, developerId, NotificationType.CHANGES_REQUESTED, [
        'existing-notification',
      ]),
    ).toEqual({
      taskId,
      notificationType: NotificationType.CHANGES_REQUESTED,
      NOT: { recipientId: developerId },
      id: { notIn: ['existing-notification'] },
    });
  });
});
