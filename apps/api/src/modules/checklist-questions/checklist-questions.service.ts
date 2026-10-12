import { Injectable, NotFoundException } from '@nestjs/common';
import { ApiException } from '../../common/api-error.js';
import { moveToPosition } from '../../common/ordering.js';
import { Prisma } from '@prisma/client';
import { rethrowPrismaConflict } from '../../common/prisma-errors.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CreateChecklistQuestionDto } from './dto/create-checklist-question.dto.js';
import type { UpdateChecklistQuestionDto } from './dto/update-checklist-question.dto.js';

@Injectable()
export class ChecklistQuestionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const questions = await this.prisma.checklistQuestion.findMany({
      include: {
        section: true,
        _count: { select: { answers: true } },
      },
      orderBy: [{ section: { name: 'asc' } }, { displayOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return questions.map((question) => this.toResponse(question));
  }

  async findOne(id: string) {
    return this.toResponse(await this.findRecord(id));
  }

  async create(dto: CreateChecklistQuestionDto) {
    await this.ensureSectionExists(dto.categoryId);
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        // The admin picks a position as the UI shows it (1..n); compact any
        // gaps left in older data first so that position means the same here.
        if (dto.order !== undefined) await this.resequence(tx, dto.categoryId);
        // Occupancy and usage are read inside the transaction that acts on them.
        const order = dto.order ?? (await this.nextOrder(dto.categoryId, tx));
        const occupant = await tx.checklistQuestion.findFirst({
          where: { sectionId: dto.categoryId, displayOrder: order },
          include: { _count: { select: { answers: true } } },
        });
        if (occupant && dto.onDuplicateOrder === undefined) {
          throw new ApiException(
            'ORDER_TAKEN',
            `Order ${String(order)} is already used by a question in this category.`,
          );
        }
        if (occupant && dto.onDuplicateOrder === 'replace') {
          if (await this.isInUse(tx, occupant.id, occupant._count.answers)) {
            throw new ApiException(
              'QUESTION_IN_USE',
              'Developers have already answered the question at that order, so it cannot be replaced. Deactivate it instead.',
            );
          }
          await tx.checklistQuestion.delete({ where: { id: occupant.id } });
        } else if (occupant && dto.onDuplicateOrder === 'shift') {
          await this.shiftOrders(tx, dto.categoryId, order);
        }
        return tx.checklistQuestion.create({
          data: {
            sectionId: dto.categoryId,
            questionText: dto.text.trim(),
            displayOrder: order,
          },
        });
      });
      return this.toResponse(created);
    } catch (error) {
      rethrowPrismaConflict(error);
    }
  }

  async update(id: string, dto: UpdateChecklistQuestionDto) {
    const existing = await this.findRecord(id);
    const categoryId = dto.categoryId ?? existing.sectionId;
    if (dto.categoryId !== undefined) await this.ensureSectionExists(dto.categoryId);
    const order =
      dto.order ??
      (categoryId === existing.sectionId
        ? existing.displayOrder
        : await this.nextOrder(categoryId));

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const question = await tx.checklistQuestion.update({
          where: { id },
          data: {
            ...(dto.categoryId === undefined ? {} : { sectionId: dto.categoryId }),
            ...(dto.text === undefined ? {} : { questionText: dto.text.trim() }),
            ...(categoryId === existing.sectionId && dto.order === undefined
              ? {}
              : { displayOrder: order }),
            ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
          },
        });
        if (categoryId !== existing.sectionId) {
          await this.resequence(tx, existing.sectionId, id);
        }
        // Moving within the category shifts the occupant instead of leaving two
        // questions on one position.
        if (dto.order !== undefined) {
          const ordered = await tx.checklistQuestion.findMany({
            where: { sectionId: categoryId },
            orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
            select: { id: true },
          });
          const sequence = moveToPosition(
            ordered.map((entry) => entry.id),
            id,
            dto.order,
          );
          for (const [index, questionId] of sequence.entries()) {
            await tx.checklistQuestion.update({
              where: { id: questionId },
              data: { displayOrder: index + 1 },
            });
          }
          return { ...question, displayOrder: sequence.indexOf(id) + 1 };
        }
        return question;
      });
      return this.toResponse(updated);
    } catch (error) {
      rethrowPrismaConflict(error);
    }
  }

  async remove(id: string): Promise<void> {
    const existing = await this.findRecord(id);
    try {
      await this.prisma.$transaction(async (tx) => {
        const answers = await tx.checklistAnswer.count({ where: { questionId: id } });
        if (await this.isInUse(tx, id, answers)) {
          throw new ApiException(
            'QUESTION_IN_USE',
            'Developers have already answered this question. Deactivate it instead.',
          );
        }
        await tx.checklistQuestion.delete({ where: { id } });
        await this.resequence(tx, existing.sectionId);
      });
    } catch (error) {
      rethrowPrismaConflict(error);
    }
  }

  /**
   * A question is part of the record once any developer answered it, either in
   * a live checklist or in a submitted checklist snapshot (kept in the audit
   * log's `checklistSubmission` metadata, which outlives later edits).
   */
  private async isInUse(tx: Prisma.TransactionClient, questionId: string, answers: number) {
    if (answers > 0) return true;
    const [row] = await tx.$queryRaw<{ used: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM "audit_logs"
        WHERE "metadata" ? 'checklistSubmission'
          AND ("metadata" -> 'checklistSubmission')::text LIKE ${`%"${questionId}"%`}
      ) AS "used"
    `;
    return row?.used === true;
  }

  private async findRecord(id: string) {
    const question = await this.prisma.checklistQuestion.findUnique({
      where: { id },
      include: {
        section: { include: { taskTypes: { include: { taskType: true } } } },
        _count: { select: { answers: true } },
      },
    });
    if (!question) throw new NotFoundException(`Checklist question ${id} was not found`);
    return question;
  }

  private async ensureSectionExists(id: string): Promise<void> {
    const section = await this.prisma.checklistSection.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!section) throw new NotFoundException(`Checklist section ${id} was not found`);
  }

  private async nextOrder(
    sectionId: string,
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<number> {
    const aggregate = await client.checklistQuestion.aggregate({
      where: { sectionId },
      _max: { displayOrder: true },
    });
    return (aggregate._max.displayOrder ?? 0) + 1;
  }

  private async shiftOrders(
    tx: Prisma.TransactionClient,
    sectionId: string,
    fromOrder: number,
  ): Promise<void> {
    const questions = await tx.checklistQuestion.findMany({
      where: { sectionId, displayOrder: { gte: fromOrder } },
      orderBy: [{ displayOrder: 'desc' }, { createdAt: 'desc' }],
      select: { id: true, displayOrder: true },
    });
    for (const question of questions) {
      await tx.checklistQuestion.update({
        where: { id: question.id },
        data: { displayOrder: question.displayOrder + 1 },
      });
    }
  }

  private async resequence(
    tx: Prisma.TransactionClient,
    sectionId: string,
    excludedId?: string,
  ): Promise<void> {
    const questions = await tx.checklistQuestion.findMany({
      where: {
        sectionId,
        ...(excludedId === undefined ? {} : { id: { not: excludedId } }),
      },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, displayOrder: true },
    });
    for (const [order, question] of questions.entries()) {
      if (question.displayOrder === order + 1) continue;
      await tx.checklistQuestion.update({
        where: { id: question.id },
        data: { displayOrder: order + 1 },
      });
    }
  }

  private toResponse(question: {
    id: string;
    sectionId: string;
    questionText: string;
    displayOrder: number;
    isActive: boolean;
  }) {
    return {
      id: question.id,
      categoryId: question.sectionId,
      text: question.questionText,
      order: question.displayOrder,
      isActive: question.isActive,
    };
  }
}
