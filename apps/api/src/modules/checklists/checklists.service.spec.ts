import { describe, expect, it, vi } from 'vitest';
import { ChecklistsService } from './checklists.service.js';

describe('ChecklistsService', () => {
  it('returns task-type applicability on the category', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: '00000000-0000-0000-0000-000000000001',
        name: 'Code Quality',
        isActive: true,
        taskTypes: [
          { taskTypeId: 2, displayOrder: 1 },
          { taskTypeId: 4, displayOrder: 1 },
        ],
        questions: [
          {
            id: '00000000-0000-0000-0000-000000000002',
            questionText: 'Is the implementation maintainable?',
            displayOrder: 0,
            isActive: true,
          },
        ],
      },
    ]);
    const service = new ChecklistsService({ checklistSection: { findMany } } as never);

    await expect(service.findTemplate()).resolves.toEqual([
      {
        id: '00000000-0000-0000-0000-000000000001',
        name: 'Code Quality',
        order: 1,
        isActive: true,
        applicableTaskTypeIds: ['2', '4'],
        questions: [
          {
            id: '00000000-0000-0000-0000-000000000002',
            categoryId: '00000000-0000-0000-0000-000000000001',
            text: 'Is the implementation maintainable?',
            // Positions are 1..n regardless of the stored sort key.
            order: 1,
            isActive: true,
          },
        ],
      },
    ]);
  });

  it("hides a category with no active questions from developers, not from admins", async () => {
    const empty = { id: "c-empty", name: "Empty", isActive: true, taskTypes: [{ taskTypeId: 2, displayOrder: 1 }], questions: [] };
    const service = new ChecklistsService({ checklistSection: { findMany: vi.fn().mockResolvedValue([empty]) } } as never);

    await expect(service.findTemplate()).resolves.toEqual([]);
    await expect(service.findTemplate(true)).resolves.toHaveLength(1);
  });
});
