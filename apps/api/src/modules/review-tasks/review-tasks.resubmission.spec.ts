import { TaskStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { RoleCode } from '../auth/auth.constants.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { ReviewTasksService } from './review-tasks.service.js';

/*
 * Resubmission routing and the follow-up-reviewer transfer
 * (docs/25-review-assignment-rules.md).
 */

const TASK_ID = '00000000-0000-4000-8000-000000000010';
const REQUESTER_ID = '00000000-0000-4000-8000-000000000020';
const FOLLOW_UP_ID = '00000000-0000-4000-8000-000000000021';

function actor(roles: RoleCode[]): AuthenticatedUser {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'person@example.com',
    name: 'Person',
    roles,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    sessionId: 'session',
  };
}

function storedTask(overrides: Record<string, unknown> = {}) {
  return {
    id: TASK_ID,
    taskCode: 'TEST-01',
    title: 'Test task',
    crimId: 'CRIM-1',
    version: '0',
    customerId: '00000000-0000-4000-8000-000000000030',
    priority: 'MEDIUM',
    status: TaskStatus.CHANGES_REQUESTED,
    currentReviewCycle: 1,
    developerId: actor(['DEVELOPER']).id,
    currentReviewerId: null,
    resubmissionReviewerId: null,
    noteToReviewer: null,
    checklistCompleted: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    submittedAt: new Date('2026-01-01T01:00:00.000Z'),
    customer: { name: 'Test', code: 'TEST', color: '#123456' },
    developer: { fullName: 'Developer' },
    currentReviewer: null,
    reviewerAssignments: [],
    taskTypes: [],
    developerChecklist: { additionalRemarks: '', answers: [] },
    codeReviewForms: [{ reviewerId: REQUESTER_ID, decision: 'CHANGES_REQUESTED' }],
    reviewCycles: [{ roundNumber: 1, counted: true, exclusionReason: null }],
    handovers: [],
    ...overrides,
  };
}

function services(prisma: unknown) {
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const notifications = {
    create: vi.fn().mockResolvedValue(undefined),
    createMany: vi.fn().mockResolvedValue(undefined),
    queueEmailForTriggerRows: vi.fn().mockResolvedValue(1),
  };
  const service = new ReviewTasksService(prisma as never, audit as never, notifications as never);
  return { audit, notifications, service };
}

function resubmitHarness(options: {
  resubmissionReviewerId?: string | null;
  followUp: { id: string; fullName: string; status: string; reviewerRoles: number };
  handovers?: unknown[];
}) {
  const baseTask = storedTask({ resubmissionReviewerId: options.resubmissionReviewerId ?? null });
  const tx = {
    auditLog: { count: vi.fn().mockResolvedValue(1) },
    taskReviewerAssignment: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn().mockResolvedValue({ id: 'assignment' }),
    },
    notification: {
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    taskStatusHistory: { create: vi.fn().mockResolvedValue({}) },
    user: { findMany: vi.fn().mockResolvedValue([{ id: 'admin-1' }]) },
    task: {
      update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(
          storedTask({
            ...data,
            status: (data['status'] as TaskStatus | undefined) ?? TaskStatus.RESUBMITTED,
            handovers: options.handovers ?? [],
          }),
        ),
      ),
    },
  };
  const prisma = {
    task: { findUnique: vi.fn().mockResolvedValue(baseTask) },
    codeReviewForm: {
      findFirst: vi.fn().mockResolvedValue({ reviewerId: REQUESTER_ID, findings: [] }),
    },
    developerFindingResponse: { findMany: vi.fn().mockResolvedValue([]) },
    user: {
      findUnique: vi.fn().mockResolvedValue({
        id: options.followUp.id,
        fullName: options.followUp.fullName,
        status: options.followUp.status,
        deletedAt: null,
        userRoles: Array.from({ length: options.followUp.reviewerRoles }, () => ({ roleId: 2 })),
      }),
    },
    $transaction: vi.fn((operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
  };
  return { prisma, tx, ...services(prisma) };
}

describe('resubmission routing', () => {
  it('sends the resubmission to the admin-chosen follow-up reviewer and clears the choice', async () => {
    const developer = actor(['DEVELOPER']);
    const { prisma, service, tx } = resubmitHarness({
      resubmissionReviewerId: FOLLOW_UP_ID,
      followUp: { id: FOLLOW_UP_ID, fullName: 'Follow Up', status: 'ACTIVE', reviewerRoles: 1 },
    });

    await service.submit(TASK_ID, developer);

    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: FOLLOW_UP_ID } }),
    );
    expect(tx.task.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ data: expect.objectContaining({ resubmissionReviewerId: null }) }),
    );
    expect(tx.task.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          status: TaskStatus.IN_REVIEW,
          currentReviewerId: FOLLOW_UP_ID,
        }),
      }),
    );
  });

  it('falls back to the pool when the follow-up reviewer is no longer eligible, keeping the trail', async () => {
    const developer = actor(['DEVELOPER']);
    const { audit, notifications, service, tx } = resubmitHarness({
      followUp: {
        id: REQUESTER_ID,
        fullName: 'Gone Reviewer',
        status: 'INACTIVE',
        reviewerRoles: 1,
      },
    });

    await expect(service.submit(TASK_ID, developer)).resolves.toMatchObject({
      status: 'ReSubmitted',
      reviewerId: null,
    });

    // It stays ReSubmitted with no reviewer — the open pool — never InReview.
    expect(tx.task.update).toHaveBeenCalledTimes(1);
    expect(tx.taskReviewerAssignment.create).not.toHaveBeenCalled();
    expect(tx.taskStatusHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        remarks: 'Original reviewer Gone Reviewer unavailable; returned to the review pool',
      }),
    });
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      developer,
      expect.objectContaining({
        actionType: 'RESUBMISSION_REVIEWER_UNAVAILABLE',
        metadata: expect.objectContaining({
          previousReviewerId: REQUESTER_ID,
          previousReviewerName: 'Gone Reviewer',
        }),
      }),
    );
    expect(notifications.createMany).toHaveBeenCalledWith(tx, [
      expect.objectContaining({ recipientId: 'admin-1', type: 'TASK_RESUBMITTED' }),
    ]);
  });

  it('treats a follow-up reviewer who lost the Reviewer role as unavailable', async () => {
    const { service, tx } = resubmitHarness({
      followUp: { id: REQUESTER_ID, fullName: 'Now Developer', status: 'ACTIVE', reviewerRoles: 0 },
    });

    await service.submit(TASK_ID, actor(['DEVELOPER']));

    expect(tx.taskReviewerAssignment.create).not.toHaveBeenCalled();
  });
});

