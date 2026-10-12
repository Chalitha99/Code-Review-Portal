/**
 * The task lifecycle and status policy module.
 *
 * Centralized in `taskPolicy.ts` and re-exported here for full backward compatibility.
 */
export * from './taskPolicy.ts';

import {
  canEditDraft,
  canSubmitTask,
  canPickTask,
  canRequestChanges,
  canPurgeTask,
  canHandover as policyCanHandover,
  isTerminalTask,
  type TaskActor,
  type TaskSubject,
  type PurgeEvidenceFlags,
} from './taskPolicy.ts';

/**
 * Backward compatibility alias: Draft editing is restricted to Drafts.
 */
export function canEditTask(actor: TaskActor, task: TaskSubject): boolean {
  return canEditDraft(actor, task);
}

/**
 * Backward compatibility alias: Submitting a task covers first submission and resubmission.
 */
export function canSubmitForReview(actor: TaskActor, task: TaskSubject): boolean {
  return canSubmitTask(actor, task);
}

/**
 * Backward compatibility alias: Picking a task for review.
 */
export function canPickForReview(actor: TaskActor, task: TaskSubject): boolean {
  return canPickTask(actor, task);
}

/**
 * Backward compatibility alias: Deciding a review turn.
 */
export function canDecideReview(actor: TaskActor, task: TaskSubject): boolean {
  return canRequestChanges(actor, task);
}

/**
 * Backward compatibility alias: Reviewer handover.
 */
export function canHandOver(actor: TaskActor, task: TaskSubject): boolean {
  return policyCanHandover(actor, task);
}

/**
 * Backward compatibility alias: Super Admin purge.
 */
export function canDeleteTask(
  actor: TaskActor,
  task: TaskSubject,
  evidenceFlags?: PurgeEvidenceFlags,
): boolean {
  return canPurgeTask(actor, task, evidenceFlags);
}

/**
 * Backward compatibility alias: Checks terminal task status.
 */
export function isTerminal(status: Parameters<typeof isTerminalTask>[0]): boolean {
  return isTerminalTask(status);
}
