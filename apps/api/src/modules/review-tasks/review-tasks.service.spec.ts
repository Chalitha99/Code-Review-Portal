import { ForbiddenException } from '@nestjs/common';
import { HandoverStatus, ReviewerAssignmentType, TaskStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { RoleCode } from '../auth/auth.constants.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { deriveTaskReviewCycles, ReviewTasksService } from './review-tasks.service.js';

const audit = { record: vi.fn().mockResolvedValue(undefined) };
const notifications = {
  create: vi.fn().mockResolvedValue({}),
  createMany: vi.fn().mockResolvedValue({ count: 0 }),
  queueEmailForTriggerRows: vi.fn().mockResolvedValue(1),
};
const serviceWith = (prisma: unknown) =>
  new ReviewTasksService(prisma as never, audit as never, notifications as never);

function actor(roles: RoleCode[]): AuthenticatedUser {
  return {
    id: '122f5c16-7522-4b2e-b9b4-a6ac68fbf713',
    email: 'actor@example.com',
    name: 'Actor',
    roles,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    sessionId: 'session-id',
  };
}

describe('ReviewTasksService task versions', () => {
  it('increments versions within the matching Customer and CRIM ID only', async () => {
    const customerId = '00000000-0000-0000-0000-000000000020';
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ version: '1' }, { version: 'V5' }, { version: 'legacy' }])
      .mockResolvedValueOnce([]);
    const customer = { findUnique: vi.fn().mockResolvedValue({ code: 'CUST' }) };
    const service = serviceWith({ customer, task: { findMany } });

    await expect(service.nextVersion(customerId, ' CRIM-1001 ')).resolves.toEqual({
      version: 0,
      title: 'CUST-CRIM-1001-0',
    });
    await expect(service.nextVersion(customerId, 'CRIM-1001')).resolves.toEqual({
      version: 6,
      title: 'CUST-CRIM-1001-6',
    });
    await expect(service.nextVersion(customerId, ' Test 0 ')).resolves.toEqual({
      version: 0,
      title: 'CUST-Test-0-0',
    });
    expect(customer.findUnique).toHaveBeenCalledWith({
      where: { id: customerId },
      select: { code: true },
    });
    expect(findMany).toHaveBeenCalledWith({
      where: { customerId, crimId: { equals: 'CRIM-1001', mode: 'insensitive' } },
      select: { version: true },
    });
  });
});

describe('ReviewTasksService review round and counted-cycle projection', () => {
  it('keeps round and counted-cycle values independent', () => {
    const result = deriveTaskReviewCycles(3, [
      { roundNumber: 1, counted: true },
      { roundNumber: 2, counted: true },
    ]);

    expect(result).toEqual({ reviewCycle: 2, historicalCycle: 3, adjustedCycles: [] });
  });

  it('reports zero counted cycles without reducing or renumbering the round', () => {
    const result = deriveTaskReviewCycles(2, [{ roundNumber: 1, counted: false }]);

    expect(result).toEqual({ reviewCycle: 0, historicalCycle: 2, adjustedCycles: [1] });
  });

  it('starts at round zero with no counted cycles', () => {
    expect(deriveTaskReviewCycles(0, [])).toEqual({
      reviewCycle: 0,
      historicalCycle: 0,
      adjustedCycles: [],
    });
  });

  it('labels history before the first pick as round zero', async () => {
    const user = actor(['DEVELOPER']);
    const taskId = '00000000-0000-0000-0000-000000000031';
    const actions = [
      'TASK_CREATED',
      'TASK_SUBMITTED',
      'TASK_PICKED',
      'CHANGES_REQUESTED',
      'TASK_RESUBMITTED',
      'TASK_APPROVED',
    ];
    const service = serviceWith({
      task: {
        findUnique: vi.fn().mockResolvedValue({
          id: taskId,
          status: TaskStatus.APPROVED,
          developerId: user.id,
          handovers: [],
          codeReviewForms: [],
        }),
      },
      auditLog: {
        findMany: vi.fn().mockResolvedValue(
          actions.map((action, index) => ({
            id: `log-${String(index)}`,
            action,
            userId: user.id,
            actorName: user.name,
            metadata: null,
            newValues: null,
            createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)),
          })),
        ),
      },
    });

    const events = await service.findEvents(taskId, user);

    expect(events.map(({ kind, reviewCycle }) => [kind, reviewCycle])).toEqual([
      ['Created', 0],
      ['Submitted', 0],
      ['Picked', 1],
      ['ChangesRequested', 1],
      ['Resubmitted', 2],
      ['Approved', 2],
    ]);
  });
});

