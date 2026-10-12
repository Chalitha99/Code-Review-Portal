import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FilePlus2,
  Pencil,
  Save,
  Send,
  X,
} from 'lucide-react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button.tsx';
import { PageHeader } from '@/components/common/PageHeader.tsx';
import { Stepper, type Requirement, type Step } from '@/components/common/Stepper.tsx';
import { ROUTES } from '@/config/routes.ts';
import { ApiError } from '@/lib/apiClient.ts';
import { interpolate } from '@/lib/formatters.ts';
import { useCurrentUser } from '@/hooks/useCurrentUser.ts';
import { canEditTask } from '@/lib/statusMachine.ts';
import common from '@/content/common.json';
import tasks from '@/content/tasks.json';
import { checklistProgress } from '../domain/checklistRules.ts';
import {
  useChecklistTemplate,
  useCreateTask,
  useNextTaskVersion,
  useSaveChecklist,
  useSubmitTask,
  useTask,
  useTaskChecklist,
  useUpdateTask,
} from '../api/queries.ts';
import {
  canLeaveStep,
  missingRequirements,
  requirementsForStep,
  TASK_WIZARD_STEPS,
  type TaskRequirement,
  type TaskWizardStep,
} from '../domain/taskRules.ts';
import { useTaskDraft } from '../hooks/useTaskDraft.ts';
import { ChecklistSidePanels, WizardChecklistStep } from '../components/WizardChecklistStep.tsx';
import { TaskSummaryCard, WizardDetailsStep } from '../components/WizardDetailsStep.tsx';
import { ReviewSidePanels, WizardReviewStep } from '../components/WizardReviewStep.tsx';
import { PageContainer } from '@/components/common/PageContainer.tsx';
import { ErrorState, LoadingState } from '@/components/common/states.tsx';

/**
 * Task wizard (screens 22–24) — creation and editing flow.
 *
 * This component owns navigation and persistence; the step components own only
 * their fields. Every gate below is a call into `taskRules`, so the Next button,
 * the requirement panel and the final Submit read from one source and cannot
 * disagree about whether the task is ready.
 *
 * Steps are URL segments rather than local state, so a half-finished task is a
 * link, browser Back steps backwards through the wizard rather than leaving it,
 * and a draft resumes at the step that is actually incomplete.
 */

function isWizardStep(value: string | undefined): value is TaskWizardStep {
  return TASK_WIZARD_STEPS.includes(value as TaskWizardStep);
}

/** Requirements each step surfaces in its side panel, in the order shown. */
const PANEL_REQUIREMENTS: Record<TaskWizardStep, readonly TaskRequirement[]> = {
  details: ['customer', 'crimId'],
  checklist: ['taskTypes', 'checklist'],
  review: [],
};

