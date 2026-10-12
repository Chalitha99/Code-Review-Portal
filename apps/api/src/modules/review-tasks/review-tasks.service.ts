import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ChecklistAnswerValue,
  ChecklistStatus,
  HandoverStatus,
  NotificationType,
  Prisma,
  ReviewerAssignmentType,
  TaskStatus,
} from '@prisma/client';
import {
  MAX_SCREENSHOTS_PER_REVIEW,
  checklistDraftSchema,
  checklistSubmissionSchema,
  type ChecklistSubmission,
  type TaskEventKind,
} from '@sdp/contracts';
import { reasonMetadata } from '../../common/dto/reason.dto.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiException } from '../../common/api-error.js';
import { rethrowPrismaConflict, retryPrismaTransaction } from '../../common/prisma-errors.js';
import type { ChecklistAnswerDto, CreateReviewTaskDto } from './dto/create-review-task.dto.js';
import type { UpdateReviewTaskDto } from './dto/update-review-task.dto.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { formatTaskCode } from './task-code.js';
import {
  IMAGE_REJECTION_MESSAGES,
  inspectImageDataUrl,
} from '../../common/uploads/image-data-url.js';
import type { ReviewTaskScope } from './dto/review-task-query.dto.js';
import { AuditService } from '../audit/audit.service.js';
import type { CreateHandoverDto } from '../handovers/dto/create-handover.dto.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { taskEmail } from '../notifications/task-email.js';

const taskInclude = {
  customer: true,
  developer: true,
  currentReviewer: true,
  reviewerAssignments: {
    select: {
      id: true,
      reviewerId: true,
      assignedBy: true,
      assignmentType: true,
      isCurrent: true,
      reviewer: { select: { fullName: true } },
    },
    orderBy: { assignedAt: 'desc' },
    take: 2,
  },
  taskTypes: { include: { taskType: true } },
  developerChecklist: {
    include: {
      developer: true,
      answers: {
        include: { question: { include: { section: true } } },
        orderBy: { question: { displayOrder: 'asc' } },
      },
    },
  },
  codeReviewForms: {
    select: { reviewerId: true, decision: true },
    orderBy: [{ reviewCycleNumber: 'asc' }, { completedAt: 'asc' }],
  },
  reviewCycles: {
    select: { roundNumber: true, counted: true, exclusionReason: true },
    orderBy: { roundNumber: 'asc' },
  },
  handovers: {
    select: { status: true, fromReviewer: { select: { fullName: true } } },
    orderBy: { requestedAt: 'desc' },
  },
} satisfies Prisma.TaskInclude;

type TaskWithRelations = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;
type TaskVersionReader = Pick<Prisma.TransactionClient, 'task'>;

interface ReviewCycleProjection {
  roundNumber: number;
  counted: boolean;
}

export function deriveTaskReviewCycles(
  currentReviewRound: number,
  cycles: readonly ReviewCycleProjection[],
) {
  const adjustedCycles = cycles
    .filter(({ counted }) => !counted)
    .map(({ roundNumber }) => roundNumber);
  return {
    reviewCycle: cycles.filter(({ counted }) => counted).length,
    historicalCycle: currentReviewRound,
    adjustedCycles,
  };
}

/** A developer's note to the reviewer, trimmed; blank means "no note". */
function normalizeNote(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === '' ? null : trimmed;
}

function hasAdminAccess(user: AuthenticatedUser): boolean {
  return user.roles.includes('ADMIN') || user.roles.includes('SUPER_ADMIN');
}

function mayReadTask(user: AuthenticatedUser, task: TaskWithRelations): boolean {
  // A draft is the developer's private work: not even an admin sees it until it
  // is submitted (frontend taskPolicy.canViewTask, fix 8b9c161).
  if (task.status === TaskStatus.DRAFT) return task.developerId === user.id;
  const isPendingHandover = task.handovers.some(({ status }) => status === HandoverStatus.PENDING);
  return (
    hasAdminAccess(user) ||
    (user.roles.includes('DEVELOPER') && task.developerId === user.id) ||
    (user.roles.includes('REVIEWER') &&
      !isPendingHandover &&
      task.developerId !== user.id &&
      (task.currentReviewerId === user.id ||
        task.status === TaskStatus.SUBMITTED ||
        task.status === TaskStatus.RESUBMITTED ||
        task.codeReviewForms.some(({ reviewerId }) => reviewerId === user.id)))
  );
}