describe('ReviewTasksService list visibility', () => {
  it('limits the Admin list to tasks that have been submitted', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = serviceWith({ task: { findMany } });

    await service.findAll(actor(['ADMIN']), 'all');

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: { not: TaskStatus.DRAFT },
          submittedAt: { not: null },
        },
      }),
    );
  });

  it('limits the Developer list to tasks owned by that developer', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = serviceWith({ task: { findMany } });
    const user = actor(['DEVELOPER']);

    await service.findAll(user, 'mine');

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { developerId: user.id } }),
    );
  });

  it('excludes a dual-role user own tasks and drafts from Reviewer queues', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = serviceWith({ task: { findMany } });
    const user = actor(['DEVELOPER', 'REVIEWER']);

    await service.findAll(user, 'available');
    await service.findAll(user, 'assigned');
    await service.findAll(user, 'history');

    expect(findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          developerId: { not: user.id },
          currentReviewerId: null,
          status: { in: [TaskStatus.SUBMITTED, TaskStatus.RESUBMITTED] },
        },
      }),
    );
    expect(findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          developerId: { not: user.id },
          currentReviewerId: user.id,
          status: TaskStatus.IN_REVIEW,
        },
      }),
    );
    expect(findMany).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        where: {
          developerId: { not: user.id },
          status: { not: TaskStatus.DRAFT },
          codeReviewForms: { some: { reviewerId: user.id, decision: { not: null } } },
          NOT: { currentReviewerId: user.id, status: TaskStatus.IN_REVIEW },
        },
      }),
    );
  });

  it('does not let a caller widen their task scope', async () => {
    const service = serviceWith({ task: { findMany: vi.fn() } });

    await expect(service.findAll(actor(['DEVELOPER']), 'all')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.findAll(actor(['DEVELOPER']), 'available')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('blocks a Reviewer from opening another developer draft directly', async () => {
    const user = actor(['REVIEWER']);
    const service = serviceWith({
      task: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'task-id',
          developerId: 'another-developer',
          currentReviewerId: user.id,
          status: TaskStatus.DRAFT,
          codeReviewForms: [],
          handovers: [],
        }),
      },
    });

    // 404, not 403: a guessed id must not confirm that a draft exists.
    await expect(service.findOne('task-id', user)).rejects.toMatchObject({
      code: 'TASK_NOT_FOUND',
    });
  });

  it('hides a developer draft from an Admin too', async () => {
    const user = actor(['ADMIN']);
    const service = serviceWith({
      task: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'task-id',
          developerId: 'another-developer',
          currentReviewerId: null,
          status: TaskStatus.DRAFT,
          codeReviewForms: [],
          handovers: [],
        }),
      },
    });

    await expect(service.findOne('task-id', user)).rejects.toMatchObject({
      code: 'TASK_NOT_FOUND',
    });
  });
});
describe('ReviewTasksService draft checklist', () => {
  it('returns partial saved answers so an owned draft can be restored', async () => {
    const user = actor(['DEVELOPER']);
    const updatedAt = new Date('2026-02-01T10:00:00.000Z');
    const findUnique = vi.fn().mockResolvedValue({
      id: '00000000-0000-0000-0000-000000000010',
      developerId: user.id,
      currentReviewerId: null,
      status: TaskStatus.DRAFT,
      checklistCompleted: false,
      taskTypes: [{ taskTypeId: 4 }],
      codeReviewForms: [],
      handovers: [],
      developerChecklist: {
        id: '00000000-0000-0000-0000-000000000020',
        developerId: user.id,
        additionalRemarks: 'One answer so far',
        checkedDate: null,
        updatedAt,
        answers: [
          {
            questionId: '00000000-0000-0000-0000-000000000030',
            answer: 'NO',
            question: {
              questionText: 'Has the report been checked?',
              section: { name: 'Quick Reports' },
            },
          },
        ],
      },
    });
    const service = serviceWith({ task: { findUnique } });

    await expect(
      service.findChecklist('00000000-0000-0000-0000-000000000010', user),
    ).resolves.toEqual({
      id: '00000000-0000-0000-0000-000000000020',
      taskId: '00000000-0000-0000-0000-000000000010',
      taskTypeIds: ['4'],
      answers: [
        {
          questionId: '00000000-0000-0000-0000-000000000030',
          answer: 'No',
          questionText: 'Has the report been checked?',
          categoryName: 'Quick Reports',
          order: 0,
        },
      ],
      remarks: 'One answer so far',
      isComplete: false,
      checkedDate: updatedAt.toISOString(),
      developerId: user.id,
    });
  });
});

