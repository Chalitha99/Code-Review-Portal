import { Injectable } from '@nestjs/common';
import { Prisma, TaskStatus } from '@prisma/client';
import type { PendingReviewTask } from '@sdp/contracts';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiException } from '../../common/api-error.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { AuditService } from '../audit/audit.service.js';

type Db = Prisma.TransactionClient | PrismaService;

/** What the admin tried to do to the reviewer. */
export type ReviewerRemoval =
  | 'DEACTIVATE'
  | 'DELETE'
  | 'REMOVE_REVIEWER_ROLE'
  /** Super Admin is an exclusive role: the new holder gives up Reviewer. */
  | 'TRANSFER_SUPER_ADMIN';

const BLOCKED_ACTION: Record<ReviewerRemoval, string> = {
  DEACTIVATE: 'REVIEWER_DEACTIVATION_BLOCKED',
  DELETE: 'REVIEWER_DELETE_BLOCKED',
  REMOVE_REVIEWER_ROLE: 'REVIEWER_ROLE_REMOVAL_BLOCKED',
  TRANSFER_SUPER_ADMIN: 'SUPER_ADMIN_TRANSFER_BLOCKED',
};

const BLOCKED_VERB: Record<ReviewerRemoval, string> = {
  DEACTIVATE: 'deactivating',
  DELETE: 'deleting',
  REMOVE_REVIEWER_ROLE: 'removing the Reviewer role from',
  TRANSFER_SUPER_ADMIN: 'transferring Super Admin to',
};

const STATUS_LABEL: Partial<Record<TaskStatus, string>> = {
  [TaskStatus.IN_REVIEW]: 'InReview',
  [TaskStatus.CHANGES_REQUESTED]: 'ChangesRequested',
};

/**
 * A reviewer's open review work, and the rule that protects it
 * (docs/25-review-assignment-rules.md):
 *
 *   a reviewer who still has pending review work cannot be deactivated, deleted
 *   or lose the Reviewer role until that work is handed over or reassigned.
 *
 * Pending work is
 *  (a) InReview tasks they currently hold;
 *  (b) ChangesRequested tasks that will come back to them on resubmission —
 *      the admin-chosen follow-up reviewer, or else whoever requested the
 *      changes. `currentReviewerId` is null in this state, so nothing else
 *      would protect these;
 *  (c) pending handovers addressed to them.
 */
@Injectable()
export class ReviewerWorkloadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async pendingFor(userId: string, db: Db = this.prisma): Promise<PendingReviewTask[]> {
    const [inReview, awaiting, handovers] = await Promise.all([
      db.task.findMany({
        where: { status: TaskStatus.IN_REVIEW, currentReviewerId: userId },
        select: { id: true, taskCode: true, title: true, status: true },
        orderBy: { taskCode: 'asc' },
      }),
      db.task.findMany({
        where: {
          status: TaskStatus.CHANGES_REQUESTED,
          OR: [
            { resubmissionReviewerId: userId },
            {
              resubmissionReviewerId: null,
              codeReviewForms: { some: { reviewerId: userId, decision: 'CHANGES_REQUESTED' } },
            },
          ],
        },
        select: {
          id: true,
          taskCode: true,
          title: true,
          status: true,
          resubmissionReviewerId: true,
          codeReviewForms: {
            where: { decision: 'CHANGES_REQUESTED' },
            orderBy: [{ reviewCycleNumber: 'desc' }, { completedAt: 'desc' }],
            take: 1,
            select: { reviewerId: true },
          },
        },
        orderBy: { taskCode: 'asc' },
      }),
      db.handoverTask.findMany({
        where: { status: 'PENDING', toReviewerId: userId },
        select: { task: { select: { id: true, taskCode: true, title: true, status: true } } },
      }),
    ]);

    const tasks: PendingReviewTask[] = [
      ...inReview.map((task) => this.toPending(task, 'InReview')),
      // Only tasks whose *latest* changes-requested review is theirs come back to them.
      ...awaiting
        .filter(
          (task) =>
            task.resubmissionReviewerId === userId ||
            (task.resubmissionReviewerId === null &&
              task.codeReviewForms[0]?.reviewerId === userId),
        )
        .map((task) => this.toPending(task, 'AwaitingResubmission')),
      ...handovers.map(({ task }) => this.toPending(task, 'Handover')),
    ];
    // A task can match more than one rule; report it once, first kind wins.
    const seen = new Set<string>();
    return tasks.filter((task) => (seen.has(task.id) ? false : (seen.add(task.id), true)));
  }

  /**
   * Throws 409 `REVIEWER_HAS_PENDING_TASKS` (with the task list in `details`)
   * when the reviewer still has pending work, after recording the refused
   * attempt in the audit log. The audit row is written outside any caller
   * transaction so it survives the rollback that the throw causes.
   */
  async assertCanRemoveReviewer(
    target: { id: string; fullName: string },
    actor: AuthenticatedUser,
    removal: ReviewerRemoval,
    reason?: string,
  ): Promise<void> {
    const tasks = await this.pendingFor(target.id);
    if (tasks.length === 0) return;

    await this.audit.record(this.prisma, actor, {
      actionType: BLOCKED_ACTION[removal],
      entityType: 'USER',
      entityId: target.id,
      targetUserId: target.id,
      description: `${actor.name} was blocked from ${BLOCKED_VERB[removal]} ${target.fullName}: ${String(tasks.length)} pending review task(s)`,
      metadata: {
        targetLabel: target.fullName,
        pendingTaskIds: tasks.map((task) => task.id),
        pendingTaskCodes: tasks.map((task) => task.taskCode),
        ...(reason === undefined ? {} : { reason }),
      },
    });

    throw new ApiException(
      'REVIEWER_HAS_PENDING_TASKS',
      `${target.fullName} still has ${String(tasks.length)} pending review task(s). Hand over or reassign them first.`,
      { tasks },
    );
  }

  /**
   * The same rule, re-checked inside the caller's transaction just before it
   * commits, so work picked up between the pre-check and the write is not
   * stranded. No audit row here: the throw rolls the transaction back, and the
   * pre-check has already recorded any refusal the admin actually saw.
   */
  async assertNoPendingWork(db: Db, target: { id: string; fullName: string }): Promise<void> {
    const tasks = await this.pendingFor(target.id, db);
    if (tasks.length === 0) return;
    throw new ApiException(
      'REVIEWER_HAS_PENDING_TASKS',
      `${target.fullName} still has ${String(tasks.length)} pending review task(s). Hand over or reassign them first.`,
      { tasks },
    );
  }

  private toPending(
    task: { id: string; taskCode: string; title: string; status: TaskStatus },
    kind: PendingReviewTask['kind'],
  ): PendingReviewTask {
    return {
      id: task.id,
      taskCode: task.taskCode,
      title: task.title,
      status: STATUS_LABEL[task.status] ?? task.status,
      kind,
    };
  }
}
