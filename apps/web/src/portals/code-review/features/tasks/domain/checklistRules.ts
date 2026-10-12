import type {
  ChecklistAnswer,
  ChecklistCategory,
  ChecklistCategoryProgress,
  ChecklistProgress,
  TaskTypeId,
} from '@sdp/contracts';
import { visibleCategories, visibleQuestions } from '@/lib/checklistVisibility.ts';

const VALID_ANSWERS = new Set<ChecklistAnswer>(['Yes', 'No', 'NA']);

/**
 * The dynamic quality checklist (spec FL 2.6-01/02).
 *
 * The engine is data-driven end to end: categories, questions and task types are
 * all administered, so nothing here knows the name of a single question or task
 * type. Adding "Customization" to a question is a row edit; adding a whole task
 * type is a row insert. No code changes either way.
 *
 * Applicability lives on the CATEGORY (`applicableTaskTypeIds`); every active
 * question in it inherits that. The filter itself is shared with the admin
 * checklist preview through `lib/checklistVisibility`.
 */

export { visibleCategories, visibleQuestions };

function answerMap(
  answers: readonly { questionId: string; answer: string }[],
): Map<string, string> {
  /*
   * Runtime state can outlive a deployment in sessionStorage. Do not let an
   * obsolete or corrupted value such as `"Maybe"` count as an answer merely
   * because TypeScript trusted it at compile time. The API validates this too,
   * but progress and the Next gate run before the API is called.
   */
  return new Map(
    answers
      .filter((entry) => VALID_ANSWERS.has(entry.answer as ChecklistAnswer))
      .map((entry) => [entry.questionId, entry.answer]),
  );
}

/**
 * Progress per category and overall.
 *
 * Only *visible* questions count. An answer left behind by a task type the
 * developer has since deselected must not hold the checklist open, and must not
 * inflate the completed count either — which is why answers are counted against
 * the visible set rather than the stored array.
 */
export function checklistProgress(
  categories: readonly ChecklistCategory[],
  taskTypeIds: readonly TaskTypeId[],
  answers: readonly { questionId: string; answer: string }[],
): ChecklistProgress {
  const byQuestion = answerMap(answers);
  const visible = visibleCategories(categories, taskTypeIds);

  const categoryProgress: ChecklistCategoryProgress[] = visible.map((category) => {
    const answered = category.questions.filter((question) => byQuestion.has(question.id)).length;
    return {
      categoryId: category.id,
      categoryName: category.name,
      answered,
      total: category.questions.length,
      isComplete: answered === category.questions.length,
    };
  });

  const total = categoryProgress.reduce((sum, category) => sum + category.total, 0);
  const answered = categoryProgress.reduce((sum, category) => sum + category.answered, 0);

  return {
    categories: categoryProgress,
    answered,
    total,
    // An empty checklist is not a complete one. Without this guard a task with
    // no types selected would report `0 === 0` and sail past the submit gate.
    isComplete: total > 0 && answered === total,
    issueCount: issueCount(categories, taskTypeIds, answers),
  };
}

/** FL 2.6-02: every rendered question must carry an answer. */
export function answersComplete(
  categories: readonly ChecklistCategory[],
  taskTypeIds: readonly TaskTypeId[],
  answers: readonly { questionId: string; answer: string }[],
): boolean {
  return checklistProgress(categories, taskTypeIds, answers).isComplete;
}

/**
 * Count of "No" answers — the "N Issue Found" badge on the review step.
 *
 * "N/A" is not an issue: it means the question does not apply, which is a
 * legitimate answer rather than a failed check.
 */
export function issueCount(
  categories: readonly ChecklistCategory[],
  taskTypeIds: readonly TaskTypeId[],
  answers: readonly { questionId: string; answer: string }[],
): number {
  const byQuestion = answerMap(answers);
  return visibleQuestions(categories, taskTypeIds).filter(
    (question) => byQuestion.get(question.id) === 'No',
  ).length;
}

/**
 * Answers whose question is no longer visible, so a save can drop them.
 *
 * Deselecting a task type must not silently keep its answers in the record: the
 * checklist a reviewer reads has to match the one the developer was shown.
 */
export function orphanedAnswers<TEntry extends { questionId: string }>(
  categories: readonly ChecklistCategory[],
  taskTypeIds: readonly TaskTypeId[],
  answers: readonly TEntry[],
): TEntry[] {
  const visibleIds = new Set(
    visibleQuestions(categories, taskTypeIds).map((question) => question.id),
  );
  return answers.filter((entry) => !visibleIds.has(entry.questionId));
}