@Injectable()
export class ReviewTasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async findAll(user: AuthenticatedUser, scope: ReviewTaskScope = 'mine') {
    const tasks = await this.prisma.task.findMany({
      where: this.listWhere(user, scope),
      include: taskInclude,
      orderBy: { createdAt: 'desc' },
    });
    const visible = scope === 'history' ? this.latestDeciderOnly(tasks, user) : tasks;
    return {
      items: visible.map((task) => this.toResponse(task)),
      pagination: { page: 1, pageSize: Math.max(visible.length, 1), total: visible.length },
    };
  }

  /**
   * Home-page count (`{ total }`). Admins see every task that has left Draft;
   * everyone else counts the tasks they develop or currently review — never
   * someone else's draft.
   */
  async summary(user: AuthenticatedUser) {
    const where: Prisma.TaskWhereInput = hasAdminAccess(user)
      ? { status: { not: TaskStatus.DRAFT } }
      : {
          OR: [
            { developerId: user.id },
            { currentReviewerId: user.id, status: { not: TaskStatus.DRAFT } },
          ],
        };
    return { total: await this.prisma.task.count({ where }) };
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const task = await this.getTask(id);
    if (!mayReadTask(user, task)) throw new ApiException('TASK_NOT_FOUND', 'Task not found.');
    return this.toResponse(task);
  }

  async nextVersion(customerId: string, crimId: string) {
    const normalizedCrimId = crimId.trim();
    const [customer, version] = await Promise.all([
      this.prisma.customer.findUnique({ where: { id: customerId }, select: { code: true } }),
      this.nextTaskVersion(this.prisma, customerId, normalizedCrimId),
    ]);
    if (!customer) throw new NotFoundException(`Customer ${customerId} was not found`);
    return {
      version,
      title: this.taskTitle(customer.code, normalizedCrimId, String(version)),
    };
  }

  async findChecklist(id: string, user: AuthenticatedUser) {
    const task = await this.getTask(id);
    if (!mayReadTask(user, task)) throw new ApiException('TASK_NOT_FOUND', 'Task not found.');

    const checklist = task.developerChecklist;
    if (!checklist) return null;

    const answerValue = {
      YES: 'Yes',
      NO: 'No',
      NA: 'NA',
    } as const;

    return {
      id: checklist.id,
      taskId: task.id,
      taskTypeIds: task.taskTypes.map(({ taskTypeId }) => String(taskTypeId)),
      answers: checklist.answers.map((entry, order) => ({
        questionId: entry.questionId,
        answer: answerValue[entry.answer],
        questionText: entry.question.questionText,
        categoryName: entry.question.section.name,
        order,
      })),
      remarks: checklist.additionalRemarks ?? '',
      isComplete: task.checklistCompleted,
      checkedDate: (checklist.checkedDate ?? checklist.updatedAt).toISOString(),
      developerId: checklist.developerId,
    };
  }

  async saveChecklist(id: string, input: unknown, user: AuthenticatedUser) {
    const parsed = checklistDraftSchema.safeParse(input);
    if (!parsed.success) {
      throw new ApiException('VALIDATION_FAILED', 'Check the checklist data and try again', [
        ...parsed.error.issues,
      ]);
    }
    await this.update(
      id,
      {
        taskTypeIds: parsed.data.taskTypeIds.map(Number),
        checklistAnswers: parsed.data.answers.map(({ questionId, answer }) => ({
          questionId,
          answer: {
            Yes: ChecklistAnswerValue.YES,
            No: ChecklistAnswerValue.NO,
            NA: ChecklistAnswerValue.NA,
          }[answer],
        })),
        additionalRemarks: parsed.data.remarks,
      },
      user,
    );
    return this.findChecklist(id, user);
  }

  async findChecklistSubmissions(id: string, user: AuthenticatedUser) {
    const task = await this.getTask(id);
    if (!mayReadTask(user, task)) throw new ApiException('TASK_NOT_FOUND', 'Task not found.');
    const records = await this.prisma.auditLog.findMany({
      where: { taskId: id, action: { in: ['TASK_SUBMITTED', 'TASK_RESUBMITTED'] } },
      select: { metadata: true },
      orderBy: { createdAt: 'asc' },
    });
    const submissions = records.flatMap(({ metadata }) => {
      if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return [];
      const parsed = checklistSubmissionSchema.safeParse(metadata['checklistSubmission']);
      return parsed.success ? [parsed.data] : [];
    });
    if (submissions.length === 0 && task.submittedAt && task.developerChecklist) {
      submissions.push(this.toChecklistSubmission(task, 1, task.submittedAt, task.developerId));
    }
    // Newest first: the web client's ChecklistHistory treats the first entry as
    // the submission currently under review.
    return submissions.sort((left, right) => right.version - left.version);
  }

  async findEvents(id: string, user: AuthenticatedUser) {
    const task = await this.getTask(id);
    if (!mayReadTask(user, task)) throw new ApiException('TASK_NOT_FOUND', 'Task not found.');
    const logs = await this.prisma.auditLog.findMany({
      where: { taskId: id, userId: { not: null } },
      orderBy: { createdAt: 'asc' },
    });
    const kindByAction: Record<string, TaskEventKind | undefined> = {
      TASK_CREATED: 'Created',
      TASK_SUBMITTED: 'Submitted',
      TASK_RESUBMITTED: 'Resubmitted',
      TASK_PICKED: 'Picked',
      REVIEWER_ASSIGNED: 'ReviewerAssigned',
      REVIEWER_REASSIGNED: 'Reassigned',
      TASK_ASSIGNED: 'ReviewerAssigned',
      TASK_REASSIGNED: 'Reassigned',
      RESUBMISSION_REVIEWER_CHANGED: 'Reassigned',
      RESUBMISSION_REVIEWER_UNAVAILABLE: 'ReturnedToQueue',
      HANDOVER_RETURNED_TO_QUEUE: 'ReturnedToQueue',
      REVIEW_DRAFT_SAVED: 'ReviewDraftSaved',
      TASK_APPROVED: 'Approved',
      CHANGES_REQUESTED: 'ChangesRequested',
      TASK_HANDOVER: 'HandedOver',
      HANDOVER_REASSIGNED: 'Reassigned',
      TASK_CANCELLED: 'Cancelled',
      COUNTED_CYCLE_ADJUSTED: 'CountedCycleAdjusted',
    };
    // Round 0 until a reviewer first takes the task; each Request Changes then
    // closes a round, so later events belong to the round they happened in.
    const reviewStartActions = new Set([
      'TASK_PICKED',
      'TASK_ASSIGNED',
      'REVIEWER_ASSIGNED',
      'HANDOVER_REASSIGNED',
    ]);
    let round = 0;
    return logs.flatMap((log) => {
      const kind = kindByAction[log.action];
      if (reviewStartActions.has(log.action)) round = Math.max(round, 1);
      const eventRound = round;
      if (log.action === 'CHANGES_REQUESTED') round += 1;
      if (!kind || !log.userId) return [];
      const metadata =
        log.metadata && typeof log.metadata === 'object' && !Array.isArray(log.metadata)
          ? log.metadata
          : null;
      const values =
        log.newValues && typeof log.newValues === 'object' && !Array.isArray(log.newValues)
          ? log.newValues
          : null;
      const reason = metadata?.['reason'] ?? values?.['reason'];
      return [
        {
          id: log.id,
          taskId: id,
          kind,
          reviewCycle: eventRound,
          actorId: log.userId,
          actorName: log.actorName,
          // The admin's or reviewer's own words when there are any.
          note: typeof reason === 'string' && reason.trim() !== '' ? reason : null,
          occurredAt: log.createdAt.toISOString(),
          ...(kind === 'CountedCycleAdjusted' && metadata
            ? {
                qualifyingReviewRound: Number(metadata['qualifyingReviewRound']),
                previousCountedCycle: Number(metadata['previousCountedCycle']),
                newCountedCycle: Number(metadata['newCountedCycle']),
                adjustmentAmount: Number(metadata['adjustmentAmount']),
                reason: typeof metadata['reason'] === 'string' ? metadata['reason'] : '',
              }
            : {}),
        },
      ];
    });
  }

  async findAttachments(id: string, user: AuthenticatedUser) {
    const task = await this.getTask(id);
    if (!mayReadTask(user, task)) throw new ApiException('TASK_NOT_FOUND', 'Task not found.');
    const rows = await this.prisma.taskAttachment.findMany({
      where: { taskId: id },
      orderBy: [{ uploadedAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => this.toAttachment(row));
  }

  async addAttachment(id: string, input: unknown, user: AuthenticatedUser) {
    const task = await this.getEditableTask(id, user);
    const body = input as Record<string, unknown>;
    const fileName = typeof body['fileName'] === 'string' ? body['fileName'].trim() : '';
    const storageRef = typeof body['dataUrl'] === 'string' ? body['dataUrl'] : '';
    if (!fileName || fileName.length > 255 || !storageRef) {
      throw new ApiException('VALIDATION_FAILED', 'Provide a valid image attachment');
    }
    // Same caps as the web client (lib/attachments.ts rejectAttachment), but
    // checked on the decoded bytes: the declared size and type are not trusted.
    const existingCount = await this.prisma.taskAttachment.count({ where: { taskId: task.id } });
    if (existingCount >= MAX_SCREENSHOTS_PER_REVIEW) {
      throw new ApiException(
        'ATTACHMENT_REJECTED',
        `A task can have at most ${String(MAX_SCREENSHOTS_PER_REVIEW)} attachments.`,
      );
    }
    const image = inspectImageDataUrl(storageRef);
    if (!image.ok) {
      throw new ApiException(
        image.reason === 'wrongType' ? 'UNSUPPORTED_MEDIA_TYPE' : 'ATTACHMENT_REJECTED',
        IMAGE_REJECTION_MESSAGES[image.reason],
      );
    }
    await this.prisma.taskAttachment.create({
      data: {
        taskId: task.id,
        fileName,
        mimeType: image.mimeType,
        storageRef,
        sizeBytes: image.sizeBytes,
        uploadedById: user.id,
      },
    });
    return this.findAttachments(id, user);
  }

  async captionAttachment(
    id: string,
    attachmentId: string,
    input: unknown,
    user: AuthenticatedUser,
  ) {
    await this.getEditableTask(id, user);
    const body = input as Record<string, unknown>;
    const exists = await this.prisma.taskAttachment.count({
      where: { id: attachmentId, taskId: id },
    });
    if (exists !== 1) throw new NotFoundException(`Attachment ${attachmentId} was not found`);
    // A PATCH without `caption` leaves it as it is; an empty string clears it.
    if (typeof body['caption'] === 'string') {
      const caption = body['caption'].trim();
      if (caption.length > 500) {
        throw new ApiException('VALIDATION_FAILED', 'A caption can be at most 500 characters');
      }
      await this.prisma.taskAttachment.update({ where: { id: attachmentId }, data: { caption } });
    }
    return this.findAttachments(id, user);
  }

  async removeAttachment(id: string, attachmentId: string, user: AuthenticatedUser) {
    await this.getEditableTask(id, user);
    const removed = await this.prisma.taskAttachment.deleteMany({
      where: { id: attachmentId, taskId: id },
    });
    if (removed.count !== 1)
      throw new NotFoundException(`Attachment ${attachmentId} was not found`);
    return this.findAttachments(id, user);
  }

  private async getTask(id: string) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: taskInclude,
    });
    if (!task) throw new ApiException('TASK_NOT_FOUND', `Review task ${id} was not found`);
    return task;
  }

  async create(dto: CreateReviewTaskDto, actor: AuthenticatedUser) {
    const developerId = actor.id;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const [customer, developer] = await Promise.all([
              tx.customer.findUnique({ where: { id: dto.customerId } }),
              tx.user.findFirst({ where: { id: developerId, deletedAt: null } }),
            ]);
            if (!customer) throw new NotFoundException(`Customer ${dto.customerId} was not found`);
            if (!developer) throw new NotFoundException(`Developer ${developerId} was not found`);

            const hasChecklist = this.hasChecklistPayload(dto);
            const checklist = hasChecklist
              ? await this.validateChecklist(tx, dto.taskTypeIds!, dto.checklistAnswers!)
              : null;
            const checklistCompleted = checklist?.complete ?? false;
            const checklistAnswers = checklist?.answers ?? [];
            const aggregate = await tx.task.aggregate({
              where: { customerId: dto.customerId },
              _max: { customerSequenceNo: true },
            });
            const sequence = (aggregate._max.customerSequenceNo ?? 0) + 1;
            const crimId = dto.crimId.trim();
            const version = await this.nextTaskVersion(tx, dto.customerId, crimId);
            const created = await tx.task.create({
              data: {
                taskCode: formatTaskCode(customer.name, sequence),
                customerSequenceNo: sequence,
                title: this.taskTitle(customer.code, crimId, String(version)),
                crimId,
                version: String(version),
                priority: dto.priority,
                status: TaskStatus.DRAFT,
                checklistCompleted,
                customerId: dto.customerId,
                developerId,
                noteToReviewer: normalizeNote(dto.noteToReviewer),
                ...(hasChecklist
                  ? {
                      ...(dto.taskTypeIds!.length > 0
                        ? {
                            taskTypes: {
                              create: dto.taskTypeIds!.map((taskTypeId) => ({ taskTypeId })),
                            },
                          }
                        : {}),
                      developerChecklist: {
                        create: {
                          developerId,
                          additionalRemarks: dto.additionalRemarks?.trim() ?? null,
                          status: checklistCompleted
                            ? ChecklistStatus.COMPLETED
                            : ChecklistStatus.DRAFT,
                          checkedDate: checklistCompleted ? new Date() : null,
                          completedAt: checklistCompleted ? new Date() : null,
                          ...(checklistAnswers.length > 0
                            ? { answers: { create: checklistAnswers } }
                            : {}),
                        },
                      },
                    }
                  : {}),
                statusHistory: {
                  create: {
                    newStatus: TaskStatus.DRAFT,
                    changedBy: developerId,
                    remarks: 'Draft task created',
                  },
                },
              },
              include: taskInclude,
            });
            await this.audit.record(tx, actor, {
              actionType: 'TASK_CREATED',
              entityType: 'TASK',
              entityId: created.id,
              taskId: created.id,
              description: `${actor.name} created task '${created.title}'`,
              newValue: {
                taskCode: created.taskCode,
                title: created.title,
                crimId: created.crimId,
                version: created.version,
                status: created.status,
              },
            });
            if (checklistCompleted) {
              await this.audit.record(tx, actor, {
                actionType: 'CHECKLIST_COMPLETED',
                entityType: 'CHECKLIST',
                entityId: created.developerChecklist?.id ?? created.id,
                taskId: created.id,
                description: `${actor.name} completed the checklist for task '${created.title}'`,
              });
            }
            return this.toResponse(created);
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034' &&
          attempt < 2
        )
          continue;
        rethrowPrismaConflict(error);
      }
    }
    throw new ApiException('VERSION_CONFLICT', 'Could not allocate a task number; please retry');
  }

  async update(id: string, dto: UpdateReviewTaskDto, user: AuthenticatedUser) {
    // Only the owning developer edits, and only while the task is theirs to
    // change: a Draft, or ChangesRequested. Everything after submit is the
    // reviewer's record.
    await this.getEditableTask(id, user);
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const existing = await tx.task.findUnique({
            where: { id },
            include: {
              taskTypes: true,
              developerChecklist: { include: { answers: true } },
              customer: true,
            },
          });
          if (!existing)
            throw new ApiException('TASK_NOT_FOUND', `Review task ${id} was not found`);

          if (
            (dto.customerId !== undefined && dto.customerId !== existing.customerId) ||
            (dto.crimId !== undefined &&
              dto.crimId.trim().toLocaleLowerCase() !== existing.crimId.trim().toLocaleLowerCase())
          ) {
            throw new ApiException(
              'IMMUTABLE_TASK_IDENTITY',
              'Customer and CRIM ID cannot be changed after the draft is created',
            );
          }

          const hasChecklist = this.hasChecklistPayload(dto);
          const checklist = hasChecklist
            ? await this.validateChecklist(tx, dto.taskTypeIds!, dto.checklistAnswers!)
            : null;
          const checklistCompleted = checklist?.complete ?? existing.checklistCompleted;
          const checklistAnswers = checklist?.answers ?? [];

          const developerId = existing.developerId;

          let customerId = existing.customerId;
          let customerCode = existing.customer.code;
          let customerSequenceNo = existing.customerSequenceNo;
          let taskCode = existing.taskCode;
          if (dto.customerId && dto.customerId !== existing.customerId) {
            const customer = await tx.customer.findUnique({
              where: { id: dto.customerId },
            });
            if (!customer) throw new NotFoundException(`Customer ${dto.customerId} was not found`);
            const aggregate = await tx.task.aggregate({
              where: { customerId: dto.customerId },
              _max: { customerSequenceNo: true },
            });
            customerId = customer.id;
            customerCode = customer.code;
            customerSequenceNo = (aggregate._max.customerSequenceNo ?? 0) + 1;
            taskCode = formatTaskCode(customer.name, customerSequenceNo);
          }

          if (hasChecklist) await tx.taskTaskType.deleteMany({ where: { taskId: id } });
          if (hasChecklist && dto.taskTypeIds!.length > 0)
            await tx.taskTaskType.createMany({
              data: dto.taskTypeIds!.map((taskTypeId) => ({
                taskId: id,
                taskTypeId,
              })),
            });
          if (hasChecklist && existing.developerChecklist) {
            await tx.checklistAnswer.deleteMany({
              where: { checklistId: existing.developerChecklist.id },
            });
            if (checklistAnswers.length > 0) {
              await tx.checklistAnswer.createMany({
                data: checklistAnswers.map((answer) => ({
                  ...answer,
                  checklistId: existing.developerChecklist!.id,
                })),
              });
            }
          }

          const crimId = dto.crimId?.trim() ?? existing.crimId;
          if (hasChecklist) {
            const checklistData = {
              developerId,
              additionalRemarks: dto.additionalRemarks?.trim() ?? null,
              status: checklistCompleted ? ChecklistStatus.COMPLETED : ChecklistStatus.DRAFT,
              checkedDate: checklistCompleted ? new Date() : null,
              completedAt: checklistCompleted ? new Date() : null,
            } as const;
            if (existing.developerChecklist) {
              await tx.developerChecklist.update({
                where: { id: existing.developerChecklist.id },
                data: checklistData,
              });
            } else {
              await tx.developerChecklist.create({
                data: {
                  ...checklistData,
                  taskId: id,
                  ...(checklistAnswers.length > 0 ? { answers: { create: checklistAnswers } } : {}),
                },
              });
            }
          }
          const updated = await tx.task.update({
            where: { id },
            data: {
              customerId,
              customerSequenceNo,
              taskCode,
              title: this.taskTitle(customerCode, crimId, existing.version),
              crimId,
              ...(dto.priority === undefined ? {} : { priority: dto.priority }),
              ...(dto.noteToReviewer === undefined
                ? {}
                : { noteToReviewer: normalizeNote(dto.noteToReviewer) }),
              developerId,
              ...(hasChecklist ? { checklistCompleted } : {}),
            },
            include: taskInclude,
          });
          if (hasChecklist && !existing.checklistCompleted && checklistCompleted) {
            await this.audit.record(tx, user, {
              actionType: 'CHECKLIST_COMPLETED',
              entityType: 'CHECKLIST',
              entityId: updated.developerChecklist?.id ?? updated.id,
              taskId: updated.id,
              description: `${user.name} completed the checklist for task '${updated.title}'`,
            });
          }
          return this.toResponse(updated);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      rethrowPrismaConflict(error);
    }
  }

  /**
   * Two different powers share this route (frontend lib/taskPolicy.ts):
   *  - the owning developer discards their own Draft, unless it carries
   *    submitted evidence (409 DRAFT_HAS_SUBMITTED_EVIDENCE);
   *  - the Super Admin permanently purges a Draft or Cancelled task that has no
   *    workflow evidence (409 TASK_HAS_WORKFLOW_EVIDENCE), with a reason.
   */
  async remove(id: string, actor: AuthenticatedUser, reason?: string): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const task = await tx.task.findUnique({
          where: { id },
          include: { developerChecklist: true },
        });
        if (!task) throw new ApiException('TASK_NOT_FOUND', `Review task ${id} was not found`);
        const evidence = await this.workflowEvidence(tx, id);
        const isOwnDraft =
          actor.roles.includes('DEVELOPER') &&
          task.developerId === actor.id &&
          task.status === TaskStatus.DRAFT;
        if (isOwnDraft) {
          if (evidence.submitted) {
            throw new ApiException(
              'DRAFT_HAS_SUBMITTED_EVIDENCE',
              'This draft has submitted evidence and cannot be discarded.',
            );
          }
        } else {
          if (!actor.roles.includes('SUPER_ADMIN')) {
            throw new ApiException('FORBIDDEN', 'You do not have access to purge tasks.');
          }
          if (
            (task.status !== TaskStatus.DRAFT && task.status !== TaskStatus.CANCELLED) ||
            evidence.submitted ||
            evidence.workflow
          ) {
            throw new ApiException(
              'TASK_HAS_WORKFLOW_EVIDENCE',
              'Tasks with submitted review evidence, review comments, or workflow history cannot be permanently deleted.',
            );
          }
          if (!reason?.trim()) {
            throw new ApiException(
              'REASON_REQUIRED',
              'Provide a reason for permanently deleting this task.',
            );
          }
        }
        if (task.developerChecklist) {
          await tx.checklistAnswer.deleteMany({
            where: { checklistId: task.developerChecklist.id },
          });
          await tx.developerChecklist.delete({
            where: { id: task.developerChecklist.id },
          });
        }
        await tx.taskStatusHistory.deleteMany({ where: { taskId: id } });
        await tx.taskTaskType.deleteMany({ where: { taskId: id } });
        await tx.taskAttachment.deleteMany({ where: { taskId: id } });
        await tx.notification.deleteMany({ where: { taskId: id } });
        await tx.task.delete({ where: { id } });
        await this.audit.record(tx, actor, {
          actionType: 'TASK_DELETED',
          entityType: 'TASK',
          entityId: id,
          taskId: id,
          description: `${actor.name} deleted task '${task.title}'`,
          oldValue: { taskCode: task.taskCode },
          metadata: { targetLabel: task.taskCode, ...reasonMetadata(reason) },
        });
      });
    } catch (error) {
      rethrowPrismaConflict(error);
    }
  }

  async submit(id: string, user: AuthenticatedUser) {
    const task = await this.getTask(id);
    // Submitting is the owning developer's act (frontend canSubmitTask).
    if (task.developerId !== user.id) {
      throw new ApiException('FORBIDDEN', 'Only the owning developer may submit this task.');
    }
    const isResubmission = task.status === TaskStatus.CHANGES_REQUESTED;
    if (task.status !== TaskStatus.DRAFT && !isResubmission) {
      throw new ApiException(
        'INVALID_STATE',
        'Only a draft or changes-requested task can be submitted',
      );
    }
    if (!task.checklistCompleted) {
      throw new ApiException(
        'CHECKLIST_INCOMPLETE',
        'Complete the quality checklist before submitting',
      );
    }
    /*
     * Resubmission routing (docs/25-review-assignment-rules.md): the task goes
     * straight back to its follow-up reviewer — the one an admin chose, or else
     * the reviewer who requested the changes — never to the open pool. Only if
     * that reviewer is no longer eligible (should be unreachable: deactivation
     * is blocked while they hold pending work) does it fall back to the pool,
     * with the previous reviewer kept in history, the audit log and a notice to
     * the admins.
     */
    let resubmissionReviewerId: string | null = null;
    let unavailableReviewer: { id: string; name: string } | null = null;
    if (isResubmission) {
      const latestChangesReview = await this.prisma.codeReviewForm.findFirst({
        where: { taskId: id, decision: 'CHANGES_REQUESTED' },
        select: { reviewerId: true, findings: { select: { id: true } } },
        orderBy: [{ reviewCycleNumber: 'desc' }, { completedAt: 'desc' }],
      });
      if (!latestChangesReview) {
        throw new ApiException('INVALID_STATE', 'No previous changes-requested review was found.');
      }
      const followUpId = task.resubmissionReviewerId ?? latestChangesReview.reviewerId;
      const followUp = await this.prisma.user.findUnique({
        where: { id: followUpId },
        select: {
          id: true,
          fullName: true,
          status: true,
          deletedAt: true,
          userRoles: {
            where: { role: { code: 'REVIEWER', deletedAt: null } },
            select: { roleId: true },
          },
        },
      });
      const isEligible =
        followUp !== null &&
        followUp.status === 'ACTIVE' &&
        followUp.deletedAt === null &&
        followUp.userRoles.length > 0 &&
        followUp.id !== task.developerId;
      if (isEligible) {
        resubmissionReviewerId = followUp.id;
      } else {
        unavailableReviewer = {
          id: followUpId,
          name: followUp?.fullName ?? 'the previous reviewer',
        };
      }
      const findingIds = latestChangesReview.findings.map(({ id: findingId }) => findingId);
      const responses = await this.prisma.developerFindingResponse.findMany({
        where: {
          findingId: { in: findingIds },
          developerId: task.developerId,
          reviewCycleNumber: task.currentReviewCycle + 1,
        },
        select: { findingId: true, decision: true, rejectionReason: true },
      });
      const answered = new Set(
        responses
          .filter(
            ({ decision, rejectionReason }) =>
              decision !== 'REJECTED' || Boolean(rejectionReason?.trim()),
          )
          .map(({ findingId }) => findingId),
      );
      if (findingIds.some((findingId) => !answered.has(findingId))) {
        throw new ApiException(
          'RESPONSES_INCOMPLETE',
          'Respond to every review finding before resubmitting',
        );
      }
    }

    const submitted = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const submissionVersion =
        (await tx.auditLog.count({
          where: { taskId: id, action: { in: ['TASK_SUBMITTED', 'TASK_RESUBMITTED'] } },
        })) + 1;
      const checklistSubmission = this.toChecklistSubmission(task, submissionVersion, now, user.id);
      const nextStatus = isResubmission ? TaskStatus.RESUBMITTED : TaskStatus.SUBMITTED;
      const existingResubmissionNotifications = isResubmission
        ? await tx.notification.findMany({
            where: { taskId: id, notificationType: NotificationType.TASK_RESUBMITTED },
            select: { id: true },
          })
        : [];
      if (isResubmission && resubmissionReviewerId !== null) {
        await tx.taskReviewerAssignment.updateMany({
          where: { taskId: id, isCurrent: true },
          data: { isCurrent: false, unassignedAt: now },
        });
        await tx.taskReviewerAssignment.create({
          data: {
            taskId: id,
            reviewerId: resubmissionReviewerId,
            assignedBy: null,
            assignmentType: ReviewerAssignmentType.ADMIN_REASSIGNED,
          },
        });
      }
      let updated = await tx.task.update({
        where: { id },
        data: {
          status: nextStatus,
          submittedAt: now,
          resubmissionReviewerId: null,
          statusHistory: {
            create: {
              oldStatus: task.status,
              newStatus: nextStatus,
              changedBy: user.id,
              remarks: isResubmission ? 'Task resubmitted for review' : 'Task submitted for review',
            },
          },
        },
        include: taskInclude,
      });
      if (isResubmission && unavailableReviewer !== null) {
        // Pool fallback: nobody holds the task now, and the previous reviewer's
        // name stays on the record.
        await tx.taskReviewerAssignment.updateMany({
          where: { taskId: id, isCurrent: true },
          data: { isCurrent: false, unassignedAt: now },
        });
        await tx.notification.deleteMany({
          where: {
            taskId: id,
            notificationType: NotificationType.TASK_RESUBMITTED,
            id: { notIn: existingResubmissionNotifications.map(({ id }) => id) },
          },
        });
        await tx.taskStatusHistory.create({
          data: {
            taskId: id,
            oldStatus: TaskStatus.RESUBMITTED,
            newStatus: TaskStatus.RESUBMITTED,
            changedBy: user.id,
            remarks: `Original reviewer ${unavailableReviewer.name} unavailable; returned to the review pool`,
          },
        });
        await this.audit.record(tx, user, {
          actionType: 'RESUBMISSION_REVIEWER_UNAVAILABLE',
          entityType: 'TASK',
          entityId: id,
          taskId: id,
          targetUserId: unavailableReviewer.id,
          description: `${task.title} returned to the review pool: ${unavailableReviewer.name} is no longer an eligible reviewer`,
          metadata: {
            previousReviewerId: unavailableReviewer.id,
            previousReviewerName: unavailableReviewer.name,
            reason: `${unavailableReviewer.name} is no longer an eligible reviewer`,
          },
        });
        const admins = await tx.user.findMany({
          where: {
            status: 'ACTIVE',
            deletedAt: null,
            userRoles: {
              some: { role: { code: { in: ['ADMIN', 'SUPER_ADMIN'] }, deletedAt: null } },
            },
          },
          select: { id: true },
        });
        await this.notifications.createMany(
          tx,
          admins.map(({ id: recipientId }) => ({
            taskId: id,
            recipientId,
            type: NotificationType.TASK_RESUBMITTED,
            title: `${task.title} resubmitted to the review pool`,
            message: `${unavailableReviewer.name} is no longer available, so any reviewer can pick it up.`,
            email: taskEmail(
              'RESUBMISSION_UNASSIGNED',
              user.name,
              {
                developerName: user.name,
                previousReviewerName: unavailableReviewer.name,
                reason: `${unavailableReviewer.name} is no longer an eligible reviewer`,
              },
              now,
            ),
          })),
        );
      }
      if (isResubmission && resubmissionReviewerId !== null) {
        await tx.notification.deleteMany({
          where: {
            taskId: id,
            notificationType: NotificationType.TASK_RESUBMITTED,
            recipientId: { not: resubmissionReviewerId },
            id: { notIn: existingResubmissionNotifications.map(({ id }) => id) },
          },
        });
        updated = await tx.task.update({
          where: { id },
          data: {
            status: TaskStatus.IN_REVIEW,
            currentReviewerId: resubmissionReviewerId,
            statusHistory: {
              create: {
                oldStatus: TaskStatus.RESUBMITTED,
                newStatus: TaskStatus.IN_REVIEW,
                changedBy: user.id,
                remarks: 'Task returned to the reviewer who requested changes',
              },
            },
          },
          include: taskInclude,
        });
        await this.notifications.queueEmailForTriggerRows(tx, {
          taskId: id,
          recipientIds: [resubmissionReviewerId],
          types: [NotificationType.TASK_RESUBMITTED],
          payload: taskEmail(
            'TASK_RESUBMITTED',
            user.name,
            {
              reviewerId: resubmissionReviewerId,
              developerName: user.name,
              round: task.currentReviewCycle + 1,
            },
            now,
          ),
        });
      }
      await this.audit.record(tx, user, {
        actionType: isResubmission ? 'TASK_RESUBMITTED' : 'TASK_SUBMITTED',
        entityType: 'TASK',
        entityId: id,
        taskId: id,
        description: `${user.name} ${isResubmission ? 'resubmitted' : 'submitted'} task '${task.title}'`,
        oldValue: { status: task.status },
        newValue: {
          status: updated.status,
          ...(resubmissionReviewerId === null ? {} : { currentReviewerId: resubmissionReviewerId }),
        },
        metadata: { checklistSubmission: checklistSubmission as Prisma.InputJsonObject },
      });
      if (!isResubmission) {
        const recipients = await tx.user.findMany({
          where: {
            status: 'ACTIVE',
            deletedAt: null,
            userRoles: {
              some: {
                role: {
                  code: { in: ['REVIEWER', 'ADMIN', 'SUPER_ADMIN'] },
                  deletedAt: null,
                },
              },
            },
          },
          select: { id: true },
        });
        await this.notifications.createMany(
          tx,
          recipients.map(({ id: recipientId }) => ({
            taskId: id,
            recipientId,
            type: NotificationType.TASK_SUBMITTED,
            title: `${task.title} submitted for review`,
            message: `${user.name} submitted a new review task.`,
          })),
        );
      }
      // The RESUBMITTED transition above uses the existing database notification
      // mechanism after the previous reviewer assignment has been restored.
      return updated;
    });
    return this.toResponse(submitted);
  }

  async pick(id: string, user: AuthenticatedUser) {
    return retryPrismaTransaction(() =>
      this.prisma.$transaction(async (tx) => {
        const candidate = await tx.task.findUnique({
          where: { id },
          select: {
            developerId: true,
            currentReviewerId: true,
            status: true,
            title: true,
            currentReviewCycle: true,
            currentReviewer: { select: { fullName: true } },
            handovers: {
              where: { status: HandoverStatus.PENDING },
              orderBy: { requestedAt: 'desc' },
              take: 1,
              select: {
                id: true,
                reason: true,
                fromReviewerId: true,
                fromReviewer: { select: { fullName: true } },
              },
            },
          },
        });
        if (!candidate) throw new ApiException('TASK_NOT_FOUND', `Review task ${id} was not found`);
        if (candidate.developerId === user.id) {
          throw new ForbiddenException('You cannot review your own task');
        }
        if (candidate.currentReviewerId !== null) {
          throw new ApiException(
            'ALREADY_PICKED',
            candidate.currentReviewer?.fullName
              ? `${candidate.currentReviewer.fullName} has already picked up this task`
              : 'Another reviewer has already picked up this task',
          );
        }
        if (
          candidate.status !== TaskStatus.SUBMITTED &&
          candidate.status !== TaskStatus.RESUBMITTED
        ) {
          throw new ApiException('INVALID_STATE', 'This task is not available to pick');
        }

        // The conditional update is the concurrency control. If two reviewers
        // pick simultaneously, only the first request can match this predicate.
        const claimed = await tx.task.updateMany({
          where: {
            id,
            developerId: { not: user.id },
            currentReviewerId: null,
            status: { in: [TaskStatus.SUBMITTED, TaskStatus.RESUBMITTED] },
          },
          data: {
            currentReviewerId: user.id,
            status: TaskStatus.IN_REVIEW,
          },
        });

        if (claimed.count !== 1) {
          const winner = await tx.task.findUnique({
            where: { id },
            select: { currentReviewer: { select: { fullName: true } } },
          });
          throw new ApiException(
            'ALREADY_PICKED',
            winner?.currentReviewer?.fullName
              ? `${winner.currentReviewer.fullName} has already picked up this task`
              : 'This task was picked up or changed by another reviewer',
          );
        }

        const now = new Date();
        await tx.taskReviewerAssignment.updateMany({
          where: { taskId: id, isCurrent: true },
          data: { isCurrent: false, unassignedAt: now },
        });
        const pendingHandover = candidate.handovers[0];
        if (pendingHandover) {
          const resolved = await tx.handoverTask.updateMany({
            where: { taskId: id, status: HandoverStatus.PENDING },
            data: {
              status: HandoverStatus.REASSIGNED,
              toReviewerId: user.id,
              reassignedBy: user.id,
              reassignedAt: now,
            },
          });
          if (resolved.count < 1) {
            throw new ApiException('ALREADY_RESOLVED', 'This handover was already reassigned');
          }
        }
        const assignment = await tx.taskReviewerAssignment.create({
          data: {
            taskId: id,
            reviewerId: user.id,
            assignedBy: user.id,
            assignmentType: pendingHandover
              ? ReviewerAssignmentType.HANDOVER_REASSIGNED
              : ReviewerAssignmentType.SELF_PICKED,
          },
        });
        // The picker starts their own judgement on the open draft: the previous
        // reviewer's rank and carried-over note do not transfer (as on assign).
        await tx.codeReviewForm.updateMany({
          where: {
            taskId: id,
            reviewCycleNumber: Math.max(candidate.currentReviewCycle, 1),
            status: 'DRAFT',
          },
          data: {
            reviewerId: user.id,
            currentReviewSessionId: assignment.id,
            reviewRank: null,
            previousFeedbackReviewNote: null,
            previousFeedbackAcknowledged: null,
          },
        });
        await tx.taskStatusHistory.create({
          data: {
            taskId: id,
            oldStatus: candidate.status,
            newStatus: TaskStatus.IN_REVIEW,
            changedBy: user.id,
            remarks: 'Task picked up for review',
          },
        });
        await this.audit.record(tx, user, {
          actionType: 'TASK_PICKED',
          entityType: 'TASK',
          entityId: id,
          taskId: id,
          description: `${user.name} picked task '${candidate.title}' for review`,
          oldValue: { status: candidate.status, reviewerId: null },
          newValue: { status: TaskStatus.IN_REVIEW, reviewerId: user.id },
        });
        await this.notifications.create(tx, {
          taskId: id,
          recipientId: candidate.developerId,
          type: NotificationType.TASK_ASSIGNED,
          title: `${candidate.title} picked for review`,
          message: `${user.name} picked up your review task.`,
          email: taskEmail(
            'TASK_PICKED',
            user.name,
            { reviewerId: user.id, reviewerName: user.name },
            now,
          ),
        });
        if (pendingHandover) {
          if (pendingHandover.fromReviewerId !== user.id) {
            const administrators = await tx.user.findMany({
              where: {
                status: 'ACTIVE',
                deletedAt: null,
                userRoles: {
                  some: { role: { code: { in: ['ADMIN', 'SUPER_ADMIN'] }, deletedAt: null } },
                },
              },
              select: { id: true },
            });
            await this.notifications.createMany(tx, [
              {
                taskId: id,
                recipientId: pendingHandover.fromReviewerId,
                type: NotificationType.TASK_HANDOVER,
                title: `${candidate.title} handover picked up`,
                message: `${user.name} picked up the review task you handed over.`,
              },
              ...administrators
                .filter(
                  ({ id: administratorId }) =>
                    administratorId !== user.id &&
                    administratorId !== candidate.developerId &&
                    administratorId !== pendingHandover.fromReviewerId,
                )
                .map(({ id: recipientId }) => ({
                  taskId: id,
                  recipientId,
                  type: NotificationType.TASK_HANDOVER,
                  title: `${candidate.title} handover picked up`,
                  message: `${user.name} picked up the handed-over review task.`,
                })),
            ]);
          }
          await this.audit.record(tx, user, {
            actionType: 'HANDOVER_REASSIGNED',
            entityType: 'HANDOVER',
            entityId: pendingHandover.id,
            taskId: id,
            targetUserId: user.id,
            description: `${user.name} picked handed-over task '${candidate.title}' from ${pendingHandover.fromReviewer.fullName}. Handover reason: ${pendingHandover.reason ?? 'Not provided'}`,
            oldValue: {
              reviewerId: pendingHandover.fromReviewerId,
              reviewerName: pendingHandover.fromReviewer.fullName,
              reason: pendingHandover.reason,
            },
            newValue: { reviewerId: user.id, reviewerName: user.name },
          });
        }
        await this.audit.record(tx, user, {
          actionType: 'REVIEW_STARTED',
          entityType: 'REVIEW',
          entityId: id,
          taskId: id,
          description: `${user.name} started reviewing task '${candidate.title}'`,
        });

        const task = await tx.task.findUnique({ where: { id }, include: taskInclude });
        if (!task) throw new ApiException('TASK_NOT_FOUND', `Review task ${id} was not found`);
        return this.toResponse(task);
      }),
    );
  }

  async assign(id: string, reviewerId: string, actor: AuthenticatedUser, reason?: string) {
    return this.prisma.$transaction(async (tx) => {
      const task = await tx.task.findUnique({
        where: { id },
        select: {
          id: true,
          title: true,
          developerId: true,
          currentReviewerId: true,
          currentReviewCycle: true,
          status: true,
          currentReviewer: { select: { fullName: true } },
          handovers: { where: { status: HandoverStatus.PENDING }, select: { id: true } },
        },
      });
      if (!task) throw new ApiException('TASK_NOT_FOUND', `Review task ${id} was not found`);
      if (task.handovers.length > 0) {
        throw new ApiException(
          'HANDOVER_PENDING',
          'Use the handover reassignment action for this task.',
        );
      }
      if (task.status === TaskStatus.CHANGES_REQUESTED) {
        throw new ApiException(
          'CHANGES_REQUESTED_ACTIVE',
          'The developer is addressing requested changes. Change the follow-up reviewer instead.',
        );
      }
      if (
        task.status !== TaskStatus.SUBMITTED &&
        task.status !== TaskStatus.RESUBMITTED &&
        task.status !== TaskStatus.IN_REVIEW
      ) {
        throw new ApiException(
          'INVALID_STATE',
          'This task cannot be assigned in its current state.',
        );
      }
      // Taking a review away from someone mid-way needs a recorded reason.
      if (task.status === TaskStatus.IN_REVIEW && !reason?.trim()) {
        throw new ApiException('REASON_REQUIRED', 'Provide a reason for reassigning this review.');
      }

      const reviewer = await tx.user.findFirst({
        where: {
          id: reviewerId,
          status: 'ACTIVE',
          deletedAt: null,
          userRoles: { some: { role: { code: 'REVIEWER', deletedAt: null } } },
        },
        select: { id: true, fullName: true },
      });
      if (!reviewer) throw new ApiException('INVALID_REVIEWER', 'Select an active Reviewer.');
      if (reviewer.id === task.developerId) {
        throw new ApiException('SELF_REVIEW', 'A developer cannot review their own task.');
      }
      if (task.currentReviewerId === reviewer.id) {
        throw new ApiException(
          'SAME_REVIEWER',
          `${reviewer.fullName} is already assigned to this task.`,
        );
      }

      const isReassignment = task.currentReviewerId !== null;
      const now = new Date();
      await tx.taskReviewerAssignment.updateMany({
        where: { taskId: id, isCurrent: true },
        data: { isCurrent: false, unassignedAt: now },
      });
      const assignment = await tx.taskReviewerAssignment.create({
        data: {
          taskId: id,
          reviewerId: reviewer.id,
          assignedBy: actor.id,
          assignmentType: isReassignment
            ? ReviewerAssignmentType.ADMIN_REASSIGNED
            : ReviewerAssignmentType.ADMIN_ASSIGNED,
        },
      });
      await tx.codeReviewForm.updateMany({
        where: {
          taskId: id,
          reviewCycleNumber: Math.max(task.currentReviewCycle, 1),
          status: 'DRAFT',
        },
        // The new reviewer starts their own judgement: the previous reviewer's
        // rank and carried-over note do not transfer.
        data: {
          reviewerId: reviewer.id,
          currentReviewSessionId: assignment.id,
          reviewRank: null,
          previousFeedbackReviewNote: null,
          previousFeedbackAcknowledged: null,
        },
      });
      await tx.task.update({
        where: { id },
        data: { currentReviewerId: reviewer.id, status: TaskStatus.IN_REVIEW },
      });
      await tx.taskStatusHistory.create({
        data: {
          taskId: id,
          oldStatus: task.status,
          newStatus: TaskStatus.IN_REVIEW,
          changedBy: actor.id,
          remarks: `${isReassignment ? 'Reassigned' : 'Assigned'} to ${reviewer.fullName}${reason?.trim() ? `: ${reason.trim()}` : ''}`,
        },
      });
      const assignedEmail = taskEmail(
        'REVIEWER_ASSIGNED',
        actor.name,
        {
          reviewerId: reviewer.id,
          reviewerName: reviewer.fullName,
          previousReviewerName: task.currentReviewer?.fullName,
          reason: reason?.trim(),
        },
        now,
      );
      await this.notifications.createMany(tx, [
        {
          taskId: id,
          recipientId: reviewer.id,
          type: NotificationType.TASK_ASSIGNED,
          title: `${task.title} ${isReassignment ? 'reassigned' : 'assigned'} to you`,
          message: `${actor.name} ${isReassignment ? 'reassigned' : 'assigned'} this review task to ${reviewer.fullName}.`,
          email: assignedEmail,
        },
        ...(task.developerId === actor.id
          ? []
          : [
              {
                taskId: id,
                recipientId: task.developerId,
                type: NotificationType.TASK_ASSIGNED,
                title: `${task.title} has a new reviewer`,
                message: `${actor.name} assigned ${reviewer.fullName} to review your task.`,
                email: assignedEmail,
              },
            ]),
        ...(task.currentReviewerId === null || task.currentReviewerId === actor.id
          ? []
          : [
              {
                taskId: id,
                recipientId: task.currentReviewerId,
                type: NotificationType.TASK_REASSIGNED,
                title: `${task.title} reassigned`,
                message: `${actor.name} reassigned this review to ${reviewer.fullName}.`,
              },
            ]),
      ]);
      await this.audit.record(tx, actor, {
        actionType: isReassignment ? 'TASK_REASSIGNED' : 'TASK_ASSIGNED',
        entityType: 'TASK',
        entityId: id,
        taskId: id,
        targetUserId: reviewer.id,
        description: `${actor.name} ${isReassignment ? 'reassigned' : 'assigned'} task '${task.title}' to ${reviewer.fullName}`,
        oldValue: { reviewerId: task.currentReviewerId, status: task.status },
        newValue: {
          reviewerId: reviewer.id,
          reviewerName: reviewer.fullName,
          status: TaskStatus.IN_REVIEW,
          ...(reason?.trim() ? { reason: reason.trim() } : {}),
        },
      });

      const updated = await tx.task.findUnique({ where: { id }, include: taskInclude });
      if (!updated) throw new ApiException('TASK_NOT_FOUND', `Review task ${id} was not found`);
      return this.toResponse(updated);
    });
  }

  /**
   * Admin transfer for a task awaiting resubmission: chooses who receives it
   * when the developer resubmits. Used to clear a reviewer's pending work
   * before they are deactivated (docs/25-review-assignment-rules.md).
   */
  async changeResubmissionReviewer(
    id: string,
    reviewerId: string,
    actor: AuthenticatedUser,
    reason?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const task = await tx.task.findUnique({
        where: { id },
        select: {
          id: true,
          title: true,
          status: true,
          developerId: true,
          resubmissionReviewerId: true,
          codeReviewForms: {
            where: { decision: 'CHANGES_REQUESTED' },
            orderBy: [{ reviewCycleNumber: 'desc' }, { completedAt: 'desc' }],
            take: 1,
            select: { reviewer: { select: { id: true, fullName: true } } },
          },
        },
      });
      if (!task) throw new ApiException('TASK_NOT_FOUND', `Review task ${id} was not found`);
      if (task.status !== TaskStatus.CHANGES_REQUESTED) {
        throw new ApiException(
          'INVALID_STATE',
          'Only a task awaiting resubmission has a follow-up reviewer.',
        );
      }
      if (!reason?.trim()) {
        throw new ApiException('REASON_REQUIRED', 'Provide a reason for changing the reviewer.');
      }
      const reviewer = await tx.user.findFirst({
        where: {
          id: reviewerId,
          status: 'ACTIVE',
          deletedAt: null,
          userRoles: { some: { role: { code: 'REVIEWER', deletedAt: null } } },
        },
        select: { id: true, fullName: true },
      });
      if (!reviewer) throw new ApiException('INVALID_REVIEWER', 'Select an active Reviewer.');
      if (reviewer.id === task.developerId) {
        throw new ApiException('SELF_REVIEW', 'A developer cannot review their own task.');
      }
      const requester = task.codeReviewForms[0]?.reviewer ?? null;
      const currentId = task.resubmissionReviewerId ?? requester?.id ?? null;
      if (currentId === reviewer.id) {
        throw new ApiException('SAME_REVIEWER', `${reviewer.fullName} already receives this task.`);
      }
      const previous = currentId
        ? await tx.user.findUnique({ where: { id: currentId }, select: { fullName: true } })
        : null;

      await tx.task.update({ where: { id }, data: { resubmissionReviewerId: reviewer.id } });
      await tx.taskStatusHistory.create({
        data: {
          taskId: id,
          oldStatus: TaskStatus.CHANGES_REQUESTED,
          newStatus: TaskStatus.CHANGES_REQUESTED,
          changedBy: actor.id,
          remarks: `Follow-up reviewer changed from ${previous?.fullName ?? 'none'} to ${reviewer.fullName}: ${reason.trim()}`,
        },
      });
      const followUpEmail = taskEmail('FOLLOW_UP_REVIEWER_CHANGED', actor.name, {
        reviewerId: reviewer.id,
        reviewerName: reviewer.fullName,
        previousReviewerName: previous?.fullName,
        reason: reason.trim(),
      });
      await this.notifications.createMany(tx, [
        {
          taskId: id,
          recipientId: reviewer.id,
          type: NotificationType.TASK_ASSIGNED,
          title: `${task.title} will return to you on resubmission`,
          message: `${actor.name} made you the follow-up reviewer for this task.`,
          email: followUpEmail,
        },
        {
          taskId: id,
          recipientId: task.developerId,
          type: NotificationType.TASK_ASSIGNED,
          title: `${task.title} will be reviewed by ${reviewer.fullName}`,
          message: `${actor.name} changed who reviews your resubmission.`,
          email: followUpEmail,
        },
      ]);
      await this.audit.record(tx, actor, {
        actionType: 'RESUBMISSION_REVIEWER_CHANGED',
        entityType: 'TASK',
        entityId: id,
        taskId: id,
        targetUserId: reviewer.id,
        description: `${actor.name} changed the follow-up reviewer of '${task.title}' from ${previous?.fullName ?? 'none'} to ${reviewer.fullName}`,
        oldValue: { reviewerId: currentId, reviewerName: previous?.fullName ?? null },
        newValue: { reviewerId: reviewer.id, reviewerName: reviewer.fullName },
        metadata: { targetLabel: task.title, reason: reason.trim() },
      });

      const updated = await tx.task.findUnique({ where: { id }, include: taskInclude });
      if (!updated) throw new ApiException('TASK_NOT_FOUND', `Review task ${id} was not found`);
      return this.toResponse(updated);
    });
  }

  async cancel(id: string, reason: string, actor: AuthenticatedUser) {
    return this.prisma.$transaction(async (tx) => {
      const task = await tx.task.findUnique({
        where: { id },
        select: {
          id: true,
          title: true,
          developerId: true,
          currentReviewerId: true,
          currentReviewCycle: true,
          status: true,
        },
      });
      if (!task) throw new ApiException('TASK_NOT_FOUND', `Review task ${id} was not found`);
      if (
        task.status !== TaskStatus.SUBMITTED &&
        task.status !== TaskStatus.RESUBMITTED &&
        task.status !== TaskStatus.IN_REVIEW &&
        task.status !== TaskStatus.CHANGES_REQUESTED
      ) {
        throw new ApiException('INVALID_STATE_TRANSITION', 'This task can no longer be cancelled');
      }

      const cancellationReason = reason.trim();
      const now = new Date();
      await tx.taskReviewerAssignment.updateMany({
        where: { taskId: id, isCurrent: true },
        data: { isCurrent: false, unassignedAt: now },
      });
      await tx.codeReviewForm.updateMany({
        where: {
          taskId: id,
          reviewCycleNumber: Math.max(task.currentReviewCycle, 1),
          status: 'DRAFT',
        },
        data: { currentReviewSessionId: null },
      });
      // A cancelled task leaves nothing open behind it: its pending handover is
      // closed so the admin queue does not keep a dead item.
      await tx.handoverTask.updateMany({
        where: { taskId: id, status: HandoverStatus.PENDING },
        data: { status: HandoverStatus.CANCELLED },
      });
      await tx.task.update({
        where: { id },
        data: {
          status: TaskStatus.CANCELLED,
          currentReviewerId: null,
          resubmissionReviewerId: null,
          cancelledAt: now,
        },
      });
      await tx.taskStatusHistory.create({
        data: {
          taskId: id,
          oldStatus: task.status,
          newStatus: TaskStatus.CANCELLED,
          changedBy: actor.id,
          remarks: cancellationReason,
        },
      });

      const recipients = [...new Set([task.developerId, task.currentReviewerId])].filter(
        (recipientId): recipientId is string => recipientId !== null && recipientId !== actor.id,
      );
      await this.notifications.createMany(
        tx,
        recipients.map((recipientId) => ({
          taskId: id,
          recipientId,
          type: NotificationType.TASK_CANCELLED,
          title: `${task.title} cancelled`,
          message: `${actor.name} cancelled this task. Reason: ${cancellationReason}`,
          email: taskEmail('TASK_CANCELLED', actor.name, { reason: cancellationReason }, now),
        })),
      );
      await this.audit.record(tx, actor, {
        actionType: 'TASK_CANCELLED',
        entityType: 'TASK',
        entityId: id,
        taskId: id,
        description: `${actor.name} cancelled task '${task.title}'. Reason: ${cancellationReason}`,
        oldValue: { status: task.status, reviewerId: task.currentReviewerId },
        newValue: { status: TaskStatus.CANCELLED, reviewerId: null, reason: cancellationReason },
      });

      const updated = await tx.task.findUnique({ where: { id }, include: taskInclude });
      if (!updated) throw new ApiException('TASK_NOT_FOUND', `Review task ${id} was not found`);
      return this.toResponse(updated);
    });
  }

  /**
   * `saveDraft` persists the reviewer's in-progress draft inside this same
   * transaction, while they are still the assigned reviewer; its result is the
   * snapshot the admin sees on the handover.
   */
  async handover(
    id: string,
    dto: CreateHandoverDto,
    actor: AuthenticatedUser,
    saveDraft?: (tx: Prisma.TransactionClient) => Promise<unknown>,
  ) {
    return retryPrismaTransaction(() =>
      this.prisma.$transaction(async (tx) => {
        const task = await tx.task.findUnique({
          where: { id },
          select: {
            id: true,
            title: true,
            status: true,
            currentReviewCycle: true,
            developerId: true,
            currentReviewerId: true,
            currentReviewer: { select: { fullName: true } },
            codeReviewForms: {
              where: { decision: 'CHANGES_REQUESTED' },
              select: { id: true },
              take: 1,
            },
            handovers: { where: { status: HandoverStatus.PENDING }, select: { id: true } },
          },
        });
        if (!task) throw new ApiException('TASK_NOT_FOUND', `Review task ${id} was not found`);
        if (task.currentReviewerId !== actor.id) {
          throw new ForbiddenException('Only the assigned reviewer can hand over this task');
        }
        if (task.status !== TaskStatus.IN_REVIEW) {
          throw new ApiException(
            'INVALID_STATE',
            'Only a task currently in review can be handed over',
          );
        }
        if (task.handovers.length > 0) {
          throw new ApiException('HANDOVER_PENDING', 'This task already has a pending handover');
        }
        const draftSnapshot = saveDraft ? await saveDraft(tx) : undefined;

        const waitingStatus =
          (task.codeReviewForms?.length ?? 0) > 0 ? TaskStatus.RESUBMITTED : TaskStatus.SUBMITTED;
        const released = await tx.task.updateMany({
          where: { id, currentReviewerId: actor.id, status: TaskStatus.IN_REVIEW },
          data: { currentReviewerId: null, status: waitingStatus },
        });
        if (released.count !== 1) {
          throw new ApiException(
            'ALREADY_HANDED_OVER',
            'This task was already handed over or reassigned',
          );
        }

        const now = new Date();
        const handover = await tx.handoverTask.create({
          data: {
            taskId: id,
            fromReviewerId: actor.id,
            reason: dto.reason.trim(),
            status: HandoverStatus.PENDING,
          },
        });
        await tx.taskReviewerAssignment.updateMany({
          where: { taskId: id, reviewerId: actor.id, isCurrent: true },
          data: { isCurrent: false, unassignedAt: now },
        });
        await tx.taskStatusHistory.create({
          data: {
            taskId: id,
            oldStatus: TaskStatus.IN_REVIEW,
            newStatus: waitingStatus,
            changedBy: actor.id,
            remarks: `Review handed over: ${dto.reason.trim()}`,
          },
        });
        await this.audit.record(tx, actor, {
          actionType: 'TASK_HANDOVER',
          entityType: 'HANDOVER',
          entityId: handover.id,
          taskId: id,
          targetUserId: actor.id,
          description: `${actor.name} handed over task '${task.title}': ${dto.reason.trim()}`,
          oldValue: {
            status: TaskStatus.IN_REVIEW,
            reviewerId: actor.id,
            reviewerName: task.currentReviewer?.fullName ?? actor.name,
          },
          newValue: {
            status: waitingStatus,
            reviewerId: null,
            reason: dto.reason.trim(),
          },
          ...(draftSnapshot === undefined
            ? {}
            : {
                metadata: {
                  reviewDraft: draftSnapshot as Prisma.InputJsonObject,
                },
              }),
        });

        const administrators = await tx.user.findMany({
          where: {
            status: 'ACTIVE',
            deletedAt: null,
            userRoles: {
              some: { role: { code: { in: ['ADMIN', 'SUPER_ADMIN'] }, deletedAt: null } },
            },
          },
          select: { id: true },
        });
        const eligibleReviewers = await tx.user.findMany({
          where: {
            id: { notIn: [actor.id, task.developerId] },
            status: 'ACTIVE',
            deletedAt: null,
            userRoles: { some: { role: { code: 'REVIEWER', deletedAt: null } } },
          },
          select: { id: true },
        });
        const eligibleReviewerIds = new Set(
          eligibleReviewers.map(({ id: reviewerId }) => reviewerId),
        );
        const administratorIds = new Set(administrators.map(({ id: adminId }) => adminId));
        const handoverEmail = taskEmail(
          'TASK_HANDED_OVER',
          actor.name,
          { reason: dto.reason.trim(), previousReviewerName: actor.name },
          now,
        );
        await this.notifications.createMany(tx, [
          {
            taskId: id,
            recipientId: task.developerId,
            type: NotificationType.TASK_HANDOVER,
            title: `${task.title} handed over`,
            message: `${actor.name} handed over your review task for reassignment.`,
            email: handoverEmail,
          },
          ...eligibleReviewers.map(({ id: recipientId }) => ({
            taskId: id,
            recipientId,
            type: NotificationType.TASK_HANDOVER,
            title: `${task.title} available to pick`,
            message: `${actor.name} handed over this review task. It is now available to pick.`,
            ...(administratorIds.has(recipientId) ? { email: handoverEmail } : {}),
          })),
          ...administrators
            .filter(
              ({ id: administratorId }) =>
                administratorId !== task.developerId &&
                administratorId !== actor.id &&
                !eligibleReviewerIds.has(administratorId),
            )
            .map(({ id: recipientId }) => ({
              taskId: id,
              recipientId,
              type: NotificationType.TASK_HANDOVER,
              title: `${task.title} handed over`,
              message: `${actor.name} handed over this review task for reassignment.`,
              email: handoverEmail,
            })),
        ]);

        const updated = await tx.task.findUnique({ where: { id }, include: taskInclude });
        if (!updated) throw new ApiException('TASK_NOT_FOUND', `Review task ${id} was not found`);
        return this.toResponse(updated);
      }),
    );
  }

  private listWhere(user: AuthenticatedUser, scope: ReviewTaskScope): Prisma.TaskWhereInput {
    if (scope === 'all') {
      if (!hasAdminAccess(user)) {
        throw new ForbiddenException('Only administrators may view all review tasks');
      }
      return {
        status: { not: TaskStatus.DRAFT },
        submittedAt: { not: null },
      };
    }

    if (scope === 'mine') {
      if (!user.roles.includes('DEVELOPER')) {
        throw new ForbiddenException('Only developers may view their task list');
      }
      return { developerId: user.id };
    }

    if (!user.roles.includes('REVIEWER')) {
      throw new ForbiddenException('Only reviewers may view reviewer task lists');
    }

    if (scope === 'available') {
      return {
        developerId: { not: user.id },
        currentReviewerId: null,
        status: { in: [TaskStatus.SUBMITTED, TaskStatus.RESUBMITTED] },
      };
    }
    if (scope === 'assigned') {
      return {
        developerId: { not: user.id },
        currentReviewerId: user.id,
        status: TaskStatus.IN_REVIEW,
      };
    }
    return {
      developerId: { not: user.id },
      status: { not: TaskStatus.DRAFT },
      codeReviewForms: { some: { reviewerId: user.id, decision: { not: null } } },
      NOT: { currentReviewerId: user.id, status: TaskStatus.IN_REVIEW },
    };
  }

  /**
   * History belongs to whoever made the latest decision: an earlier reviewer
   * of a task someone else has since decided no longer lists it as theirs.
   */
  private latestDeciderOnly(tasks: TaskWithRelations[], user: AuthenticatedUser) {
    return tasks.filter((task) => {
      if (task.status !== TaskStatus.APPROVED && task.status !== TaskStatus.CHANGES_REQUESTED) {
        return true;
      }
      const decided = task.codeReviewForms.filter(({ decision }) => decision !== null);
      return decided.at(-1)?.reviewerId === user.id;
    });
  }

  /** What a task has accumulated that makes deleting it erase history. */
  private async workflowEvidence(tx: Prisma.TransactionClient, taskId: string) {
    const [submissions, decided, forms, responses, handovers, assignments] = await Promise.all([
      tx.auditLog.count({
        where: { taskId, action: { in: ['TASK_SUBMITTED', 'TASK_RESUBMITTED'] } },
      }),
      tx.codeReviewForm.count({ where: { taskId, decision: { not: null } } }),
      tx.codeReviewForm.count({ where: { taskId } }),
      tx.developerFindingResponse.count({ where: { finding: { reviewForm: { taskId } } } }),
      tx.handoverTask.count({ where: { taskId } }),
      tx.taskReviewerAssignment.count({ where: { taskId } }),
    ]);
    return {
      submitted: submissions > 0 || decided > 0,
      workflow: forms > 0 || responses > 0 || handovers > 0 || assignments > 0,
    };
  }

  private hasChecklistPayload(dto: UpdateReviewTaskDto): boolean {
    const hasTaskTypes = dto.taskTypeIds !== undefined;
    const hasAnswers = dto.checklistAnswers !== undefined;
    if (hasTaskTypes !== hasAnswers) {
      throw new BadRequestException('taskTypeIds and checklistAnswers must be provided together');
    }
    return hasTaskTypes;
  }

  private taskTitle(
    customerCode: string,
    crimId: string,
    version: string | null | undefined,
  ): string {
    const parts = [customerCode.trim(), crimId.trim().replace(/\s+/g, '-')];
    const suffix = version?.trim();
    if (suffix) parts.push(suffix);
    return parts.join('-');
  }

  private async getEditableTask(id: string, user: AuthenticatedUser) {
    const task = await this.getTask(id);
    if (task.developerId !== user.id) {
      throw new ForbiddenException('Only the owning developer may edit this task');
    }
    if (task.status !== TaskStatus.DRAFT && task.status !== TaskStatus.CHANGES_REQUESTED) {
      throw new ApiException('INVALID_STATE_TRANSITION', 'This task can no longer be edited');
    }
    return task;
  }

  private toAttachment(row: {
    id: string;
    taskId: string;
    fileName: string;
    sizeBytes: number;
    mimeType: string;
    storageRef: string;
    caption: string;
    uploadedById: string;
    uploadedAt: Date;
  }) {
    return {
      ...row,
      uploadedAt: row.uploadedAt.toISOString(),
    };
  }

  private toChecklistSubmission(
    task: TaskWithRelations,
    version: number,
    submittedAt: Date,
    developerId: string,
  ): ChecklistSubmission {
    const categories = new Map<string, ChecklistSubmission['categories'][number]>();
    for (const entry of task.developerChecklist?.answers ?? []) {
      const section = entry.question.section;
      const category = categories.get(section.id) ?? {
        categoryId: section.id,
        categoryName: section.name,
        categoryOrder: categories.size,
        questions: [],
      };
      category.questions.push({
        questionId: entry.questionId,
        questionText: entry.question.questionText,
        questionOrder: entry.question.displayOrder,
        answer: ({ YES: 'Yes', NO: 'No', NA: 'NA' } as const)[entry.answer],
      });
      categories.set(section.id, category);
    }
    return {
      id: randomUUID(),
      taskId: task.id,
      version,
      submittedAt: submittedAt.toISOString(),
      developerId,
      taskTypes: task.taskTypes.map(({ taskType }) => ({
        id: String(taskType.id),
        name: taskType.name,
      })),
      categories: [...categories.values()].map((category) => ({
        ...category,
        questions: category.questions.sort(
          (left, right) => left.questionOrder - right.questionOrder,
        ),
      })),
      remarks: task.developerChecklist?.additionalRemarks ?? '',
    };
  }

  private async nextTaskVersion(
    client: TaskVersionReader,
    customerId: string,
    crimId: string,
  ): Promise<number> {
    const tasks = await client.task.findMany({
      where: { customerId, crimId: { equals: crimId, mode: 'insensitive' } },
      select: { version: true },
    });
    const highestVersion = tasks.reduce((highest, task) => {
      const value = task.version?.trim().replace(/^V/i, '') ?? '';
      if (!/^\d+$/.test(value)) return highest;
      return Math.max(highest, Number(value));
    }, -1);
    return highestVersion + 1;
  }

  private toResponse(task: TaskWithRelations) {
    const cycleSummary = deriveTaskReviewCycles(task.currentReviewCycle, task.reviewCycles ?? []);
    const reviewerAssignments = task.reviewerAssignments ?? [];
    const currentAssignment =
      reviewerAssignments.find(({ isCurrent }) => isCurrent) ??
      (reviewerAssignments.every(({ isCurrent }) => isCurrent === undefined)
        ? reviewerAssignments[0]
        : undefined);
    const previousAdminAssignedReviewer =
      currentAssignment?.assignmentType === ReviewerAssignmentType.ADMIN_REASSIGNED &&
      currentAssignment.assignedBy !== null
        ? reviewerAssignments.find(({ isCurrent }) => !isCurrent)?.reviewer?.fullName
        : null;
    const status = {
      DRAFT: 'Draft',
      SUBMITTED: 'Submitted',
      IN_REVIEW: 'InReview',
      CHANGES_REQUESTED: 'ChangesRequested',
      RESUBMITTED: 'ReSubmitted',
      APPROVED: 'Approved',
      // Delivered was retired from the Code Review workflow; the API contract
      // has no such status. A legacy row reads as the Approved it was (the old
      // mock migrated it the same way) instead of breaking every list it is in.
      DELIVERED: 'Approved',
      CANCELLED: 'Cancelled',
    }[task.status];
    const priority = {
      LOW: 'Low',
      MEDIUM: 'Medium',
      HIGH: 'High',
    }[task.priority];
    return {
      id: task.id,
      taskCode: task.taskCode,
      title: this.taskTitle(task.customer.code, task.crimId, task.version),
      crimId: task.crimId,
      version: task.version,
      customerId: task.customerId,
      priority,
      status,
      reviewCycle: cycleSummary.reviewCycle,
      historicalCycle: cycleSummary.historicalCycle,
      adjustedCycles: cycleSummary.adjustedCycles,
      developerId: task.developerId,
      reviewerId: task.currentReviewerId,
      currentReviewSessionId: currentAssignment?.id ?? null,
      taskTypeIds: task.taskTypes.map(({ taskTypeId }) => String(taskTypeId)),
      isChecklistComplete: task.checklistCompleted,
      isHandedOver: task.handovers.some(({ status }) => status === HandoverStatus.PENDING),
      handedOverByName:
        previousAdminAssignedReviewer ?? task.handovers[0]?.fromReviewer?.fullName ?? null,
      noteToReviewer: task.noteToReviewer,
      createdAt: task.createdAt.toISOString(),
      submittedAt: task.submittedAt?.toISOString() ?? null,
      updatedAt: task.updatedAt.toISOString(),
      customerName: task.customer.name,
      customerCode: task.customer.code,
      customerColor: task.customer.color ?? '#64748b',
      developerName: task.developer.fullName,
      reviewerName: task.currentReviewer?.fullName ?? null,
    };
  }

  /**
   * Checks the task types and returns the answers that apply to them, plus
   * whether every applicable question is answered. Answers to questions that
   * no longer apply (the developer deselected a task type) are dropped, not
   * rejected — the wizard keeps them client-side so reselecting restores them.
   */
  private async validateChecklist(
    tx: Prisma.TransactionClient,
    taskTypeIds: number[],
    answers: ChecklistAnswerDto[],
  ): Promise<{ complete: boolean; answers: ChecklistAnswerDto[] }> {
    const taskTypes = await tx.taskType.findMany({
      where: { id: { in: taskTypeIds }, isActive: true },
      select: { id: true },
    });
    if (taskTypes.length !== taskTypeIds.length)
      throw new ApiException(
        'INVALID_TASK_TYPE',
        'All taskTypeIds must identify active task types',
      );

    const duplicateIds = answers
      .map(({ questionId }) => questionId)
      .filter((id, index, all) => all.indexOf(id) !== index);
    if (duplicateIds.length)
      throw new BadRequestException(
        `Duplicate checklist answer(s): ${[...new Set(duplicateIds)].join(', ')}`,
      );

    const questions = await tx.checklistQuestion.findMany({
      where: {
        isActive: true,
        section: {
          isActive: true,
          taskTypes: { some: { taskTypeId: { in: taskTypeIds } } },
        },
      },
      select: { id: true },
    });
    const requiredIds = new Set(questions.map(({ id }) => id));
    const applicable = answers.filter(({ questionId }) => requiredIds.has(questionId));
    const answeredIds = new Set(applicable.map(({ questionId }) => questionId));
    const missing = [...requiredIds].filter((id) => !answeredIds.has(id));
    return { complete: taskTypeIds.length > 0 && missing.length === 0, answers: applicable };
  }
}
