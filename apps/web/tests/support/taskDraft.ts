import { buildDataset, type Dataset } from './fixtures/dataset.ts';
import { visibleQuestions } from '@/lib/checklistVisibility.ts';
import { useTaskDraft } from '@/portals/code-review/features/tasks/hooks/useTaskDraft.ts';

export const DRAFT_OWNER = 'u-hiruni';
const TASK_TYPE = 'tt-quick-report';

/**
 * Loads one of `developerId`'s fixture Draft tasks into the wizard store with
 * every visible checklist question answered, so the review step can submit.
 */
export function hydrateCompleteDraft(
  developerId: string = DRAFT_OWNER,
  db: Dataset = buildDataset(),
) {
  const task = db.tasks.find((t) => t.developerId === developerId && t.status === 'Draft');
  if (!task) throw new Error(`seed has no draft for ${developerId}`);
  const questions = visibleQuestions(db.checklistTemplate, [TASK_TYPE]);
  if (questions.length === 0) throw new Error(`${TASK_TYPE} has no visible questions`);

  useTaskDraft.getState().hydrate({
    taskId: task.id,
    taskCode: task.taskCode,
    customerId: task.customerId,
    crimId: task.crimId,
    version: task.version ?? '',
    priority: task.priority,
    taskTypeIds: [TASK_TYPE],
    answers: questions.map((q) => ({ questionId: q.id, answer: 'Yes' as const })),
    remarks: '',
    noteToReviewer: '',
  });
  return task;
}
