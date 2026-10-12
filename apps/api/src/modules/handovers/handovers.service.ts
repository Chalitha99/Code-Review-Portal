import { Injectable, NotFoundException } from '@nestjs/common';
import {
  HandoverStatus,
  NotificationType,
  Prisma,
  ReviewerAssignmentType,
  TaskStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiException } from '../../common/api-error.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { AuditService } from '../audit/audit.service.js';
import type { ReassignHandoverDto } from './dto/reassign-handover.dto.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { taskEmail } from '../notifications/task-email.js';
import { retryPrismaTransaction } from '../../common/prisma-errors.js';
import { reviewDraftSchema } from '@sdp/contracts';

const handoverInclude = {
  task: true,
  fromReviewer: true,
  toReviewer: true,
} satisfies Prisma.HandoverTaskInclude;

type HandoverWithRelations = Prisma.HandoverTaskGetPayload<{ include: typeof handoverInclude }>;

@Injectable()
export class HandoversService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async findAll() {
    const handovers = await this.prisma.handoverTask.findMany({
      include: handoverInclude,
      orderBy: [{ status: 'asc' }, { requestedAt: 'desc' }],
    });
    return handovers.map((handover) => this.toResponse(handover));
  }

  async findOne(id: string) {
    const handover = await this.prisma.handoverTask.findUnique({
      where: { id },
      include: handoverInclude,
    });
    if (!handover) throw new NotFoundException(`Handover ${id} was not found`);
    return this.toResponse(handover);
  }

  async findDraft(id: string) {
    const handover = await this.prisma.handoverTask.findUnique({
      where: { id },
      include: { task: { select: { currentReviewCycle: true } }, fromReviewer: true },
    });
    if (!handover) throw new NotFoundException(`Handover ${id} was not found`);
    const log = await this.prisma.auditLog.findFirst({
      where: { entityType: 'HANDOVER', entityId: id, action: 'TASK_HANDOVER' },
      select: { metadata: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!log?.metadata || typeof log.metadata !== 'object' || Array.isArray(log.metadata))
      return null;
    const parsed = reviewDraftSchema.safeParse(log.metadata['reviewDraft']);
    if (!parsed.success) return null;
    const draft = parsed.data;
    return {
      id: handover.id,
      taskId: handover.taskId,
      reviewCycle: Math.max(handover.task.currentReviewCycle, 1),
      reviewerId: handover.fromReviewerId,
      reviewerName: handover.fromReviewer.fullName,
      currentReviewSessionId: draft.currentReviewSessionId ?? handover.id,
      comments: draft.comments,
      generalCheck: draft.generalCheck,
      findings: draft.findings,
      otherRemarks: draft.otherRemarks,
      feedbackSummary: draft.feedbackSummary,
      screenshots: draft.comments.flatMap(({ screenshots }) => screenshots),
      rank: draft.rank,
      previousFeedbackReviewNote: draft.previousFeedbackReviewNote ?? null,
      previousFeedbackAcknowledged: draft.previousFeedbackAcknowledged ?? null,
      decision: null,
      decidedAt: null,
      createdAt: handover.requestedAt.toISOString(),
      updatedAt: handover.requestedAt.toISOString(),
    };
  }

  async reassign(id: string, dto: ReassignHandoverDto, actor: AuthenticatedUser) {
    return retryPrismaTransaction(() =>
      this.prisma.$transaction(async (tx) => {
        const handover = await tx.handoverTask.findUnique({
          where: { id },
          include: { task: true, fromReviewer: true },
        });
        if (!handover) throw new NotFoundException(`Handover ${id} was not found`);
        if (handover.status !== HandoverStatus.PENDING) {
          throw new ApiException('ALREADY_RESOLVED', 'This handover has already been resolved');
        }

        const reviewer = await tx.user.findFirst({
          where: {
            id: dto.reviewerId,
            status: 'ACTIVE',
            deletedAt: null,
            userRoles: { some: { role: { code: 'REVIEWER', deletedAt: null } } },
          },
        });
        if (!reviewer) throw new ApiException('INVALID_REVIEWER', 'Select an active Reviewer');
        if (reviewer.id === handover.task.developerId) {
          throw new ApiException('SELF_REVIEW', 'A developer cannot review their own task');
        }

        const now = new Date();
        const resolved = await tx.handoverTask.updateMany({
          where: { taskId: handover.taskId, status: HandoverStatus.PENDING },
          data: {
            status: HandoverStatus.REASSIGNED,
            toReviewerId: reviewer.id,
            reassignedBy: actor.id,
            reassignedAt: now,
          },
        });
        if (resolved.count < 1) {
          throw new ApiException('ALREADY_RESOLVED', 'This handover was already reassigned');
        }

        const assigned = await tx.task.updateMany({
          where: {
            id: handover.taskId,
            currentReviewerId: null,
            status: { in: [TaskStatus.SUBMITTED, TaskStatus.RESUBMITTED] },
          },
          data: { currentReviewerId: reviewer.id, status: TaskStatus.IN_REVIEW },
        });
        if (assigned.count !== 1) {
          throw new ApiException(
            'INVALID_STATE',
            'The handed-over task is no longer available to reassign',
          );
        }

        await tx.taskReviewerAssignment.updateMany({
          where: { taskId: handover.taskId, isCurrent: true },
          data: { isCurrent: false, unassignedAt: now },
        });
        const assignment = await tx.taskReviewerAssignment.create({
          data: {
            taskId: handover.taskId,
            reviewerId: reviewer.id,
            assignedBy: actor.id,
            assignmentType: ReviewerAssignmentType.HANDOVER_REASSIGNED,
          },
        });
        await tx.codeReviewForm.updateMany({
          where: {
            taskId: handover.taskId,
            reviewCycleNumber: Math.max(handover.task.currentReviewCycle, 1),
            status: 'DRAFT',
          },
          data: {
            reviewerId: reviewer.id,
            currentReviewSessionId: assignment.id,
            reviewRank: null,
            previousFeedbackReviewNote: null,
          },
        });
        await tx.taskStatusHistory.create({
          data: {
            taskId: handover.taskId,
            oldStatus: handover.task.status,
            newStatus: TaskStatus.IN_REVIEW,
            changedBy: actor.id,
            remarks: `Handover reassigned from ${handover.fromReviewer.fullName} to ${reviewer.fullName}`,
          },
        });
        await this.audit.record(tx, actor, {
          actionType: 'HANDOVER_REASSIGNED',
          entityType: 'HANDOVER',
          entityId: id,
          taskId: handover.taskId,
          targetUserId: reviewer.id,
          description: `${actor.name} reassigned task '${handover.task.title}' from ${handover.fromReviewer.fullName} to ${reviewer.fullName}. Handover reason: ${handover.reason ?? 'Not provided'}`,
          oldValue: {
            reviewerId: handover.fromReviewerId,
            reviewerName: handover.fromReviewer.fullName,
            reason: handover.reason,
          },
          newValue: { reviewerId: reviewer.id, reviewerName: reviewer.fullName },
        });
        const reassignedEmail = taskEmail(
          'HANDOVER_REASSIGNED',
          actor.name,
          {
            reviewerId: reviewer.id,
            reviewerName: reviewer.fullName,
            previousReviewerName: handover.fromReviewer.fullName,
            reason: handover.reason ?? undefined,
          },
          now,
        );
        const fromReviewerId = handover.fromReviewerId;
        await this.notifications.createMany(tx, [
          {
            taskId: handover.taskId,
            recipientId: reviewer.id,
            type: NotificationType.TASK_ASSIGNED,
            title: `${handover.task.title} reassigned to you`,
            message: `${actor.name} reassigned this review task to ${reviewer.fullName}.`,
            email: reassignedEmail,
          },
          {
            taskId: handover.taskId,
            recipientId: handover.task.developerId,
            type: NotificationType.TASK_ASSIGNED,
            title: `${handover.task.title} has a new reviewer`,
            message: `${actor.name} assigned ${reviewer.fullName} to review your task.`,
            email: reassignedEmail,
          },
          ...(fromReviewerId === reviewer.id || fromReviewerId === actor.id
            ? []
            : [
                {
                  taskId: handover.taskId,
                  recipientId: fromReviewerId,
                  type: NotificationType.TASK_REASSIGNED,
                  title: `${handover.task.title} handover resolved`,
                  message: `${actor.name} reassigned the task you handed over to ${reviewer.fullName}.`,
                },
              ]),
        ]);

        const updated = await tx.handoverTask.findUnique({
          where: { id },
          include: handoverInclude,
        });
        if (!updated) throw new NotFoundException(`Handover ${id} was not found`);
        return this.toResponse(updated);
      }),
    );
  }

  async returnToQueue(id: string, actor: AuthenticatedUser) {
    return this.prisma.$transaction(async (tx) => {
      const handover = await tx.handoverTask.findUnique({
        where: { id },
        include: handoverInclude,
      });
      if (!handover) throw new NotFoundException(`Handover ${id} was not found`);
      if (handover.status !== HandoverStatus.PENDING) {
        throw new ApiException('ALREADY_RESOLVED', 'This handover has already been resolved');
      }
      const now = new Date();
      const resolved = await tx.handoverTask.updateMany({
        where: { id, status: HandoverStatus.PENDING },
        data: {
          status: HandoverStatus.RETURNED_TO_QUEUE,
          reassignedBy: actor.id,
          reassignedAt: now,
        },
      });
      if (resolved.count !== 1) {
        throw new ApiException('ALREADY_RESOLVED', 'This handover has already been resolved');
      }
      // Back in the open queue: whoever picks it next starts their own session
      // and judgement on the draft.
      await tx.codeReviewForm.updateMany({
        where: {
          taskId: handover.taskId,
          reviewCycleNumber: Math.max(handover.task.currentReviewCycle, 1),
          status: 'DRAFT',
        },
        data: {
          currentReviewSessionId: null,
          reviewRank: null,
          previousFeedbackReviewNote: null,
          previousFeedbackAcknowledged: null,
        },
      });
      await this.notifications.createMany(
        tx,
        [...new Set([handover.task.developerId, handover.fromReviewerId])]
          .filter((recipientId) => recipientId !== actor.id)
          .map((recipientId) => ({
            taskId: handover.taskId,
            recipientId,
            type: NotificationType.TASK_HANDOVER,
            title: `${handover.task.title} returned to the review queue`,
            message: `${actor.name} returned the handed-over task to the open review queue.`,
          })),
      );
      await this.audit.record(tx, actor, {
        actionType: 'HANDOVER_RETURNED_TO_QUEUE',
        entityType: 'HANDOVER',
        entityId: id,
        taskId: handover.taskId,
        description: `${actor.name} returned task '${handover.task.title}' to the open review queue`,
      });
      const updated = await tx.handoverTask.findUnique({
        where: { id },
        include: handoverInclude,
      });
      if (!updated) throw new NotFoundException(`Handover ${id} was not found`);
      return this.toResponse(updated);
    });
  }

  private toResponse(handover: HandoverWithRelations) {
    const status = {
      PENDING: 'Pending',
      REASSIGNED: 'Reassigned',
      CANCELLED: 'Cancelled',
      RETURNED_TO_QUEUE: 'ReturnedToQueue',
    }[handover.status];
    return {
      id: handover.id,
      taskId: handover.taskId,
      fromReviewerId: handover.fromReviewerId,
      fromReviewerName: handover.fromReviewer.fullName,
      reason: handover.reason ?? 'No reason provided',
      status,
      reassignedToId: handover.toReviewerId,
      reassignedToName: handover.toReviewer?.fullName ?? null,
      reassignedById: handover.reassignedBy,
      createdAt: handover.requestedAt.toISOString(),
      resolvedAt: handover.reassignedAt?.toISOString() ?? null,
    };
  }
}