describe('ReviewTasksService draft discard', () => {
  const taskId = '00000000-0000-4000-8000-000000000010';

  function deletionPrisma(
    task: {
      developerId: string;
      status: TaskStatus;
      submittedAt: Date | null;
    },
    evidence: { submissions?: number; decided?: number; assignments?: number } = {},
  ) {
    const tx = {
      auditLog: { count: vi.fn().mockResolvedValue(evidence.submissions ?? 0) },
      codeReviewForm: {
        count: vi
          .fn()
          .mockResolvedValueOnce(evidence.decided ?? 0)
          .mockResolvedValue(evidence.decided ?? 0),
      },
      developerFindingResponse: { count: vi.fn().mockResolvedValue(0) },
      handoverTask: { count: vi.fn().mockResolvedValue(0) },
      taskReviewerAssignment: { count: vi.fn().mockResolvedValue(evidence.assignments ?? 0) },
      taskAttachment: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      notification: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      task: {
        findUnique: vi.fn().mockResolvedValue({
          id: taskId,
          title: 'Draft task',
          taskCode: 'CUST-CRIM-0',
          developerChecklist: null,
          ...task,
        }),
        delete: vi.fn().mockResolvedValue({}),
      },
      taskStatusHistory: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
      taskTaskType: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    };
    return {
      tx,
      prisma: {
        $transaction: vi.fn((operation: (client: typeof tx) => unknown) => operation(tx)),
      },
    };
  }

  it('permanently removes an owned, unsubmitted Developer draft', async () => {
    const user = actor(['DEVELOPER']);
    const { prisma, tx } = deletionPrisma({
      developerId: user.id,
      status: TaskStatus.DRAFT,
      submittedAt: null,
    });
    const service = serviceWith(prisma);

    await expect(service.remove(taskId, user)).resolves.toBeUndefined();

    expect(tx.task.delete).toHaveBeenCalledWith({ where: { id: taskId } });
  });

  it("does not let a Developer discard another user's draft", async () => {
    const user = actor(['DEVELOPER']);
    const { prisma, tx } = deletionPrisma({
      developerId: '00000000-0000-4000-8000-000000000099',
      status: TaskStatus.DRAFT,
      submittedAt: null,
    });
    const service = serviceWith(prisma);

    await expect(service.remove(taskId, user)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(tx.task.delete).not.toHaveBeenCalled();
  });

  it('does not let a Developer discard a draft that already has submitted evidence', async () => {
    const user = actor(['DEVELOPER']);
    const { prisma, tx } = deletionPrisma(
      { developerId: user.id, status: TaskStatus.DRAFT, submittedAt: null },
      { submissions: 1 },
    );
    const service = serviceWith(prisma);

    await expect(service.remove(taskId, user)).rejects.toMatchObject({
      code: 'DRAFT_HAS_SUBMITTED_EVIDENCE',
    });
    expect(tx.task.delete).not.toHaveBeenCalled();
  });

  it('does not let a Developer discard a submitted task', async () => {
    const user = actor(['DEVELOPER']);
    const { prisma, tx } = deletionPrisma({
      developerId: user.id,
      status: TaskStatus.SUBMITTED,
      submittedAt: new Date('2026-02-02T10:00:00.000Z'),
    });
    const service = serviceWith(prisma);

    await expect(service.remove(taskId, user)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(tx.task.delete).not.toHaveBeenCalled();
  });

  it('keeps permanent purge a Super Admin power: an Admin is refused', async () => {
    const user = actor(['ADMIN']);
    const { prisma, tx } = deletionPrisma({
      developerId: '00000000-0000-4000-8000-000000000099',
      status: TaskStatus.DRAFT,
      submittedAt: null,
    });
    const service = serviceWith(prisma);

    await expect(service.remove(taskId, user, 'cleanup')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(tx.task.delete).not.toHaveBeenCalled();
  });

  it('lets a Super Admin purge an evidence-free draft, with a reason', async () => {
    const user = actor(['SUPER_ADMIN']);
    const { prisma, tx } = deletionPrisma({
      developerId: '00000000-0000-4000-8000-000000000099',
      status: TaskStatus.DRAFT,
      submittedAt: null,
    });
    const service = serviceWith(prisma);

    await expect(service.remove(taskId, user)).rejects.toMatchObject({ code: 'REASON_REQUIRED' });
    await expect(service.remove(taskId, user, 'Created by mistake')).resolves.toBeUndefined();
    expect(tx.task.delete).toHaveBeenCalledWith({ where: { id: taskId } });
  });

  it('refuses to purge a task with workflow evidence', async () => {
    const user = actor(['SUPER_ADMIN']);
    const { prisma, tx } = deletionPrisma(
      { developerId: user.id, status: TaskStatus.CANCELLED, submittedAt: new Date() },
      { submissions: 1, assignments: 1 },
    );
    const service = serviceWith(prisma);

    await expect(service.remove(taskId, user, 'cleanup')).rejects.toMatchObject({
      code: 'TASK_HAS_WORKFLOW_EVIDENCE',
    });
    expect(tx.task.delete).not.toHaveBeenCalled();
  });
});

describe('ReviewTasksService resubmission assignment', () => {
  it('returns a changes-requested task to the reviewer who made that decision', async () => {
    const developer = actor(['DEVELOPER']);
    const taskId = '00000000-0000-4000-8000-000000000010';
    const reviewerId = '00000000-0000-4000-8000-000000000020';
    const baseTask = {
      id: taskId,
      taskCode: 'TEST-01',
      title: 'Test task',
      crimId: 'CRIM-1',
      version: '0',
      customerId: '00000000-0000-4000-8000-000000000030',
      priority: 'MEDIUM',
      status: TaskStatus.CHANGES_REQUESTED,
      currentReviewCycle: 1,
      developerId: developer.id,
      currentReviewerId: null,
      checklistCompleted: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      submittedAt: new Date('2026-01-01T01:00:00.000Z'),
      customer: { name: 'Test', code: 'TEST', color: '#123456' },
      developer: { fullName: developer.name },
      currentReviewer: null,
      reviewerAssignments: [],
      taskTypes: [],
      developerChecklist: { additionalRemarks: '', answers: [] },
      codeReviewForms: [{ reviewerId, decision: 'CHANGES_REQUESTED' }],
      reviewCycles: [{ roundNumber: 1, counted: true, exclusionReason: null }],
      handovers: [],
    };
    const assignedTask = {
      ...baseTask,
      status: TaskStatus.IN_REVIEW,
      currentReviewerId: reviewerId,
      currentReviewer: { fullName: 'Previous Reviewer' },
      reviewerAssignments: [{ id: '00000000-0000-4000-8000-000000000040' }],
    };
    const tx = {
      auditLog: { count: vi.fn().mockResolvedValue(1) },
      taskReviewerAssignment: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn().mockResolvedValue({ id: assignedTask.reviewerAssignments[0]?.id }),
      },
      notification: {
        findMany: vi.fn().mockResolvedValue([{ id: 'existing-notification' }]),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      task: {
        update: vi
          .fn()
          .mockResolvedValueOnce({
            ...baseTask,
            status: TaskStatus.RESUBMITTED,
          })
          .mockResolvedValueOnce(assignedTask),
      },
    };
    const prisma = {
      task: { findUnique: vi.fn().mockResolvedValue(baseTask) },
      codeReviewForm: {
        findFirst: vi.fn().mockResolvedValue({
          reviewerId,
          reviewer: {
            status: 'ACTIVE',
            deletedAt: null,
            userRoles: [{ roleId: 3 }],
          },
          findings: [],
        }),
      },
      developerFindingResponse: { findMany: vi.fn().mockResolvedValue([]) },
      // The follow-up reviewer is looked up on its own to check eligibility.
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: reviewerId,
          fullName: 'Previous Reviewer',
          status: 'ACTIVE',
          deletedAt: null,
          userRoles: [{ roleId: 2 }],
        }),
      },
      $transaction: vi.fn((operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
    };
    const service = serviceWith(prisma);

    await expect(service.submit(taskId, developer)).resolves.toMatchObject({
      id: taskId,
      status: 'InReview',
      reviewerId,
      reviewerName: 'Previous Reviewer',
    });

    expect(tx.taskReviewerAssignment.create).toHaveBeenCalledWith({
      data: {
        taskId,
        reviewerId,
        assignedBy: null,
        assignmentType: ReviewerAssignmentType.ADMIN_REASSIGNED,
      },
    });
    expect(tx.notification.deleteMany).toHaveBeenCalledWith({
      where: {
        taskId,
        notificationType: 'TASK_RESUBMITTED',
        recipientId: { not: reviewerId },
        id: { notIn: ['existing-notification'] },
      },
    });
    expect(tx.task.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: taskId },
        data: expect.objectContaining({ status: TaskStatus.RESUBMITTED }),
      }),
    );
    expect(tx.task.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { id: taskId },
        data: expect.objectContaining({
          status: TaskStatus.IN_REVIEW,
          currentReviewerId: reviewerId,
        }),
      }),
    );
  });
});