describe('resubmission response', () => {
  const followUp = { id: FOLLOW_UP_ID, fullName: 'Follow Up', status: 'ACTIVE', reviewerRoles: 1 };
  const resubmit = (handovers: unknown[]) =>
    resubmitHarness({ resubmissionReviewerId: FOLLOW_UP_ID, followUp, handovers }).service.submit(
      TASK_ID,
      actor(['DEVELOPER']),
    );

  it('serializes a task with no handover history', async () => {
    await expect(resubmit([])).resolves.toMatchObject({
      status: 'InReview',
      reviewerId: FOLLOW_UP_ID,
      handedOverByName: null,
    });
  });

  it('names the reviewer who handed the task over', async () => {
    await expect(
      resubmit([{ status: 'REASSIGNED', fromReviewer: { fullName: 'Earlier Reviewer' } }]),
    ).resolves.toMatchObject({ handedOverByName: 'Earlier Reviewer' });
  });

  it('does not fail when a handover row carries no reviewer relation', async () => {
    await expect(resubmit([{ status: 'REASSIGNED' }])).resolves.toMatchObject({
      handedOverByName: null,
    });
  });
});

describe('changeResubmissionReviewer', () => {
  const requester = { id: REQUESTER_ID, fullName: 'Requester' };
  const newReviewer = { id: '00000000-0000-4000-8000-000000000022', fullName: 'New Reviewer' };

  function harness(status: TaskStatus = TaskStatus.CHANGES_REQUESTED) {
    const tx = {
      task: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({
            id: TASK_ID,
            title: 'Test task',
            status,
            developerId: 'developer-1',
            resubmissionReviewerId: null,
            codeReviewForms: [{ reviewer: requester }],
          })
          .mockResolvedValueOnce(storedTask({ resubmissionReviewerId: newReviewer.id })),
        update: vi.fn().mockResolvedValue({}),
      },
      user: {
        findFirst: vi.fn().mockResolvedValue(newReviewer),
        findUnique: vi.fn().mockResolvedValue({ fullName: requester.fullName }),
      },
      taskStatusHistory: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: vi.fn((operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
    };
    return { tx, ...services(prisma) };
  }

  it('records the new follow-up reviewer with history, audit and a notification', async () => {
    const admin = actor(['ADMIN']);
    const { audit, notifications, service, tx } = harness();

    await service.changeResubmissionReviewer(
      TASK_ID,
      newReviewer.id,
      admin,
      'Requester is leaving',
    );

    expect(tx.task.update).toHaveBeenCalledWith({
      where: { id: TASK_ID },
      data: { resubmissionReviewerId: newReviewer.id },
    });
    expect(tx.taskStatusHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        remarks: 'Follow-up reviewer changed from Requester to New Reviewer: Requester is leaving',
      }),
    });
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      admin,
      expect.objectContaining({
        actionType: 'RESUBMISSION_REVIEWER_CHANGED',
        oldValue: { reviewerId: REQUESTER_ID, reviewerName: 'Requester' },
        newValue: { reviewerId: newReviewer.id, reviewerName: 'New Reviewer' },
      }),
    );
    expect(notifications.createMany).toHaveBeenCalledWith(
      tx,
      expect.arrayContaining([
        expect.objectContaining({
          recipientId: newReviewer.id,
          email: expect.objectContaining({ event: 'FOLLOW_UP_REVIEWER_CHANGED' }),
        }),
      ]),
    );
  });

  it('requires a reason', async () => {
    await expect(
      harness().service.changeResubmissionReviewer(TASK_ID, newReviewer.id, actor(['ADMIN'])),
    ).rejects.toMatchObject({ code: 'REASON_REQUIRED' });
  });

  it('only applies to a task awaiting resubmission', async () => {
    await expect(
      harness(TaskStatus.IN_REVIEW).service.changeResubmissionReviewer(
        TASK_ID,
        newReviewer.id,
        actor(['ADMIN']),
        'x',
      ),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });
});
