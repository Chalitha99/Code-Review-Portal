import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { NotificationsService } from './notifications.service.js';

const recipientId = '00000000-0000-0000-0000-000000000001';
const otherUserId = '00000000-0000-0000-0000-000000000002';
const notificationId = '00000000-0000-0000-0000-000000000003';
const taskId = '00000000-0000-0000-0000-000000000004';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: notificationId,
    taskId,
    recipientId,
    notificationType: NotificationType.TASK_APPROVED,
    title: 'Payment validation approved',
    message: 'Review User approved your code review task.',
    isRead: false,
    readAt: null,
    emailSent: false,
    emailSentAt: null,
    createdAt: new Date('2026-09-30T08:00:00.000Z'),
    task: { developerId: recipientId },
    ...overrides,
  };
}

function prismaWith(roles: string[], notification: Record<string, unknown>) {
  return {
    notification,
    userRole: {
      findMany: vi.fn().mockResolvedValue(roles.map((code) => ({ role: { code } }))),
    },
  };
}

describe('NotificationsService', () => {
  it('lists only the authenticated recipient, newest first', async () => {
    const findMany = vi.fn().mockResolvedValue([row()]);
    const service = new NotificationsService(prismaWith(['DEVELOPER'], { findMany }) as never);

    await expect(service.findAll(recipientId)).resolves.toEqual([
      expect.objectContaining({
        kind: 'TaskApproved',
        title: 'Payment validation approved',
        href: `/crp/developer/tasks/${taskId}`,
      }),
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { recipientId }, orderBy: { createdAt: 'desc' } }),
    );
  });

  it('identifies a newly submitted task notification', async () => {
    const findMany = vi.fn().mockResolvedValue([
      row({
        notificationType: NotificationType.TASK_SUBMITTED,
        title: 'Payment validation submitted for review',
        task: { developerId: otherUserId },
      }),
    ]);
    const service = new NotificationsService(prismaWith(['REVIEWER'], { findMany }) as never);

    await expect(service.findAll(recipientId)).resolves.toEqual([
      expect.objectContaining({
        kind: 'TaskSubmitted',
        title: 'Payment validation submitted for review',
        href: `/crp/reviewer/tasks/${taskId}`,
      }),
    ]);
  });

  it.each([
    [
      'the developer, to their task',
      ['DEVELOPER'],
      recipientId,
      NotificationType.TASK_ASSIGNED,
      `/crp/developer/tasks/${taskId}`,
    ],
    [
      'a reviewer, to the review',
      ['REVIEWER'],
      otherUserId,
      NotificationType.TASK_CANCELLED,
      `/crp/reviewer/tasks/${taskId}`,
    ],
    [
      'an admin, to the handover queue',
      ['ADMIN'],
      otherUserId,
      NotificationType.TASK_HANDOVER,
      '/crp/admin/handovers',
    ],
    [
      'an admin, to the admin task view',
      ['SUPER_ADMIN'],
      otherUserId,
      NotificationType.TASK_SUBMITTED,
      `/crp/admin/tasks/${taskId}`,
    ],
  ])('links %s', async (_label, roles, developerId, type, href) => {
    const findMany = vi
      .fn()
      .mockResolvedValue([row({ notificationType: type, task: { developerId } })]);
    const service = new NotificationsService(prismaWith(roles, { findMany }) as never);

    await expect(service.findAll(recipientId)).resolves.toEqual([
      expect.objectContaining({ href }),
    ]);
  });

  it('answers 404 for a notification that does not exist', async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const update = vi.fn();
    const service = new NotificationsService(
      prismaWith(['DEVELOPER'], { findUnique, update }) as never,
    );

    await expect(service.markRead(notificationId, otherUserId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it("refuses (403) and never mutates another user's notification", async () => {
    const findUnique = vi.fn().mockResolvedValue(row());
    const update = vi.fn();
    const service = new NotificationsService(
      prismaWith(['DEVELOPER'], { findUnique, update }) as never,
    );

    await expect(service.markRead(notificationId, otherUserId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('marks only the current user unread notifications as read', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 2 });
    const service = new NotificationsService({ notification: { updateMany } } as never);

    await service.markAllRead(recipientId);
    expect(updateMany).toHaveBeenCalledWith({
      where: { recipientId, isRead: false },
      data: { isRead: true, readAt: expect.any(Date) },
    });
  });
});