export function NewTaskWizard({ mode = 'create' }: { mode?: 'create' | 'edit' } = {}) {
  const { step, taskId: routeTaskId } = useParams<{ step: string; taskId?: string }>();
  const navigate = useNavigate();
  const draft = useTaskDraft();
  const { data: user } = useCurrentUser();
  const isEditMode = mode === 'edit' || Boolean(routeTaskId);
  const editTaskId = routeTaskId ?? (isEditMode ? (draft.taskId ?? undefined) : undefined);

  const {
    data: existingTask,
    isPending: taskPending,
    error: taskError,
    refetch: refetchTask,
  } = useTask(editTaskId);
  const { data: existingChecklist, isPending: checklistPending } = useTaskChecklist(editTaskId);

  const {
    data: template,
    isPending: templatePending,
    isError: templateFailed,
    refetch: refetchTemplate,
  } = useChecklistTemplate();

  const actor = { userId: user?.id ?? '', roles: user?.roles ?? [] };
  const mayEdit =
    !isEditMode ||
    (existingTask !== undefined &&
      canEditTask(actor, {
        status: existingTask.status,
        developerId: existingTask.developerId,
        reviewerId: existingTask.reviewerId,
      }));

  // Auto-hydrate when loading an existing task if store is not yet initialized for this task
  useEffect(() => {
    if (!isEditMode || !editTaskId || !existingTask || !mayEdit) return;
    if (draft.taskId === editTaskId) return;

    const answers = (existingChecklist?.answers ?? []).map((entry) => ({
      questionId: entry.questionId,
      answer: entry.answer,
    }));

    draft.hydrate({
      taskId: existingTask.id,
      taskCode: existingTask.taskCode,
      customerId: existingTask.customerId,
      crimId: existingTask.crimId,
      version: existingTask.version ?? '',
      priority: existingTask.priority,
      taskTypeIds: existingTask.taskTypeIds,
      answers,
      remarks: existingChecklist?.remarks ?? '',
      noteToReviewer: existingTask.noteToReviewer ?? '',
      createdAt: existingTask.createdAt,
      submittedAt: existingTask.submittedAt,
    });
  }, [isEditMode, editTaskId, existingTask, existingChecklist, mayEdit, draft]);

  const [showErrors, setShowErrors] = useState(false);
  const actionInFlight = useRef(false);

  const effectiveTaskId = draft.taskId ?? editTaskId ?? '';
  const isPersistedDraft = draft.taskId !== null || isEditMode;
  const nextVersion = useNextTaskVersion(draft.customerId, draft.crimId, !isPersistedDraft);
  const displayedVersion = isPersistedDraft
    ? draft.version
    : nextVersion.data === undefined
      ? ''
      : String(nextVersion.data.version);
  const hasIdentityInputs = draft.customerId !== '' && draft.crimId.trim() !== '';
  const isVersionChecking =
    !isPersistedDraft && hasIdentityInputs && (nextVersion.isPending || nextVersion.isFetching);
  const isVersionError = !isPersistedDraft && hasIdentityInputs && nextVersion.isError;
  const versionReady = isPersistedDraft || nextVersion.isSuccess;
  const createTask = useCreateTask();
  const updateTask = useUpdateTask(effectiveTaskId);
  const saveChecklist = useSaveChecklist(effectiveTaskId);
  const submitTask = useSubmitTask(effectiveTaskId);

  const progress = useMemo(
    () => checklistProgress(template ?? [], draft.taskTypeIds, draft.answers),
    [template, draft.taskTypeIds, draft.answers],
  );

  const missing = useMemo(
    () =>
      missingRequirements({
        draft: {
          customerId: draft.customerId,
          crimId: draft.crimId,
          priority: draft.priority,
        },
        taskTypes: draft.taskTypeIds,
        isChecklistComplete: progress.isComplete,
      }),
    [draft.customerId, draft.crimId, draft.priority, draft.taskTypeIds, progress.isComplete],
  );

  const getStepUrl = (targetStep: string) =>
    isEditMode && editTaskId
      ? ROUTES.developer.editTaskStep(editTaskId, targetStep)
      : ROUTES.developer.newTaskStep(targetStep);

  const handleReturnToContext = () => {
    if (isEditMode && editTaskId) {
      void navigate(ROUTES.developer.task(editTaskId));
    } else {
      void navigate(ROUTES.developer.root);
    }
  };

  if (isEditMode && editTaskId) {
    if (taskPending || checklistPending) {
      return (
        <PageContainer>
          <LoadingState className="min-h-[60vh]" />
        </PageContainer>
      );
    }
    if (taskError || !existingTask || !mayEdit) {
      return (
        <PageContainer>
          <ErrorState
            title={tasks.detail.notEditableTitle}
            message={tasks.detail.notEditable}
            onRetry={() => {
              void refetchTask();
            }}
            className="min-h-[60vh]"
          />
        </PageContainer>
      );
    }
  }

  if (!isWizardStep(step)) {
    return <Navigate to={getStepUrl('details')} replace />;
  }

  // Re-bound after the guard: TypeScript does not carry the narrowing of a
  // destructured param into the hoisted function declarations below.
  const currentStep: TaskWizardStep = step;
  const stepIndex = TASK_WIZARD_STEPS.indexOf(currentStep);

  if (
    currentStep !== 'details' &&
    ((!isEditMode && draft.taskId === null) || !canLeaveStep('details', missing))
  ) {
    return <Navigate to={getStepUrl('details')} replace />;
  }

  if (currentStep !== 'details' && templatePending) {
    return (
      <PageContainer>
        <LoadingState className="min-h-[60vh]" />
      </PageContainer>
    );
  }

  if (currentStep !== 'details' && templateFailed) {
    return (
      <PageContainer>
        <ErrorState
          onRetry={() => {
            void refetchTemplate();
          }}
          className="min-h-[60vh]"
        />
      </PageContainer>
    );
  }

  if (currentStep === 'review' && !canLeaveStep('checklist', missing)) {
    return <Navigate to={getStepUrl('checklist')} replace />;
  }

  const isBusy =
    createTask.isPending || updateTask.isPending || saveChecklist.isPending || submitTask.isPending;

  const steps: Step[] = TASK_WIZARD_STEPS.map((id, index) => ({
    id,
    title: tasks.wizard.steps[id],
    state:
      id === currentStep
        ? showErrors && !canLeaveStep(id, missing)
          ? 'error'
          : 'current'
        : index < stepIndex
          ? canLeaveStep(id, missing)
            ? 'complete'
            : 'error'
          : 'upcoming',
  }));

  const detailsRequirementCodes: TaskRequirement[] = ['customer', 'crimId'];

  const requirements: Requirement[] = (
    currentStep === 'details' ? detailsRequirementCodes : PANEL_REQUIREMENTS[currentStep]
  ).map((requirement) => ({
    id: requirement,
    label: tasks.wizard.requirements[requirement],
    state: missing.includes(requirement) ? 'blocking' : 'met',
  }));

  const canAdvance = canLeaveStep(currentStep, missing);

  /**
   * Persists whatever the current step owns, then reports the task id.
   *
   * Step 1 creates the task on first save and patches it thereafter, so leaving
   * and returning does not produce a second draft. Steps 2 and 3 need a task to
   * attach to, which is why the create has to have happened first.
   */
  async function persist({ saveAll = false }: { saveAll?: boolean } = {}): Promise<string | null> {
    if (!versionReady) {
      toast.error('Unable to determine the next version. Please try again.');
      return null;
    }
    try {
      let taskId = draft.taskId;
      let createdNow = taskId === null;

      if (!createdNow && taskId !== null) {
        try {
          const updated = await updateTask.mutateAsync({
            customerId: draft.customerId,
            crimId: draft.crimId.trim(),
            priority: draft.priority,
            ...(currentStep === 'review' || saveAll
              ? { noteToReviewer: draft.remarks.trim() }
              : {}),
          });
          if (draft.createdAt === null && updated?.createdAt) {
            draft.setTaskId(updated.id, updated.taskCode, updated.createdAt, updated.submittedAt);
          }
        } catch (updateError) {
          // If the server draft was lost (a deleted task, a stale id kept in the browser — a 404),
          // self-heal by creating the task fresh on the server instead of getting stuck.
          if (updateError instanceof ApiError && updateError.statusCode === 404) {
            createdNow = true;
          } else {
            throw updateError;
          }
        }
      }

      if (createdNow) {
        const created = await createTask.mutateAsync({
          customerId: draft.customerId,
          crimId: draft.crimId.trim(),
          priority: draft.priority,
        });
        taskId = created.id;
        draft.hydrate({
          taskId: created.id,
          taskCode: created.taskCode,
          version: created.version ?? '',
          createdAt: created.createdAt,
          submittedAt: created.submittedAt,
        });
      }

      // A mutation hook created before POST still points at an empty task id, so
      // a just-created step-1 draft stops after POST and saves its checklist on
      // the next render. Every later step already has the issued id.
      if (!createdNow && (currentStep !== 'details' || saveAll)) {
        const snapshot = {
          taskTypeIds: [...draft.taskTypeIds],
          answers: draft.answers.map((entry) => ({ ...entry })),
          remarks: draft.remarks,
        };
        const saved = await saveChecklist.mutateAsync(snapshot);

        /*
         * PUT is a full replacement. Mirror the server's applicable-only
         * answer set after Save so a deselected type cannot reappear locally
         * with answers the server has already removed. If the user edited the
         * form while the request was pending, keep those newer local changes.
         */
        const latest = useTaskDraft.getState();
        if (
          JSON.stringify(latest.taskTypeIds) === JSON.stringify(snapshot.taskTypeIds) &&
          JSON.stringify(latest.answers) === JSON.stringify(snapshot.answers) &&
          latest.remarks === snapshot.remarks
        ) {
          latest.hydrate({
            taskTypeIds: saved.taskTypeIds,
            answers: saved.answers.map(({ questionId, answer }) => ({ questionId, answer })),
            remarks: saved.remarks,
          });
        }
      }

      return taskId;
    } catch (cause) {
      toast.error(cause instanceof ApiError ? cause.message : common.errors.generic);
      return null;
    }
  }

  async function handleNext() {
    if (!canAdvance) {
      setShowErrors(true);
      return;
    }

    const taskId = await persist();
    if (taskId === null) return;

    setShowErrors(false);
    const next = TASK_WIZARD_STEPS[stepIndex + 1];
    if (next !== undefined) void navigate(getStepUrl(next));
  }

  async function handleSaveDraft() {
    const taskId = await persist({ saveAll: true });
    if (taskId === null) return;
    toast.success(common.actions.saveDraft);
  }

  async function handleSubmit() {
    if (missing.length > 0) {
      setShowErrors(true);
      /*
       * A toast, because the review step has nowhere else to say this. It owns
       * no requirements of its own, so `statusLine` renders nothing and the
       * requirement panel is empty — everything still outstanding belongs to an
       * earlier step the user is no longer looking at. Naming the first one is
       * what makes the dimmed Submit explicable instead of merely dead.
       */
      const first = missing[0];
      if (first !== undefined) toast.error(tasks.wizard.requirements[first]);
      return;
    }

    // Re-save the whole draft before submit. This protects a refreshed or
    // manually addressed review URL from presenting locally complete data while
    // the server still holds an older, incomplete checklist.
    const taskId = await persist({ saveAll: true });
    if (taskId === null) return;

    try {
      const submitted = await submitTask.mutateAsync();
      // No `draft.reset()` here: clearing the store before navigation re-renders
      // this wizard against an empty draft. `SubmissionConfirmedPage` clears it.
      // `replace`, so browser Back from the confirmation returns to My Tasks
      // rather than to a review step for a task that has already gone.
      void navigate(ROUTES.developer.newTaskStep('confirmed'), {
        replace: true,
        state: {
          taskId: submitted.id,
          taskCode: submitted.taskCode,
          title: submitted.title,
          reviewRound: submitted.reviewRound,
          reviewCycle: submitted.reviewRound,
        },
      });
    } catch (cause) {
      toast.error(cause instanceof ApiError ? cause.message : common.errors.generic);
    }
  }

  const unanswered = Math.max(progress.total - progress.answered, 0);

  async function runOnce(action: () => Promise<void>) {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    try {
      await action();
    } finally {
      actionInFlight.current = false;
    }
  }

  const requiredFieldsMissing =
    currentStep === 'details'
      ? (draft.customerId === '' ? 1 : 0) + (draft.crimId.trim() === '' ? 1 : 0)
      : requirementsForStep(currentStep, missing).length;

  const statusLine =
    currentStep === 'review' && missing.length === 0 ? (
      <span className="flex items-center gap-1.5 text-sm font-medium text-success">
        <CheckCircle2 className="size-4" aria-hidden="true" />
        {tasks.wizard.status.allRequirementsMet}
      </span>
    ) : currentStep === 'checklist' ? (
      draft.taskTypeIds.length === 0 ? (
        <span className="flex items-center gap-1.5 text-sm font-medium text-warning">
          <AlertCircle className="size-4" aria-hidden="true" />
          {tasks.wizard.status.selectTaskType}
        </span>
      ) : unanswered > 0 ? (
        <span className="flex items-center gap-1.5 text-sm font-medium text-warning">
          <AlertCircle className="size-4" aria-hidden="true" />
          {interpolate(
            unanswered === 1
              ? tasks.wizard.status.questionsUnanswered
              : tasks.wizard.status.questionsUnansweredPlural,
            { count: unanswered },
          )}
        </span>
      ) : progress.isComplete ? (
        <span className="flex items-center gap-1.5 text-sm font-medium text-success">
          <CheckCircle2 className="size-4" aria-hidden="true" />
          {tasks.wizard.status.allChecklistCompleted}
        </span>
      ) : null
    ) : currentStep === 'details' && requiredFieldsMissing === 0 && nextVersion.isError ? (
      <span className="flex items-center gap-1.5 text-sm font-medium text-warning">
        <AlertCircle className="size-4" aria-hidden="true" />
        Unable to determine the next version. Please try again.
      </span>
    ) : currentStep === 'details' && requiredFieldsMissing > 0 ? (
      <span className="flex items-center gap-1.5 text-sm font-medium text-warning">
        <AlertCircle className="size-4" aria-hidden="true" />
        {interpolate(
          requiredFieldsMissing === 1
            ? tasks.wizard.status.requiredRemaining
            : tasks.wizard.status.requiredRemainingPlural,
          { count: requiredFieldsMissing },
        )}
      </span>
    ) : null;

  return (
    <PageContainer className="space-y-5 pb-10">
      {/* Top Back Navigation */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          disabled={isBusy}
          onClick={handleReturnToContext}
          className="group text-ink-600 -ml-2.5 inline-flex items-center gap-2 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors hover:bg-canvas hover:text-ink-900"
        >
          <ArrowLeft
            className="size-3.5 text-ink-500 transition-transform duration-150 group-hover:-translate-x-0.5"
            aria-hidden="true"
          />
          {isEditMode ? 'Back to Task Overview' : 'Back to Dashboard'}
        </button>
      </div>

      <PageHeader
        title={isEditMode ? (tasks.wizard.editTitle ?? 'Edit Review Task') : tasks.wizard.title}
        subtitle={tasks.wizard.subtitles[currentStep]}
        icon={
          isEditMode ? (
            <Pencil className="size-6 text-white" />
          ) : (
            <FilePlus2 className="size-6 text-white" />
          )
        }
        tone="developer"
      />

      <Stepper steps={steps} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-stretch">
        <div className="h-full">
          {currentStep === 'details' ? (
            <WizardDetailsStep
              className="h-full"
              showErrors={showErrors}
              version={displayedVersion}
              versionPending={isVersionChecking}
              versionError={isVersionError}
              identityLocked={isPersistedDraft}
              title={isEditMode ? existingTask?.title : nextVersion.data?.title}
            />
          ) : null}
          {currentStep === 'checklist' ? <WizardChecklistStep /> : null}
          {currentStep === 'review' ? <WizardReviewStep /> : null}
        </div>

        <div className="h-full">
          {currentStep === 'details' ? (
            <TaskSummaryCard
              className="h-full"
              requirements={requirements}
              version={displayedVersion}
              versionPending={isVersionChecking}
              title={isEditMode ? existingTask?.title : nextVersion.data?.title}
            />
          ) : null}
          {currentStep === 'checklist' ? <ChecklistSidePanels /> : null}
          {currentStep === 'review' ? <ReviewSidePanels /> : null}
        </div>
      </div>

      {/*
        Sticky bottom action bar
      */}
      <div className="sticky bottom-4 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface/95 px-5 py-3.5 shadow-lg backdrop-blur-md">
        {/* Left Side Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {stepIndex > 0 ? (
            <Button
              variant="secondary"
              disabled={isBusy}
              leadingIcon={<ArrowLeft className="size-4" aria-hidden="true" />}
              onClick={() => {
                const previous = TASK_WIZARD_STEPS[stepIndex - 1];
                if (previous !== undefined) void navigate(getStepUrl(previous));
              }}
            >
              {tasks.wizard.backTo[stepIndex === 1 ? 'details' : 'checklist']}
            </Button>
          ) : null}

          <Button
            variant="ghost"
            disabled={isBusy}
            leadingIcon={<X className="size-4" aria-hidden="true" />}
            onClick={handleReturnToContext}
            className="hover:bg-danger-subtle text-ink-500 hover:text-danger"
          >
            {tasks.wizard.cancel}
          </Button>
        </div>

        {/* Right Side Actions */}
        <div className="flex flex-wrap items-center gap-3">
          {statusLine}

          <Button
            variant="secondary"
            leadingIcon={<Save className="size-4" aria-hidden="true" />}
            onClick={() => {
              void runOnce(handleSaveDraft);
            }}
            isLoading={isBusy}
            // Saving needs enough to create a task: the server derives the title
            // and the task code from exactly these fields.
            disabled={draft.customerId === '' || draft.crimId.trim() === '' || !versionReady}
          >
            {tasks.wizard.saveDraft}
          </Button>

          {currentStep === 'review' ? (
            <Button
              onClick={() => {
                void runOnce(handleSubmit);
              }}
              isLoading={isBusy}
              leadingIcon={<Send className="size-4" aria-hidden="true" />}
              aria-disabled={missing.length > 0}
            >
              {tasks.wizard.submit}
            </Button>
          ) : (
            <Button
              onClick={() => {
                void runOnce(handleNext);
              }}
              isLoading={isBusy}
              trailingIcon={<ArrowRight className="size-4" aria-hidden="true" />}
              aria-disabled={!canAdvance || !versionReady}
            >
              {tasks.wizard.nextTo[currentStep === 'details' ? 'checklist' : 'review']}
            </Button>
          )}
        </div>
      </div>
    </PageContainer>
  );
}
