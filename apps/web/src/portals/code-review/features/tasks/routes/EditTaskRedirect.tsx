import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ErrorState } from '@/components/common/states.tsx';
import { PageSkeleton } from '@/components/common/Skeleton.tsx';
import { ROUTES } from '@/config/routes.ts';
import { useCurrentUser } from '@/hooks/useCurrentUser.ts';
import { canEditTask } from '@/lib/statusMachine.ts';
import tasksContent from '@/content/tasks.json';
import { useChecklistTemplate, useTask, useTaskChecklist } from '../api/queries.ts';
import { checklistProgress } from '../domain/checklistRules.ts';
import { missingRequirements, resumeStep } from '../domain/taskRules.ts';
import { useTaskDraft } from '../hooks/useTaskDraft.ts';

/**
 * `/developer/tasks/:taskId/edit` — reopen an existing task in the wizard.
 *
 * This route exists so that "which task am I editing" is answered by the URL
 * rather than by whatever `sessionStorage` happens to hold. Before it, the
 * Continue-editing buttons navigated to the generic wizard path, so the wizard
 * opened on the last draft touched on this browser — a DIFFERENT task, or an
 * empty form, with no way to tell which.
 *
 * Because it re-fetches and re-hydrates on every visit, three things follow
 * that used to need their own handling: a Changes-Requested task loads its own
 * answers rather than a stale draft's, opening a second task cannot show the
 * first, and a draft survives the loss of browser state — the URL is enough to
 * rebuild it.
 *
 * It renders nothing of its own: it resolves, hydrates, and redirects into the
 * wizard at the first step that still needs work.
 */
export function EditTaskRedirect() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();

  const { data: user } = useCurrentUser();
  const { data: task, isPending, error, refetch } = useTask(taskId);
  const { data: checklist, isPending: checklistPending } = useTaskChecklist(taskId);
  const { data: template, isPending: templatePending } = useChecklistTemplate();
  const hydrate = useTaskDraft((state) => state.hydrate);

  /*
   * ONE gate, not two hand-written ones. `canEditTask` already answers both
   * halves of "may this person resume this task" — the caller owns it, and the
   * status is still Draft or ChangesRequested. Re-deriving either here would be
   * a second copy of a rule the server also enforces on PATCH and PUT.
   */
  const actor = { userId: user?.id ?? '', roles: user?.roles ?? [] };
  const mayEdit =
    task !== undefined &&
    canEditTask(actor, {
      status: task.status,
      developerId: task.developerId,
      reviewerId: task.reviewerId,
    });

  const isLoading = isPending || checklistPending || templatePending;

  useEffect(() => {
    if (isLoading || !task || !mayEdit) return;

    /*
     * The STORED checklist, not the template's shape. Answers are snapshotted
     * per task, and the wizard's store keeps ids only — the server re-snapshots
     * the wording on save — so the entries are projected down to what the store
     * models.
     */
    const answers = (checklist?.answers ?? []).map((entry) => ({
      questionId: entry.questionId,
      answer: entry.answer,
    }));

    // In an effect, never in render: `hydrate` writes to a Zustand store, and a
    // store write during render invalidates components that have already
    // rendered. `RootLayout` documents that failure at length.
    hydrate({
      taskId: task.id,
      taskCode: task.taskCode,
      createdAt: task.createdAt,
      submittedAt: task.submittedAt,
      customerId: task.customerId,
      crimId: task.crimId,
      version: task.version ?? '',
      priority: task.priority,
      taskTypeIds: task.taskTypeIds,
      answers,
      remarks: checklist?.remarks ?? '',
      noteToReviewer: task.noteToReviewer ?? '',
    });

    const progress = checklistProgress(template ?? [], task.taskTypeIds, answers);
    const missing = missingRequirements({
      draft: {
        customerId: task.customerId,
        crimId: task.crimId,
        priority: task.priority,
      },
      taskTypes: task.taskTypeIds,
      isChecklistComplete: progress.isComplete,
    });

    /*
     * The first step still carrying an unmet requirement, so a developer who
     * filled in step 1 yesterday does not retype it. `replace` because this
     * route is a redirect: Back from the wizard should return to the task, not
     * bounce through here and hydrate again.
     */
    void navigate(ROUTES.developer.editTaskStep(task.id, resumeStep(missing)), { replace: true });
  }, [isLoading, task, mayEdit, checklist, template, hydrate, navigate]);

  if (isLoading) return <PageSkeleton className="min-h-[60vh]" />;

  /*
   * A task that is gone and a task that is not the caller's are reported the
   * same way, and deliberately: the API answers 404 for both, so that a
   * developer cannot use this route to learn that someone else's task exists.
   */
  if (error || !task || !mayEdit) {
    return (
      <ErrorState
        title={tasksContent.detail.notEditableTitle}
        message={tasksContent.detail.notEditable}
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  // Hydrated; the effect above is navigating away this frame.
  return <PageSkeleton className="min-h-[60vh]" />;
}
