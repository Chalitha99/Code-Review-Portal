import {
  HandoverStatus,
  NotificationType,
  Prisma,
  ReviewerAssignmentType,
  TaskStatus,
} from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { ReviewTasksService } from '../review-tasks/review-tasks.service.js';
import { HandoversService } from './handovers.service.js';

const actor: AuthenticatedUser = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'admin@example.com',
  name: 'Admin User',
  roles: ['ADMIN'],
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  sessionId: 'session',
};

describe('HandoversService.reassign', () => {
  it('retries a transient conflict and resolves all pending rows when reassigning', async () => {
    const handoverId = '00000000-0000-0000-0000-000000000010';
    const taskId = '00000000-0000-0000-0000-000000000020';
    const previousReviewer = {
      id: '00000000-0000-0000-0000-000000000030',
      fullName: 'Previous Reviewer',
    };
    const reviewer = {
      id: previousReviewer.id,
      fullName: previousReviewer.fullName,
    };
    const requestedAt = new Date('2026-09-29T08:00:00.000Z');
    const reassignedAt = new Date('2026-09-29T09:00:00.000Z');
    const existing = {
      id: handoverId,
      taskId,
      fromReviewerId: previousReviewer.id,
      reason: 'Unavailable this week',
      status: HandoverStatus.PENDING,
      task: {
        id: taskId,
        title: 'Task under review',
        developerId: '00000000-0000-0000-0000-000000000099',
        status: TaskStatus.SUBMITTED,
        currentReviewCycle: 1,
      },
      fromReviewer: previousReviewer,
    };
    const updated = {
      ...existing,
      status: HandoverStatus.REASSIGNED,
      toReviewerId: reviewer.id,
      reassignedBy: actor.id,
      requestedAt,
      reassignedAt,
      toReviewer: reviewer,
    };
    const tx = {
      handoverTask: {
        findUnique: vi.fn().mockResolvedValueOnce(existing).mockResolvedValueOnce(updated),
        updateMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
      user: { findFirst: vi.fn().mockResolvedValue(reviewer) },
      task: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      taskReviewerAssignment: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn().mockResolvedValue({ id: '00000000-0000-4000-8000-000000000301' }),
      },
      codeReviewForm: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      taskStatusHistory: { create: vi.fn().mockResolvedValue({}) },
    };
    const audit = { record: vi.fn().mockResolvedValue(undefined) };
    const writeConflict = new Prisma.PrismaClientKnownRequestError(
      'Transaction failed due to a write conflict',
      { code: 'P2034', clientVersion: 'test' },
    );
    const transaction = vi
      .fn()
      .mockRejectedValueOnce(writeConflict)
      .mockImplementation((operation: (client: typeof tx) => Promise<unknown>) => operation(tx));
    const prisma = { $transaction: transaction };
    const notifications = {
      create: vi.fn().mockResolvedValue({}),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    };
    const service = new HandoversService(prisma as never, audit as never, notifications as never);

    await expect(service.reassign(handoverId, { reviewerId: reviewer.id }, actor)).resolves.toEqual(
      {
        id: handoverId,
        taskId,
        fromReviewerId: previousReviewer.id,
        fromReviewerName: previousReviewer.fullName,
        reason: existing.reason,
        status: 'Reassigned',
        reassignedToId: reviewer.id,
        reassignedToName: reviewer.fullName,
        reassignedById: actor.id,
        createdAt: requestedAt.toISOString(),
        resolvedAt: reassignedAt.toISOString(),
      },
    );
    expect(tx.taskReviewerAssignment.create).toHaveBeenCalledWith({
      data: {
        taskId,
        reviewerId: reviewer.id,
        assignedBy: actor.id,
        assignmentType: ReviewerAssignmentType.HANDOVER_REASSIGNED,
      },
    });
    expect(tx.handoverTask.updateMany).toHaveBeenCalledWith({
      where: { taskId, status: HandoverStatus.PENDING },
      data: {
        status: HandoverStatus.REASSIGNED,
        toReviewerId: reviewer.id,
        reassignedBy: actor.id,
        reassignedAt: expect.any(Date),
      },
    });
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      actor,
      expect.objectContaining({
        actionType: 'HANDOVER_REASSIGNED',
        targetUserId: reviewer.id,
        oldValue: expect.objectContaining({
          reviewerName: previousReviewer.fullName,
          reason: existing.reason,
        }),
        newValue: expect.objectContaining({ reviewerName: reviewer.fullName }),
      }),
    );
    expect(notifications.createMany).toHaveBeenCalledWith(
      tx,
      expect.arrayContaining([
        expect.objectContaining({
          taskId,
          recipientId: reviewer.id,
          type: NotificationType.TASK_ASSIGNED,
          title: 'Task under review reassigned to you',
          email: expect.objectContaining({ event: 'HANDOVER_REASSIGNED', reviewerId: reviewer.id }),
        }),
        expect.objectContaining({
          recipientId: existing.task.developerId,
          type: NotificationType.TASK_ASSIGNED,
          email: expect.objectContaining({ event: 'HANDOVER_REASSIGNED' }),
        }),
      ]),
    );
    expect(notifications.createMany).toHaveBeenCalledTimes(1);
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it('preserves three consecutive handovers and allows Admin reassignment afterward', async () => {
    const taskId = '00000000-0000-0000-0000-000000000020';
    const developerId = '00000000-0000-0000-0000-000000000099';
    const reviewers = [
      {
        id: '00000000-0000-0000-0000-000000000031',
        name: 'Reviewer A',
      },
      {
        id: '00000000-0000-0000-0000-000000000032',
        name: 'Reviewer B',
      },
      {
        id: '00000000-0000-0000-0000-000000000033',
        name: 'Reviewer C',
      },
    ].map(({ id, name }): AuthenticatedUser => ({
      id,
      name,
      email: `${name.toLowerCase().replace(' ', '.')}@example.com`,
      roles: ['REVIEWER'],
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      sessionId: `session-${id}`,
    }));
    const reviewerNames = new Map(reviewers.map((reviewer) => [reviewer.id, reviewer.name]));
    const state: { status: TaskStatus; currentReviewerId: string | null } = {
      status: TaskStatus.IN_REVIEW,
      currentReviewerId: reviewers[0]!.id,
    };
    const handoverRows: {
      id: string;
      taskId: string;
      fromReviewerId: string;
      toReviewerId: string | null;
      reason: string;
      status: HandoverStatus;
      requestedAt: Date;
      reassignedBy: string | null;
      reassignedAt: Date | null;
    }[] = [];
    const assignments: {
      reviewerId: string;
      isCurrent: boolean;
      unassignedAt: Date | null;
    }[] = [{ reviewerId: reviewers[0]!.id, isCurrent: true, unassignedAt: null }];

    const taskResponse = () => ({
      id: taskId,
      taskCode: 'TEST-01',
      title: 'Repeatable handover task',
      crimId: 'CRIM-1',
      version: '1',
      customerId: '00000000-0000-0000-0000-000000000040',
      priority: 'MEDIUM',
      status: state.status,
      currentReviewCycle: 1,
      developerId,
      currentReviewerId: state.currentReviewerId,
      checklistCompleted: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      submittedAt: new Date('2026-01-01T01:00:00.000Z'),
      customer: { name: 'Test', code: 'TEST', color: '#123456' },
      developer: { fullName: 'Developer' },
      currentReviewer:
        state.currentReviewerId === null
          ? null
          : { fullName: reviewerNames.get(state.currentReviewerId) ?? 'Reviewer' },
      taskTypes: [],
      developerChecklist: null,
      codeReviewForms: [],
      handovers: handoverRows
        .slice()
        .reverse()
        .map((handover) => ({
          status: handover.status,
          fromReviewer: {
            fullName: reviewerNames.get(handover.fromReviewerId) ?? 'Reviewer',
          },
        })),
    });
    const selectedTask = () => ({
      id: taskId,
      title: 'Repeatable handover task',
      status: state.status,
      currentReviewCycle: 1,
      developerId,
      currentReviewerId: state.currentReviewerId,
      currentReviewer:
        state.currentReviewerId === null
          ? null
          : { fullName: reviewerNames.get(state.currentReviewerId) ?? 'Reviewer' },
      handovers: handoverRows
        .filter((handover) => handover.status === HandoverStatus.PENDING)
        .slice(-1)
        .map((handover) => ({
          id: handover.id,
          reason: handover.reason,
          fromReviewerId: handover.fromReviewerId,
          fromReviewer: {
            fullName: reviewerNames.get(handover.fromReviewerId) ?? 'Reviewer',
          },
        })),
    });
    const handoverResponse = (id: string) => {
      const handover = handoverRows.find((row) => row.id === id);
      if (!handover) return null;
      return {
        ...handover,
        task: {
          id: taskId,
          title: 'Repeatable handover task',
          developerId,
          status: state.status,
          currentReviewCycle: 1,
        },
        fromReviewer: {
          id: handover.fromReviewerId,
          fullName: reviewerNames.get(handover.fromReviewerId) ?? 'Reviewer',
        },
        toReviewer:
          handover.toReviewerId === null
            ? null
            : {
                id: handover.toReviewerId,
                fullName: reviewerNames.get(handover.toReviewerId) ?? 'Reviewer',
              },
      };
    };

    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      task: {
        findUnique: vi.fn((args: { select?: unknown }) =>
          Promise.resolve(args.select ? selectedTask() : taskResponse()),
        ),
        updateMany: vi.fn(
          (args: { data: { currentReviewerId: string | null; status: TaskStatus } }) => {
            if (args.data.currentReviewerId === null && state.status !== TaskStatus.IN_REVIEW) {
              return Promise.resolve({ count: 0 });
            }
            if (args.data.currentReviewerId !== null && state.currentReviewerId !== null) {
              return Promise.resolve({ count: 0 });
            }
            state.currentReviewerId = args.data.currentReviewerId;
            state.status = args.data.status;
            return Promise.resolve({ count: 1 });
          },
        ),
      },
      handoverTask: {
        create: vi.fn(
          (args: {
            data: {
              taskId: string;
              fromReviewerId: string;
              reason: string;
              status: HandoverStatus;
            };
          }) => {
            const row = {
              id: `00000000-0000-0000-0000-00000000004${String(handoverRows.length + 1)}`,
              ...args.data,
              toReviewerId: null,
              requestedAt: new Date(`2026-01-0${String(handoverRows.length + 2)}T00:00:00.000Z`),
              reassignedBy: null,
              reassignedAt: null,
            };
            handoverRows.push(row);
            return Promise.resolve(row);
          },
        ),
        updateMany: vi.fn(
          (args: {
            where: { taskId: string; status: HandoverStatus };
            data: {
              status: HandoverStatus;
              toReviewerId: string;
              reassignedBy: string;
              reassignedAt: Date;
            };
          }) => {
            const rows = handoverRows.filter(
              (candidate) =>
                candidate.taskId === args.where.taskId && candidate.status === args.where.status,
            );
            for (const row of rows) Object.assign(row, args.data);
            return Promise.resolve({ count: rows.length });
          },
        ),
        findUnique: vi.fn((args: { where: { id: string } }) =>
          Promise.resolve(handoverResponse(args.where.id)),
        ),
      },
      taskReviewerAssignment: {
        updateMany: vi.fn((_args: unknown) => {
          for (const assignment of assignments.filter(({ isCurrent }) => isCurrent)) {
            assignment.isCurrent = false;
            assignment.unassignedAt = new Date();
          }
          return Promise.resolve({ count: 1 });
        }),
        create: vi.fn((args: { data: { reviewerId: string } }) => {
          assignments.push({
            reviewerId: args.data.reviewerId,
            isCurrent: true,
            unassignedAt: null,
          });
          return Promise.resolve({ id: crypto.randomUUID() });
        }),
      },
      codeReviewForm: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      taskStatusHistory: { create: vi.fn().mockResolvedValue({}) },
      user: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn((args: { where: { id: string } }) => {
          const reviewer = reviewers.find(({ id }) => id === args.where.id);
          return Promise.resolve(reviewer ? { id: reviewer.id, fullName: reviewer.name } : null);
        }),
      },
    };
    const prisma = {
      $transaction: vi.fn((operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
    };
    const audit = { record: vi.fn().mockResolvedValue(undefined) };
    const notifications = {
      create: vi.fn().mockResolvedValue({}),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    };
    const tasks = new ReviewTasksService(prisma as never, audit as never, notifications as never);
    const handovers = new HandoversService(prisma as never, audit as never, notifications as never);

    await tasks.handover(taskId, { reason: 'A handover' }, reviewers[0]!);
    await tasks.pick(taskId, reviewers[1]!);
    await tasks.handover(taskId, { reason: 'B handover' }, reviewers[1]!);
    await tasks.pick(taskId, reviewers[2]!);
    await tasks.handover(taskId, { reason: 'C handover' }, reviewers[2]!);
    await handovers.reassign(handoverRows[2]!.id, { reviewerId: reviewers[0]!.id }, actor);

    expect(state).toEqual({
      status: TaskStatus.IN_REVIEW,
      currentReviewerId: reviewers[0]!.id,
    });
    expect(handoverRows).toHaveLength(3);
    expect(handoverRows.map(({ fromReviewerId }) => fromReviewerId)).toEqual(
      reviewers.map(({ id }) => id),
    );
    expect(handoverRows.map(({ toReviewerId }) => toReviewerId)).toEqual([
      reviewers[1]!.id,
      reviewers[2]!.id,
      reviewers[0]!.id,
    ]);
    expect(handoverRows.every(({ status }) => status === HandoverStatus.REASSIGNED)).toBe(true);
    expect(assignments).toHaveLength(4);
    expect(assignments.filter(({ isCurrent }) => isCurrent)).toEqual([
      expect.objectContaining({ reviewerId: reviewers[0]!.id }),
    ]);
  });
});
