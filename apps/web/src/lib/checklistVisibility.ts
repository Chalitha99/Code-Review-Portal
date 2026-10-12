import type { ChecklistCategory, ChecklistQuestion, TaskTypeId } from '@sdp/contracts';

/**
 * Which checklist categories and questions apply to a set of task types.
 *
 * Applicability lives on the CATEGORY: a category renders when it is active,
 * applies to at least one selected task type and still has an active question.
 * Shared by the developer wizard (`tasks/domain/checklistRules` re-exports it)
 * and the admin checklist editor's preview.
 *
 * With no task type selected the result is empty rather than "everything" —
 * the wizard prompts for a task type first.
 */
export function visibleCategories(
  categories: readonly ChecklistCategory[],
  taskTypeIds: readonly TaskTypeId[],
): ChecklistCategory[] {
  if (taskTypeIds.length === 0) return [];

  // Duplicate ids can arrive from stale cached data; the last definition wins.
  const unique = new Map(categories.map((category) => [category.id, category]));
  return [...unique.values()]
    .filter(
      (category) =>
        category.isActive && category.applicableTaskTypeIds.some((id) => taskTypeIds.includes(id)),
    )
    .map((category) => ({
      ...category,
      questions: category.questions.filter((question) => question.isActive).sort(byOrderThenId),
    }))
    .filter((category) => category.questions.length > 0)
    .sort(byOrderThenId);
}

export function visibleQuestions(
  categories: readonly ChecklistCategory[],
  taskTypeIds: readonly TaskTypeId[],
): ChecklistQuestion[] {
  return visibleCategories(categories, taskTypeIds).flatMap((category) => category.questions);
}

function byOrderThenId(a: { order: number; id: string }, b: { order: number; id: string }): number {
  return a.order !== b.order ? a.order - b.order : a.id.localeCompare(b.id);
}
