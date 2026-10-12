import { deriveTaskTitle, taskDraftSchema, type TaskDraft } from '@sdp/contracts';

/**
 * Rules for creating and submitting a review task.
 *
 * The wizard's step gating (screens 22–24) is a *view* of `missingRequirements`,
 * never a second list. If a rule changes here, the Next button, the "Before you
 * can continue" panel and the Submit gate all change with it — which is the
 * whole reason this module exists.
 */

/* -------------------------------------------------------------------------- */
/* Derived title — FL 2.5-01                                                   */
/* -------------------------------------------------------------------------- */

/**
 * `CustomerCode-CRIM ID-Version`, e.g. "AASL-CRIM-848-1".
 *
 * Derived, never typed: the title column in every grid has to stay parseable,
 * and a free-text title would drift from the CRIM ID it is supposed to name.
 * Inputs are trimmed because a trailing space in the CRIM field would otherwise
 * become a permanent part of the record.
 */
export const deriveTitle = deriveTaskTitle;

/* -------------------------------------------------------------------------- */
/* Requirements                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Machine-readable reasons a task is not ready.
 *
 * Codes rather than sentences: the domain layer must not depend on `content/`,
 * and the same code renders differently in the three places it appears (a field
 * error, a wizard requirement row, a disabled-button tooltip).
 */
export const TASK_REQUIREMENTS = ['customer', 'crimId', 'taskTypes', 'checklist'] as const;
export type TaskRequirement = (typeof TASK_REQUIREMENTS)[number];

export interface TaskReadinessInput {
  draft: Partial<TaskDraft>;
  /** Selected on wizard step 2; drives which checklist sections render. */
  taskTypes: readonly string[];
  /** From `checklistRules.checklistProgress().isComplete`. */
  isChecklistComplete: boolean;
}

/**
 * Everything still outstanding, in the order the user encounters it.
 *
 * Returns an array rather than a boolean so the wizard can show *which* steps
 * are blocked. `canSubmit` is derived from it, not computed separately — two
 * implementations of "ready" is exactly how the two create flows used to drift.
 */
export function missingRequirements(input: TaskReadinessInput): TaskRequirement[] {
  const missing: TaskRequirement[] = [];
  const { draft, taskTypes, isChecklistComplete } = input;

  // Reuse the shared schema for per-field validity rather than re-deriving the
  // rules; `taskDraftSchema` is the contract the API validates against too.
  const shape = taskDraftSchema.shape;

  if (!shape.customerId.safeParse(draft.customerId ?? '').success) missing.push('customer');
  if (!shape.crimId.safeParse(draft.crimId ?? '').success) missing.push('crimId');
  if (taskTypes.length === 0) missing.push('taskTypes');
  if (!isChecklistComplete) missing.push('checklist');

  return missing;
}

/** FL 2.2-03: submission is blocked until nothing is outstanding. */
export function canSubmit(input: TaskReadinessInput): boolean {
  return missingRequirements(input).length === 0;
}

/* -------------------------------------------------------------------------- */
/* Wizard steps                                                                */
/* -------------------------------------------------------------------------- */

export const TASK_WIZARD_STEPS = ['details', 'checklist', 'review'] as const;
export type TaskWizardStep = (typeof TASK_WIZARD_STEPS)[number];

/** Which requirements each step owns. Used to colour the stepper and gate Next. */
const STEP_REQUIREMENTS: Record<TaskWizardStep, readonly TaskRequirement[]> = {
  details: ['customer', 'crimId'],
  checklist: ['taskTypes', 'checklist'],
  review: [],
};

export function requirementsForStep(
  step: TaskWizardStep,
  missing: readonly TaskRequirement[],
): TaskRequirement[] {
  return missing.filter((requirement) => STEP_REQUIREMENTS[step].includes(requirement));
}

/** A step may be left only once its own requirements are met (acceptance scenario 1). */
export function canLeaveStep(step: TaskWizardStep, missing: readonly TaskRequirement[]): boolean {
  return requirementsForStep(step, missing).length === 0;
}

/**
 * Where to resume a draft: the first step still carrying an unmet requirement,
 * or the final step when the draft is complete.
 *
 * This is why a draft re-enters the wizard rather than always restarting — a
 * developer who filled in step 1 yesterday should not retype it.
 */
export function resumeStep(missing: readonly TaskRequirement[]): TaskWizardStep {
  const blocked = TASK_WIZARD_STEPS.find((step) => !canLeaveStep(step, missing));
  return blocked ?? 'review';
}