describe('ReviewTasksService task picking', () => {
  it('atomically claims an available task and records assignment and status history', async () => {
    const user = actor(['REVIEWER']);
    const candidate = {
      developerId: '00000000-0000-0000-0000-000000000099',
      currentReviewerId: null,
      currentReviewer: null,
      status: TaskStatus.SUBMITTED,
      title: 'Test task',
      currentReviewCycle: 1,
      handovers: [],
    };
    const picked = {
      id: '00000000-0000-0000-0000-000000000010',
      taskCode: 'TEST-01',
      title: 'Test task',
      crimId: 'CRIM-1',
      version: null,
      customerId: '00000000-0000-0000-0000-000000000020',
      priority: 'MEDIUM',
      status: TaskStatus.IN_REVIEW,
      currentReviewCycle: 1,
      developerId: candidate.developerId,
      currentReviewerId: user.id,
      checklistCompleted: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      submittedAt: new Date('2026-01-01T01:00:00.000Z'),
      customer: { name: 'Test', code: 'TEST', color: '#123456' },
      developer: { fullName: 'Developer' },
      currentReviewer: { fullName: user.name },
      taskTypes: [],
      developerChecklist: null,
      codeReviewForms: [],
      handovers: [],
    };
    const tx = {
      task: {
        findUnique: vi.fn().mockResolvedValueOnce(candidate).mockResolvedValueOnce(picked),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      taskReviewerAssignment: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn().mockResolvedValue({ id: '00000000-0000-4000-8000-000000000201' }),
      },
      codeReviewForm: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      taskStatusHistory: { create: vi.fn().mockResolvedValue({}) },
    };
    const service = serviceWith({
      $transaction: vi.fn((operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
    });

    const result = await service.pick(picked.id, user);

    expect(tx.task.updateMany).toHaveBeenCalledWith({
      where: {
        id: picked.id,
        developerId: { not: user.id },
        currentReviewerId: null,
        status: { in: [TaskStatus.SUBMITTED, TaskStatus.RESUBMITTED] },
      },
      data: { currentReviewerId: user.id, status: TaskStatus.IN_REVIEW },
    });
    expect(tx.taskReviewerAssignment.create).toHaveBeenCalledWith({
      data: {
        taskId: picked.id,
        reviewerId: user.id,
        assignedBy: user.id,
        assignmentType: ReviewerAssignmentType.SELF_PICKED,
      },
    });
    expect(tx.codeReviewForm.updateMany).toHaveBeenCalledWith({
      where: { taskId: picked.id, reviewCycleNumber: 1, status: 'DRAFT' },
      data: {
        reviewerId: user.id,
        currentReviewSessionId: '00000000-0000-4000-8000-000000000201',
        reviewRank: null,
        previousFeedbackReviewNote: null,
        previousFeedbackAcknowledged: null,
      },
    });
    expect(tx.taskStatusHistory.create).toHaveBeenCalledWith({
      data: {
        taskId: picked.id,
        oldStatus: TaskStatus.SUBMITTED,
        newStatus: TaskStatus.IN_REVIEW,
        changedBy: user.id,
        remarks: 'Task picked up for review',
      },
    });
    expect(result).toMatchObject({
      id: picked.id,
      title: 'TEST-CRIM-1',
      status: 'InReview',
      reviewerId: user.id,
      reviewerName: user.name,
    });
    expect(notifications.create).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        recipientId: candidate.developerId,
        type: 'TASK_ASSIGNED',
        title: 'Test task picked for review',
      }),
    );
  });

  it('rejects a concurrent pick that lost the claim race', async () => {
    const user = actor(['REVIEWER']);
    const tx = {
      task: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({
            developerId: 'another-developer',
            currentReviewerId: null,
            currentReviewer: null,
            status: TaskStatus.SUBMITTED,
            title: 'Test task',
            handovers: [],
          })
          .mockResolvedValueOnce({ currentReviewer: { fullName: 'Winning Reviewer' } }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const service = serviceWith({
      $transaction: vi.fn((operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
    });

    await expect(service.pick('task-id', user)).rejects.toMatchObject({
      code: 'ALREADY_PICKED',
      status: 409,
      message: 'Winning Reviewer has already picked up this task',
    });
  });

  it('prevents a Developer and Reviewer user from picking their own submission', async () => {
    const user = actor(['DEVELOPER', 'REVIEWER']);
    const tx = {
      task: {
        findUnique: vi.fn().mockResolvedValue({
          developerId: user.id,
          currentReviewerId: null,
          currentReviewer: null,
          status: TaskStatus.SUBMITTED,
          title: 'Own task',
          handovers: [],
        }),
      },
    };
    const service = serviceWith({
      $transaction: vi.fn((operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
    });

    await expect(service.pick('task-id', user)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets the previous reviewer retake a handed-over task and resolves the handover', async () => {
    const user = actor(['REVIEWER']);
    const handoverId = '00000000-0000-0000-0000-000000000030';
    const taskId = '00000000-0000-0000-0000-000000000010';
    const candidate = {
      developerId: '00000000-0000-0000-0000-000000000099',
      currentReviewerId: null,
      currentReviewer: null,
      status: TaskStatus.SUBMITTED,
      title: 'Handed-over task',
      currentReviewCycle: 1,
      handovers: [
        {
          id: handoverId,
          reason: 'Temporary workload conflict',
          fromReviewerId: user.id,
          fromReviewer: { fullName: user.name },
        },
      ],
    };
    const picked = {
      id: taskId,
      taskCode: 'TEST-01',
      title: candidate.title,
      crimId: 'CRIM-1',
      version: null,
      customerId: '00000000-0000-0000-0000-000000000020',
      priority: 'MEDIUM',
      status: TaskStatus.IN_REVIEW,
      currentReviewCycle: 1,
      developerId: candidate.developerId,
      currentReviewerId: user.id,
      checklistCompleted: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      submittedAt: new Date('2026-01-01T01:00:00.000Z'),
      customer: { name: 'Test', code: 'TEST', color: '#123456' },
      developer: { fullName: 'Developer' },
      currentReviewer: { fullName: user.name },
      taskTypes: [],
      developerChecklist: null,
      codeReviewForms: [],
      handovers: [
        {
          status: HandoverStatus.REASSIGNED,
          fromReviewer: { fullName: user.name },
        },
      ],
    };
    const tx = {
      task: {
        findUnique: vi.fn().mockResolvedValueOnce(candidate).mockResolvedValueOnce(picked),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      handoverTask: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      taskReviewerAssignment: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockResolvedValue({ id: '00000000-0000-4000-8000-000000000202' }),
      },
      codeReviewForm: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      taskStatusHistory: { create: vi.fn().mockResolvedValue({}) },
    };
    const service = serviceWith({
      $transaction: vi.fn((operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
    });

    await expect(service.pick(taskId, user)).resolves.toMatchObject({
      id: taskId,
      reviewerId: user.id,
      handedOverByName: user.name,
    });
    expect(tx.handoverTask.updateMany).toHaveBeenCalledWith({
      where: { taskId, status: HandoverStatus.PENDING },
      data: {
        status: HandoverStatus.REASSIGNED,
        toReviewerId: user.id,
        reassignedBy: user.id,
        reassignedAt: expect.any(Date),
      },
    });
    expect(tx.taskReviewerAssignment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        taskId,
        reviewerId: user.id,
        assignmentType: ReviewerAssignmentType.HANDOVER_REASSIGNED,
      }),
    });
    expect(notifications.create).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        recipientId: candidate.developerId,
        type: 'TASK_ASSIGNED',
      }),
    );
  });

  it('notifies the previous Reviewer and Admins when another Reviewer picks a handover', async () => {
    const user = actor(['REVIEWER']);
    const taskId = '00000000-0000-0000-0000-000000000010';
    const developerId = '00000000-0000-0000-0000-000000000099';
    const previousReviewerId = '00000000-0000-0000-0000-000000000098';
    const adminId = '00000000-0000-0000-0000-000000000097';
    const candidate = {
      developerId,
      currentReviewerId: null,
      currentReviewer: null,
      status: TaskStatus.SUBMITTED,
      title: 'Handed-over task',
      currentReviewCycle: 1,
      handovers: [
        {
          id: '00000000-0000-0000-0000-000000000030',
          reason: 'Temporary workload conflict',
          fromReviewerId: previousReviewerId,
          fromReviewer: { fullName: 'Previous Reviewer' },
        },
      ],
    };
    const picked = {
      id: taskId,
      taskCode: 'TEST-01',
      title: candidate.title,
      crimId: 'CRIM-1',
      version: null,
      customerId: '00000000-0000-0000-0000-000000000020',
      priority: 'MEDIUM',
      status: TaskStatus.IN_REVIEW,
      currentReviewCycle: 1,
      developerId,
      currentReviewerId: user.id,
      checklistCompleted: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      submittedAt: new Date('2026-01-01T01:00:00.000Z'),
      customer: { name: 'Test', code: 'TEST', color: '#123456' },
      developer: { fullName: 'Developer' },
      currentReviewer: { fullName: user.name },
      taskTypes: [],
      developerChecklist: null,
      codeReviewForms: [],
      handovers: [
        {
          status: HandoverStatus.REASSIGNED,
          fromReviewer: { fullName: 'Previous Reviewer' },
        },
      ],
    };
    const tx = {
      task: {
        findUnique: vi.fn().mockResolvedValueOnce(candidate).mockResolvedValueOnce(picked),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      handoverTask: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      taskReviewerAssignment: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockResolvedValue({ id: '00000000-0000-4000-8000-000000000203' }),
      },
      codeReviewForm: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      taskStatusHistory: { create: vi.fn().mockResolvedValue({}) },
      user: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { id: adminId },
            { id: user.id },
            { id: developerId },
            { id: previousReviewerId },
          ]),
      },
    };
    const service = serviceWith({
      $transaction: vi.fn((operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
    });

    await service.pick(taskId, user);

    expect(notifications.create).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ recipientId: developerId }),
    );
    expect(notifications.createMany).toHaveBeenCalledWith(tx, [
      expect.objectContaining({
        recipientId: previousReviewerId,
        message: `${user.name} picked up the review task you handed over.`,
      }),
      expect.objectContaining({
        recipientId: adminId,
        message: `${user.name} picked up the handed-over review task.`,
      }),
    ]);
  });
});

