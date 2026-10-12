import { ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Prisma, type Notification, type NotificationType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EmailDispatcher } from './email-dispatcher.service.js';
import { notificationHref, type RecipientContext } from './notification-href.js';
import { pendingEmailColumns, type TaskEmailPayload } from './task-email.js';

type NotificationClient = Pick<Prisma.TransactionClient, 'notification'>;
// Kept as a typed constant so this compiles before `prisma generate` has been
// run for the accompanying enum migration in a fresh checkout.
export const TASK_REASSIGNED_NOTIFICATION = 'TASK_REASSIGNED' as NotificationType;

type NotificationWithTask = Notification & { task: { developerId: string } | null };

export interface CreateNotificationInput {
  taskId: string;
  recipientId: string;
  type: NotificationType;
  title: string;
  message: string;
  /** Also email the recipient, using these facts. */
  email?: TaskEmailPayload;
}

function rowData(input: CreateNotificationInput) {
  return {
    taskId: input.taskId,
    recipientId: input.recipientId,
    notificationType: input.type,
    title: input.title,
    message: input.message,
    ...(input.email ? pendingEmailColumns(input.email) : {}),
  };
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly dispatcher?: EmailDispatcher,
  ) {}

  async findAll(recipientId: string) {
    const [rows, recipient] = await Promise.all([
      this.prisma.notification.findMany({
        where: { recipientId },
        include: { task: { select: { developerId: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.recipientRoles(recipientId),
    ]);
    return rows.map((row) => this.toResponse(row, recipient));
  }

  async markRead(id: string, recipientId: string) {
    const owned = await this.prisma.notification.findUnique({
      where: { id },
      include: { task: { select: { developerId: true } } },
    });
    if (!owned) throw new NotFoundException('Notification not found');
    // Someone else's notification exists but is not yours to touch.
    if (owned.recipientId !== recipientId) {
      throw new ForbiddenException('This notification belongs to another user');
    }
    const recipient = await this.recipientRoles(recipientId);

    const row = owned.isRead
      ? owned
      : await this.prisma.notification.update({
          where: { id },
          data: { isRead: true, readAt: new Date() },
          include: { task: { select: { developerId: true } } },
        });
    return this.toResponse(row, recipient);
  }

  async markAllRead(recipientId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { recipientId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
  }

  create(client: NotificationClient, input: CreateNotificationInput) {
    if (input.email) this.dispatcher?.kick();
    return client.notification.create({ data: rowData(input) });
  }

  createMany(client: NotificationClient, inputs: CreateNotificationInput[]) {
    if (inputs.length === 0) return Promise.resolve({ count: 0 });
    if (inputs.some((input) => input.email)) this.dispatcher?.kick();
    return client.notification.createMany({ data: inputs.map(rowData) });
  }

  /**
   * Queues email for rows the `create_task_status_notification` trigger inserted
   * in this transaction (same `now()`), leaving every other row untouched.
   */
  async queueEmailForTriggerRows(
    tx: Prisma.TransactionClient,
    input: {
      taskId: string;
      recipientIds: string[];
      types: NotificationType[];
      payload: TaskEmailPayload;
    },
  ): Promise<number> {
    if (input.recipientIds.length === 0) return 0;
    const count = await tx.$executeRaw`
      UPDATE "notifications"
         SET "email_status" = 'PENDING'::"notification_email_status",
             "email_attempts" = 0,
             "email_next_attempt_at" = now(),
             "payload" = ${JSON.stringify(input.payload)}::jsonb
       WHERE "task_id" = ${input.taskId}::uuid
         AND "recipient_id" IN (${Prisma.join(input.recipientIds.map((id) => Prisma.sql`${id}::uuid`))})
         AND "notification_type"::text IN (${Prisma.join(input.types.map((type) => String(type)))})
         AND "created_at" = now()
         AND "email_status" IS NULL`;
    if (count > 0) this.dispatcher?.kick();
    return count;
  }

  private async recipientRoles(recipientId: string): Promise<RecipientContext> {
    const roles = await this.prisma.userRole.findMany({
      where: { userId: recipientId, role: { deletedAt: null } },
      select: { role: { select: { code: true } } },
    });
    const codes = roles.map(({ role }) => role.code);
    return {
      id: recipientId,
      isAdmin: codes.includes('ADMIN') || codes.includes('SUPER_ADMIN'),
      isReviewer: codes.includes('REVIEWER'),
    };
  }

  private toResponse(row: NotificationWithTask, recipient: RecipientContext) {
    const kind = {
      TASK_APPROVED: 'TaskApproved',
      CHANGES_REQUESTED: 'ChangesRequested',
      TASK_RESUBMITTED: 'TaskResubmitted',
      TASK_ASSIGNED: 'TaskAssigned',
      TASK_REASSIGNED: 'TaskReassigned',
      TASK_HANDOVER: 'TaskHandedOver',
      TASK_CANCELLED: 'TaskCancelled',
      TASK_SUBMITTED: 'TaskSubmitted',
      TASK_DELIVERED: 'TaskApproved',
    }[row.notificationType];

    const href = notificationHref(row, recipient);

    return {
      id: row.id,
      kind,
      title: row.title,
      body: row.message,
      href,
      taskId: row.taskId,
      isRead: row.isRead,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
