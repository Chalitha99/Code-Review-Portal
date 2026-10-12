import { Injectable, NotFoundException } from '@nestjs/common';
import { ApiException } from '../../common/api-error.js';
import { isCompleteOrder } from '../../common/dto/reorder.dto.js';
import { moveToPosition } from '../../common/ordering.js';
import { Prisma } from '@prisma/client';
import { rethrowPrismaConflict } from '../../common/prisma-errors.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CreateChecklistSectionDto } from './dto/create-checklist-section.dto.js';
import type { UpdateChecklistSectionDto } from './dto/update-checklist-section.dto.js';
import type { CreateChecklistCategoryDto } from './dto/create-checklist-category.dto.js';
import type { UpdateChecklistCategoryDto } from './dto/update-checklist-category.dto.js';

const sectionInclude = {
  taskTypes: {
    include: { taskType: true },
    orderBy: { displayOrder: 'asc' },
  },
  questions: { orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }] },
} satisfies Prisma.ChecklistSectionInclude;

type SectionWithRelations = Prisma.ChecklistSectionGetPayload<{ include: typeof sectionInclude }>;

@Injectable()
export class ChecklistSectionsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.checklistSection.findMany({
      include: sectionInclude,
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string) {
    const section = await this.prisma.checklistSection.findUnique({
      where: { id },
      include: sectionInclude,
    });
    if (!section) throw new NotFoundException(`Checklist section ${id} was not found`);
    return section;
  }

  async create(dto: CreateChecklistSectionDto) {
    await this.ensureTaskTypesExist(dto.taskTypes?.map(({ taskTypeId }) => taskTypeId));
    try {
      return await this.prisma.checklistSection.create({
        data: {
          name: dto.name.trim(),
          ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
          ...(dto.taskTypes
            ? {
                taskTypes: {
                  create: dto.taskTypes.map((mapping) => ({
                    taskTypeId: mapping.taskTypeId,
                    displayOrder: mapping.displayOrder,
                  })),
                },
              }
            : {}),
        },
        include: sectionInclude,
      });
    } catch (error) {
      rethrowPrismaConflict(error);
    }
  }

  async update(id: string, dto: UpdateChecklistSectionDto) {
    await this.findOne(id);
    await this.ensureTaskTypesExist(dto.taskTypes?.map(({ taskTypeId }) => taskTypeId));
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.checklistSection.update({
          where: { id },
          data: {
            ...(dto.name === undefined ? {} : { name: dto.name.trim() }),
            ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
          },
        });
        if (dto.taskTypes !== undefined) {
          await tx.taskTypeChecklistSection.deleteMany({
            where: { sectionId: id },
          });
          if (dto.taskTypes.length) {
            await tx.taskTypeChecklistSection.createMany({
              data: dto.taskTypes.map((mapping) => ({
                sectionId: id,
                taskTypeId: mapping.taskTypeId,
                displayOrder: mapping.displayOrder,
              })),
            });
          }
        }
      });
      return await this.findOne(id);
    } catch (error) {
      rethrowPrismaConflict(error);
    }
  }

  async remove(id: string): Promise<void> {
    const existing = await this.findOne(id);
    if (existing.questions.length > 0) {
      throw new ApiException(
        'CATEGORY_NOT_EMPTY',
        'Categories containing questions cannot be safely deleted. Deactivate the category instead.',
      );
    }
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.taskTypeChecklistSection.deleteMany({
          where: { sectionId: id },
        });
        await tx.checklistSection.delete({ where: { id } });
      });
    } catch (error) {
      rethrowPrismaConflict(error);
    }
  }

  async findCategories() {
    return (await this.findAll()).map((section, index) => this.toCategory(section, index + 1));
  }

  async findCategory(id: string) {
    const all = await this.findCategories();
    const category = all.find((entry) => entry.id === id);
    if (!category) throw new NotFoundException(`Checklist category ${id} was not found`);
    return category;
  }

  /** PATCH /checklist-categories/order: the whole sequence, rewritten 1..n. */
  async reorderCategories(ids: readonly string[]) {
    const all = await this.prisma.checklistSection.findMany({ select: { id: true } });
    if (!isCompleteOrder(ids, all.map(({ id }) => id))) {
      throw new ApiException('ORDER_INCOMPLETE', 'The new order must list every category exactly once.');
    }
    await this.writeCategoryOrder(ids);
    return this.findCategories();
  }

  /** PATCH /checklist-categories/:id/question-order: one category's questions, 1..n. */
  async reorderQuestions(categoryId: string, ids: readonly string[]) {
    const section = await this.findOne(categoryId);
    if (!isCompleteOrder(ids, section.questions.map(({ id }) => id))) {
      throw new ApiException(
        'ORDER_INCOMPLETE',
        'The new order must list every question in this category exactly once.',
      );
    }
    await this.prisma.$transaction(
      ids.map((id, index) =>
        this.prisma.checklistQuestion.update({ where: { id }, data: { displayOrder: index + 1 } }),
      ),
    );
    return this.findCategory(categoryId);
  }

  private async writeCategoryOrder(ids: readonly string[]) {
    await this.prisma.$transaction(
      ids.map((id, index) =>
        this.prisma.checklistSection.update({ where: { id }, data: { displayOrder: index + 1 } }),
      ),
    );
  }

  async createCategory(dto: CreateChecklistCategoryDto) {
    const name = dto.name.trim();
    await this.ensureNameAvailable(name);
    const taskTypeIds = dto.applicableTaskTypeIds.map(Number);
    await this.ensureSelectableTaskTypes(taskTypeIds);
    const order = await this.nextCategoryOrder();
    const created = await this.create({
      name,
      taskTypes: taskTypeIds.map((taskTypeId) => ({ taskTypeId, displayOrder: order })),
    });
    await this.prisma.checklistSection.update({
      where: { id: created.id },
      data: { displayOrder: order },
    });
    // A requested position moves it there and shifts the rest, as on edit.
    if (dto.order !== undefined) await this.moveCategory(created.id, dto.order);
    return this.findCategory(created.id);
  }

  async updateCategory(id: string, dto: UpdateChecklistCategoryDto) {
    const existing = await this.findOne(id);
    if (dto.name !== undefined) await this.ensureNameAvailable(dto.name.trim(), id);

    const taskTypeIds = dto.applicableTaskTypeIds?.map(Number);
    if (taskTypeIds !== undefined) {
      await this.ensureSelectableTaskTypes(
        taskTypeIds,
        existing.taskTypes.map(({ taskTypeId }) => taskTypeId),
      );
    }
    const order = existing.displayOrder;
    await this.update(id, {
      ...(dto.name === undefined ? {} : { name: dto.name }),
      ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
      ...(taskTypeIds === undefined
        ? {}
        : {
            taskTypes: taskTypeIds.map((taskTypeId) => ({ taskTypeId, displayOrder: order })),
          }),
    });
    // Moving to an occupied position shifts the others; positions stay 1..n.
    if (dto.order !== undefined) await this.moveCategory(id, dto.order);
    return this.findCategory(id);
  }

  private async moveCategory(id: string, position: number) {
    const ordered = await this.prisma.checklistSection.findMany({
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      select: { id: true },
    });
    await this.writeCategoryOrder(moveToPosition(ordered.map((entry) => entry.id), id, position));
  }

  removeCategory(id: string): Promise<void> {
    return this.remove(id);
  }

  private async ensureTaskTypesExist(taskTypeIds?: number[]): Promise<void> {
    if (!taskTypeIds?.length) return;
    const taskTypes = await this.prisma.taskType.findMany({
      where: { id: { in: taskTypeIds } },
      select: { id: true },
    });
    if (taskTypes.length !== taskTypeIds.length) {
      const found = new Set(taskTypes.map(({ id }) => id));
      const missing = taskTypeIds.filter((id) => !found.has(id));
      throw new NotFoundException(`Task type(s) not found: ${missing.join(', ')}`);
    }
  }

  private async ensureSelectableTaskTypes(
    taskTypeIds: number[],
    permittedInactiveIds: number[] = [],
  ): Promise<void> {
    const taskTypes = await this.prisma.taskType.findMany({
      where: {
        id: { in: taskTypeIds },
        OR: [{ isActive: true }, { id: { in: permittedInactiveIds } }],
      },
      select: { id: true },
    });
    if (taskTypes.length !== taskTypeIds.length) {
      throw new ApiException('INVALID_TASK_TYPE', 'Choose one or more active task types.');
    }
  }

  private async ensureNameAvailable(name: string, excludingId?: string): Promise<void> {
    const duplicate = await this.prisma.checklistSection.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(excludingId === undefined ? {} : { id: { not: excludingId } }),
      },
      select: { id: true },
    });
    if (duplicate) throw new ApiException('NAME_TAKEN', 'A category with that name already exists.');
  }

  private async nextCategoryOrder(): Promise<number> {
    const aggregate = await this.prisma.checklistSection.aggregate({
      _max: { displayOrder: true },
    });
    return (aggregate._max.displayOrder ?? 0) + 1;
  }

  private toCategory(section: SectionWithRelations, position: number) {
    return {
      id: section.id,
      name: section.name,
      order: position,
      isActive: section.isActive,
      applicableTaskTypeIds: section.taskTypes.map(({ taskTypeId }) => String(taskTypeId)),
      questions: section.questions.map((question, index) => ({
        id: question.id,
        categoryId: section.id,
        text: question.questionText,
        order: index + 1,
        isActive: question.isActive,
      })),
    };
  }
}
