import { validate } from 'class-validator';
import { describe, expect, it, vi } from 'vitest';
import { ChecklistSectionsService } from './checklist-sections.service.js';
import { CreateChecklistCategoryDto } from './dto/create-checklist-category.dto.js';

const categoryId = '00000000-0000-4000-8000-000000000001';

function section(overrides: Record<string, unknown> = {}) {
  return {
    id: categoryId,
    name: 'Code Quality',
    isActive: true,
    taskTypes: [
      {
        taskTypeId: 2,
        displayOrder: 1,
        taskType: { id: 2, name: 'Customization', isActive: true },
      },
    ],
    questions: [],
    ...overrides,
  };
}

describe('ChecklistSectionsService category management', () => {
  it('accepts the existing Add Category payload', async () => {
    const dto = Object.assign(new CreateChecklistCategoryDto(), {
      name: 'Code Quality',
      applicableTaskTypeIds: ['2'],
    });

    await expect(validate(dto, { whitelist: true, forbidNonWhitelisted: true })).resolves.toEqual(
      [],
    );
  });

  it('creates a category with task-type applicability and the frontend response shape', async () => {
    const created = section();
    const prisma = {
      checklistSection: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
        aggregate: vi.fn().mockResolvedValue({ _max: { displayOrder: 0 } }),
        update: vi.fn().mockResolvedValue(created),
        findMany: vi.fn().mockResolvedValue([created]),
      },
      taskType: {
        findMany: vi.fn().mockResolvedValue([{ id: 2 }]),
      },
    };
    const service = new ChecklistSectionsService(prisma as never);

    await expect(
      service.createCategory({ name: ' Code Quality ', applicableTaskTypeIds: ['2'] }),
    ).resolves.toEqual({
      id: categoryId,
      name: 'Code Quality',
      order: 1,
      isActive: true,
      applicableTaskTypeIds: ['2'],
      questions: [],
    });
    expect(prisma.checklistSection.create).toHaveBeenCalledWith({
      data: {
        name: 'Code Quality',
        taskTypes: { create: [{ taskTypeId: 2, displayOrder: 1 }] },
      },
      include: expect.any(Object),
    });
  });

  it('edits and deactivates a category while preserving its questions', async () => {
    const existing = section({
      questions: [
        {
          id: '00000000-0000-4000-8000-000000000002',
          questionText: 'Is the code maintainable?',
          displayOrder: 0,
          isActive: true,
        },
      ],
    });
    const updated = section({ ...existing, name: 'Maintainability', isActive: false });
    const tx = {
      checklistSection: { update: vi.fn().mockResolvedValue(updated) },
      taskTypeChecklistSection: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      checklistSection: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(existing)
          .mockResolvedValueOnce(existing)
          .mockResolvedValueOnce(updated),
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([updated]),
      },
      taskType: { findMany: vi.fn().mockResolvedValue([{ id: 2 }]) },
      $transaction: vi.fn((operation: (client: typeof tx) => unknown) => operation(tx)),
    };
    const service = new ChecklistSectionsService(prisma as never);

    await expect(
      service.updateCategory(categoryId, {
        name: 'Maintainability',
        applicableTaskTypeIds: ['2'],
        isActive: false,
      }),
    ).resolves.toMatchObject({
      id: categoryId,
      name: 'Maintainability',
      isActive: false,
      applicableTaskTypeIds: ['2'],
      questions: [expect.objectContaining({ text: 'Is the code maintainable?' })],
    });
    expect(tx.checklistSection.update).toHaveBeenCalledWith({
      where: { id: categoryId },
      data: { name: 'Maintainability', isActive: false },
    });
  });

  it('permanently deletes an empty category and its task-type mappings', async () => {
    const tx = {
      taskTypeChecklistSection: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
      checklistSection: { delete: vi.fn().mockResolvedValue(section()) },
    };
    const prisma = {
      checklistSection: { findUnique: vi.fn().mockResolvedValue(section()) },
      $transaction: vi.fn((operation: (client: typeof tx) => unknown) => operation(tx)),
    };
    const service = new ChecklistSectionsService(prisma as never);

    await expect(service.removeCategory(categoryId)).resolves.toBeUndefined();
    expect(tx.taskTypeChecklistSection.deleteMany).toHaveBeenCalledWith({
      where: { sectionId: categoryId },
    });
    expect(tx.checklistSection.delete).toHaveBeenCalledWith({ where: { id: categoryId } });
  });

  it('protects questions and checklist history from category deletion', async () => {
    const prisma = {
      checklistSection: {
        findUnique: vi.fn().mockResolvedValue(
          section({
            questions: [
              {
                id: '00000000-0000-4000-8000-000000000002',
                questionText: 'Existing question',
                displayOrder: 0,
                isActive: true,
              },
            ],
          }),
        ),
      },
    };
    const service = new ChecklistSectionsService(prisma as never);

    await expect(service.removeCategory(categoryId)).rejects.toMatchObject({
      code: 'CATEGORY_NOT_EMPTY',
    });
  });

  it('reports positions 1..n even when stored orders are 0-based or have gaps', async () => {
    const first = section({ id: 'a', name: 'A', displayOrder: 0, questions: [
      { id: 'q1', questionText: 'One', displayOrder: 0, isActive: true },
      { id: 'q2', questionText: 'Two', displayOrder: 7, isActive: true },
    ] });
    const second = section({ id: 'b', name: 'B', displayOrder: 5 });
    const prisma = { checklistSection: { findMany: vi.fn().mockResolvedValue([first, second]) } };
    const service = new ChecklistSectionsService(prisma as never);

    const categories = await service.findCategories();

    expect(categories.map(({ order }) => order)).toEqual([1, 2]);
    expect(categories[0]?.questions.map(({ order }) => order)).toEqual([1, 2]);
  });

  it('rewrites the category sequence 1..n and refuses an incomplete list', async () => {
    const update = vi.fn().mockResolvedValue({});
    const prisma = {
      checklistSection: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }])
          .mockResolvedValueOnce([section({ id: 'b' }), section({ id: 'a' })])
          .mockResolvedValue([{ id: 'a' }, { id: 'b' }]),
        update,
      },
      $transaction: vi.fn((operations: unknown[]) => Promise.all(operations)),
    };
    const service = new ChecklistSectionsService(prisma as never);

    await service.reorderCategories(['b', 'a']);
    expect(update).toHaveBeenNthCalledWith(1, { where: { id: 'b' }, data: { displayOrder: 1 } });
    expect(update).toHaveBeenNthCalledWith(2, { where: { id: 'a' }, data: { displayOrder: 2 } });

    await expect(service.reorderCategories(['a'])).rejects.toMatchObject({
      code: 'ORDER_INCOMPLETE',
    });
  });
});
