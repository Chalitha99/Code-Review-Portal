import { describe, expect, it } from 'vitest';
import type { ChecklistCategory } from '@sdp/contracts';
import { visibleCategories, visibleQuestions } from '@/lib/checklistVisibility.ts';

function category(
  id: string,
  order: number,
  applicableTaskTypeIds: string[],
  overrides: Partial<ChecklistCategory> = {},
): ChecklistCategory {
  return {
    id,
    name: id,
    order,
    isActive: true,
    applicableTaskTypeIds,
    questions: [{ id: `${id}-q1`, categoryId: id, text: 'Q', order: 1, isActive: true }],
    ...overrides,
  };
}

describe('visibleCategories', () => {
  it('shows a category only for the task types it applies to', () => {
    const categories = [category('shared', 1, ['a', 'b']), category('a-only', 2, ['a'])];
    expect(visibleCategories(categories, ['b']).map((c) => c.id)).toEqual(['shared']);
    expect(visibleCategories(categories, ['a']).map((c) => c.id)).toEqual(['shared', 'a-only']);
  });

  it('returns nothing until a task type is chosen', () => {
    expect(visibleCategories([category('x', 1, ['a'])], [])).toEqual([]);
    expect(visibleQuestions([category('x', 1, ['a'])], [])).toEqual([]);
  });

  it('drops inactive categories, inactive questions and categories left empty', () => {
    const categories = [
      category('retired', 1, ['a'], { isActive: false }),
      category('empty', 2, ['a'], {
        questions: [{ id: 'q', categoryId: 'empty', text: 'Q', order: 1, isActive: false }],
      }),
      category('live', 3, ['a']),
    ];
    expect(visibleCategories(categories, ['a']).map((c) => c.id)).toEqual(['live']);
  });

  it('orders by `order` and breaks ties by id, for categories and questions alike', () => {
    const categories = [
      category('b', 1, ['a'], {
        questions: [
          { id: 'q2', categoryId: 'b', text: 'Q2', order: 1, isActive: true },
          { id: 'q1', categoryId: 'b', text: 'Q1', order: 1, isActive: true },
        ],
      }),
      category('a', 1, ['a']),
    ];
    expect(visibleCategories(categories, ['a']).map((c) => c.id)).toEqual(['a', 'b']);
    expect(visibleQuestions(categories, ['a']).map((q) => q.id)).toEqual(['a-q1', 'q1', 'q2']);
  });

  it('collapses duplicate category ids to one entry', () => {
    const categories = [category('dup', 1, ['a']), category('dup', 1, ['a'])];
    expect(visibleCategories(categories, ['a'])).toHaveLength(1);
  });
});