describe('ReviewTasksService Admin task actions', () => {
  const taskId = '00000000-0000-4000-8000-000000000010';
  const developerId = '00000000-0000-4000-8000-000000000020';
  const oldReviewerId = '00000000-0000-4000-8000-000000000030';
  const newReviewerId = '00000000-0000-4000-8000-000000000040';

  function taskResponse(overrides: Record<string, unknown> = {}) {
    return {
      id: taskId,
      taskCode: 'TEST-01',
      title: 'Stored title',
      crimId: 'CRIM-1',
      version: '1',
      customerId: '00000000-0000-4000-8000-000000000050',
      priority: 'MEDIUM',
      status: TaskStatus.IN_REVIEW,
      currentReviewCycle: 1,
      developerId,
      currentReviewerId: oldReviewerId,
      checklistCompleted: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      submittedAt: new Date('2026-01-01T01:00:00.000Z'),
      customer: { name: 'Test', code: 'TEST', color: '#123456' },
      developer: { fullName: 'Developer' },
      currentReviewer: { fullName: 'Old Reviewer' },
      reviewerAssignments: [{ id: '00000000-0000-4000-8000-000000000060' }],
      taskTypes: [],
      developerChecklist: null,
      codeReviewForms: [],
      reviewCycles: [{ roundNumber: 1, counted: true, exclusionReason: null }],
      handovers: [],
      ...overrides,
    };
  }

  it('reassigns the active review and uses the existing assignment notification type', async () => {
    const admin = actor(['ADMIN']);
    const candidate = {
      id: taskId,
      title: 'Test task',
      developerId,
      currentReviewerId: oldReviewerId,
      currentReviewCycle: 1,
      status: TaskStatus.IN_REVIEW,
      handovers: [],
    };
    const updated = taskResponse({
      currentReviewerId: newReviewerId,
      currentReviewer: { fullName: 'New Reviewer' },
      reviewerAssignments: [
        {
          id: '00000000-0000-4000-8000-000000000070',
          reviewerId: newReviewerId,
          assignedBy: admin.id,
          assignmentType: ReviewerAssignmentType.ADMIN_REASSIGNED,
          isCurrent: true,
          reviewer: { fullName: 'New Reviewer' },
        },
        {
          id: '00000000-0000-4000-8000-000000000060',
          reviewerId: oldReviewerId,
          assignedBy: null,
          assignmentType: ReviewerAssignmentType.SELF_PICKED,
          isCurrent: false,
          reviewer: { fullName: 'Old Reviewer' },
        },
      ],
    });
    const tx = {
      task: {
        findUnique: vi.fn().mockResolvedValueOnce(candidate).mockResolvedValueOnce(updated),
        update: vi.fn().mockResolvedValue({}),
      },
      user: {
        findFirst: vi.fn().mockResolvedValue({ id: newReviewerId, fullName: 'New Reviewer' }),
      },
      taskReviewerAssignment: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockResolvedValue({ id: '00000000-0000-4000-8000-000000000070' }),
      },
      codeReviewForm: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      taskStatusHistory: { create: vi.fn().mockResolvedValue({}) },
    };
    const service = serviceWith({
      $transaction: vi.fn((operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
    });

    await expect(
      service.assign(taskId, newReviewerId, admin, 'Balance the workload'),
    ).resolves.toMatchObject({
      reviewerId: newReviewerId,
      status: 'InReview',
      handedOverByName: 'Old Reviewer',
    });

    expect(tx.codeReviewForm.updateMany).toHaveBeenCalledWith({
      where: { taskId, reviewCycleNumber: 1, status: 'DRAFT' },
      data: {
        reviewerId: newReviewerId,
        currentReviewSessionId: '00000000-0000-4000-8000-000000000070',
        reviewRank: null,
        previousFeedbackReviewNote: null,
        previousFeedbackAcknowledged: null,
      },
    });
    expect(notifications.createMany).toHaveBeenCalledWith(
      tx,
      expect.arrayContaining([
        expect.objectContaining({
          recipientId: newReviewerId,
          type: 'TASK_ASSIGNED',
          title: 'Test task reassigned to you',
          email: expect.objectContaining({ event: 'REVIEWER_ASSIGNED', reviewerId: newReviewerId }),
        }),
      ]),
    );
  });

  it('cancels an active task while preserving review data and closing its assignment', async () => {
    const admin = actor(['ADMIN']);
    const candidate = {
      id: taskId,
      title: 'Test task',
      developerId,
      currentReviewerId: oldReviewerId,
      currentReviewCycle: 1,
      status: TaskStatus.IN_REVIEW,
    };
    const updated = taskResponse({
      status: TaskStatus.CANCELLED,
      currentReviewerId: null,
      currentReviewer: null,
      reviewerAssignments: [],
    });
    const tx = {
      task: {
        findUnique: vi.fn().mockResolvedValueOnce(candidate).mockResolvedValueOnce(updated),
        update: vi.fn().mockResolvedValue({}),
      },
      taskReviewerAssignment: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      codeReviewForm: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      taskStatusHistory: { create: vi.fn().mockResolvedValue({}) },
      handoverTask: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    const service = serviceWith({
      $transaction: vi.fn((operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
    });

    await expect(service.cancel(taskId, 'No longer required', admin)).resolves.toMatchObject({
      reviewerId: null,
      status: 'Cancelled',
    });

    expect(tx.task.update).toHaveBeenCalledWith({
      where: { id: taskId },
      data: {
        status: TaskStatus.CANCELLED,
        currentReviewerId: null,
        resubmissionReviewerId: null,
        cancelledAt: expect.any(Date),
      },
    });
    // A pending handover is closed with the task.
    expect(tx.handoverTask.updateMany).toHaveBeenCalledWith({
      where: { taskId, status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });
    expect(tx.codeReviewForm.updateMany).toHaveBeenCalledWith({
      where: { taskId, reviewCycleNumber: 1, status: 'DRAFT' },
      data: { currentReviewSessionId: null },
    });
    expect(notifications.createMany).toHaveBeenCalledWith(
      tx,
      expect.arrayContaining([
        expect.objectContaining({ recipientId: developerId, type: 'TASK_CANCELLED' }),
        expect.objectContaining({ recipientId: oldReviewerId, type: 'TASK_CANCELLED' }),
      ]),
    );
  });

  it('rejects cancellation after a task reaches a terminal state', async () => {
    const tx = {
      task: {
        findUnique: vi.fn().mockResolvedValue({
          id: taskId,
          title: 'Test task',
          developerId,
          currentReviewerId: null,
          currentReviewCycle: 1,
          status: TaskStatus.APPROVED,
        }),
      },
    };
    const service = serviceWith({
      $transaction: vi.fn((operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
    });

    await expect(service.cancel(taskId, 'Too late', actor(['ADMIN']))).rejects.toMatchObject({
      code: 'INVALID_STATE_TRANSITION',
    });
  });
});

describe('ReviewTasksService handover', () => {
  it('removes the assigned reviewer, records the reason, and returns the task to pickup', async () => {
    const reviewer = actor(['REVIEWER']);
    const taskId = '00000000-0000-0000-0000-000000000010';
    const adminId = '00000000-0000-0000-0000-000000000011';
    const eligibleReviewerId = '00000000-0000-0000-0000-000000000012';
    const candidate = {
      id: taskId,
      title: 'Test task',
      developerId: '00000000-0000-0000-0000-000000000099',
      status: TaskStatus.IN_REVIEW,
      currentReviewCycle: 1,
      currentReviewerId: reviewer.id,
      currentReviewer: { fullName: reviewer.name },
      handovers: [],
    };
    const updated = {
      id: taskId,
      taskCode: 'TEST-01',
      title: candidate.title,
      crimId: 'CRIM-1',
      version: null,
      customerId: '00000000-0000-0000-0000-000000000020',
      priority: 'MEDIUM',
      status: TaskStatus.SUBMITTED,
      currentReviewCycle: 1,
      developerId: candidate.developerId,
      currentReviewerId: null,
      checklistCompleted: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      submittedAt: new Date('2026-01-01T01:00:00.000Z'),
      customer: { name: 'Test', code: 'TEST', color: '#123456' },
      developer: { fullName: 'Developer' },
      currentReviewer: null,
      taskTypes: [],
      developerChecklist: null,
      codeReviewForms: [],
      handovers: [
        {
          status: 'PENDING',
          fromReviewer: { fullName: reviewer.name },
        },
      ],
    };
    const tx = {
      task: {
        findUnique: vi.fn().mockResolvedValueOnce(candidate).mockResolvedValueOnce(updated),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      handoverTask: {
        create: vi.fn().mockResolvedValue({ id: '00000000-0000-0000-0000-000000000030' }),
      },
      taskReviewerAssignment: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      taskStatusHistory: { create: vi.fn().mockResolvedValue({}) },
      user: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([{ id: adminId }])
          .mockResolvedValueOnce([{ id: eligibleReviewerId }]),
      },
    };
    const service = serviceWith({
      $transaction: vi.fn((operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
    });

    const draft = {
      rank: null,
      comments: [],
      generalCheck: [],
      findings: {
        incorrectCode: '',
        incompleteImplementation: '',
        sourceFormatting: '',
      },
      otherRemarks: 'Preserve this draft',
      feedbackSummary: '',
    };
    const saveDraft = vi.fn().mockResolvedValue(draft);
    const result = await service.handover(
      taskId,
      { reason: 'On leave next week.', draft },
      reviewer,
      saveDraft,
    );
    expect(saveDraft).toHaveBeenCalledWith(tx);

    expect(tx.task.updateMany).toHaveBeenCalledWith({
      where: { id: taskId, currentReviewerId: reviewer.id, status: TaskStatus.IN_REVIEW },
      data: { currentReviewerId: null, status: TaskStatus.SUBMITTED },
    });
    expect(tx.handoverTask.create).toHaveBeenCalledWith({
      data: {
        taskId,
        fromReviewerId: reviewer.id,
        reason: 'On leave next week.',
        status: 'PENDING',
      },
    });
    expect(result).toMatchObject({
      id: taskId,
      status: 'Submitted',
      reviewerId: null,
      isHandedOver: true,
    });
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      reviewer,
      expect.objectContaining({
        actionType: 'TASK_HANDOVER',
        newValue: expect.objectContaining({ reason: 'On leave next week.' }),
        metadata: { reviewDraft: draft },
      }),
    );
    expect(notifications.createMany).toHaveBeenCalledWith(tx, [
      expect.objectContaining({
        recipientId: updated.developerId,
        title: 'Test task handed over',
        message: `${reviewer.name} handed over your review task for reassignment.`,
      }),
      expect.objectContaining({
        recipientId: eligibleReviewerId,
        title: 'Test task available to pick',
        message: `${reviewer.name} handed over this review task. It is now available to pick.`,
      }),
      expect.objectContaining({
        recipientId: adminId,
        title: 'Test task handed over',
        message: `${reviewer.name} handed over this review task for reassignment.`,
      }),
    ]);
  });
});

describe('ReviewTasksService legacy statuses', () => {
  it('serves a legacy DELIVERED task as Approved, a status the API contract knows', async () => {
    const developer = actor(['DEVELOPER']);
    const legacy = {
      id: '00000000-0000-4000-8000-0000000000d1',
      taskCode: 'LEGACY-01',
      title: 'Legacy task',
      crimId: 'CRIM-9',
      version: '0',
      customerId: '00000000-0000-4000-8000-000000000030',
      priority: 'LOW',
      status: TaskStatus.DELIVERED,
      currentReviewCycle: 1,
      developerId: developer.id,
      currentReviewerId: null,
      checklistCompleted: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      submittedAt: new Date('2026-01-01T01:00:00.000Z'),
      customer: { name: 'Test', code: 'TEST', color: '#123456' },
      developer: { fullName: developer.name },
      currentReviewer: null,
      reviewerAssignments: [],
      taskTypes: [],
      developerChecklist: null,
      codeReviewForms: [],
      reviewCycles: [],
      handovers: [],
    };
    const service = serviceWith({ task: { findUnique: vi.fn().mockResolvedValue(legacy) } });

    await expect(service.findOne(legacy.id, developer)).resolves.toMatchObject({
      id: legacy.id,
      status: 'Approved',
    });
  });
});
