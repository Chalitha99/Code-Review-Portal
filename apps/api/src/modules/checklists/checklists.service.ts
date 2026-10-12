import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class ChecklistsService {
  constructor(private readonly prisma: PrismaService) {}

  async findTemplate(includeInactive = false) {
    const sections = await this.prisma.checklistSection.findMany({
      // The admin view lists every category, including one not yet linked to
      // any task type, so it can be completed; developers see only categories
      // that apply to an active task type.
      where: includeInactive
        ? {}
        : { isActive: true, taskTypes: { some: { taskType: { isActive: true } } } },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      include: {
        taskTypes: {
          where: includeInactive ? {} : { taskType: { isActive: true } },
          orderBy: { displayOrder: 'asc' },
        },
        questions: {
          where: includeInactive ? {} : { isActive: true },
          orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });

    return (
      sections
        // Developers never see an empty category; admins see every one to fill it.
        .filter((section) => includeInactive || section.questions.length > 0)
        .map((section, index) => ({
          id: section.id,
          name: section.name,
          order: index + 1,
          isActive: section.isActive,
          applicableTaskTypeIds: section.taskTypes.map(({ taskTypeId }) => String(taskTypeId)),
          questions: section.questions.map((question, position) => ({
            id: question.id,
            categoryId: section.id,
            text: question.questionText,
            order: position + 1,
            isActive: question.isActive,
          })),
        }))
    );
  }

  async findForTaskTypes(taskTypeIds: number[]) {
    const taskTypes = await this.prisma.taskType.findMany({
      where: { id: { in: taskTypeIds }, isActive: true },
    });
    if (taskTypes.length !== taskTypeIds.length) {
      const found = new Set(taskTypes.map(({ id }) => id));
      const missing = taskTypeIds.filter((id) => !found.has(id));
      throw new NotFoundException(`Active task type(s) not found: ${missing.join(', ')}`);
    }

    const sectionMappings = await this.prisma.taskTypeChecklistSection.findMany({
      where: {
        taskTypeId: { in: taskTypeIds },
        section: { isActive: true, questions: { some: { isActive: true } } },
      },
      orderBy: [{ section: { displayOrder: 'asc' } }, { section: { name: 'asc' } }],
      include: {
        taskType: true,
        section: {
          include: {
            questions: {
              where: { isActive: true },
              orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
            },
          },
        },
      },
    });

    const sectionsById = new Map<
      string,
      (typeof sectionMappings)[number]['section'] & {
        displayOrder: number;
        taskTypes: (typeof sectionMappings)[number]['taskType'][];
      }
    >();
    for (const mapping of sectionMappings) {
      const existing = sectionsById.get(mapping.sectionId);
      if (existing) {
        existing.displayOrder = Math.min(existing.displayOrder, mapping.displayOrder);
        existing.taskTypes.push(mapping.taskType);
      } else {
        sectionsById.set(mapping.sectionId, {
          ...mapping.section,
          displayOrder: mapping.displayOrder,
          taskTypes: [mapping.taskType],
        });
      }
    }
    const sections = [...sectionsById.values()].sort(
      (left, right) =>
        left.displayOrder - right.displayOrder || left.name.localeCompare(right.name),
    );
    return { taskTypes, sections };
  }
}
