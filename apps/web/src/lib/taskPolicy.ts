import {
  TASK_STATUS_TRANSITIONS,
  TERMINAL_TASK_STATUSES,
  type Role,
  type TaskStatus,
} from '@sdp/contracts';

/**
 * Task Actor: the user attempting an action, with their ID and set of assigned roles.
 */
export interface TaskActor {
  userId: string;
  roles: readonly Role[];
}

/**
 * Task Subject: the task on which an action is being evaluated.
 */
export interface TaskSubject {
  id?: string;
  status: TaskStatus;
  developerId: string;
  reviewerId: string | null;
  isHandedOver?: boolean | undefined;
}

/**
 * Purge Evidence Flags: audit indicators representing workflow history or submitted evidence.
 * If ANY of these flags is true, permanent purge is blocked to preserve workflow integrity.
 */
export interface PurgeEvidenceFlags {
  hasSubmittedSnapshot?: boolean;
  hasReviews?: boolean;
  hasReviewComments?: boolean;
  hasReviewScreenshots?: boolean;
  hasIssueResponses?: boolean;
  hasAdjudication?: boolean;
  hasHandoverHistory?: boolean;
  hasReviewSessions?: boolean;
  hasWorkflowEvents?: boolean;
}

function hasRole(actor: TaskActor, role: Role): boolean {
  return actor.roles.includes(role);
}

/**
 * Checks whether a task status is terminal (Approved or Cancelled).
 */
export function isTerminalTask(status: TaskStatus): boolean {
  return (TERMINAL_TASK_STATUSES as readonly TaskStatus[]).includes(status);
}

/**
 * Legal next statuses from the current status.
 */
export function nextStatuses(from: TaskStatus): readonly TaskStatus[] {
  return TASK_STATUS_TRANSITIONS[from];
}

/**
 * Whether a direct transition from `from` to `to` is declared in the lifecycle machine.
 */
export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return TASK_STATUS_TRANSITIONS[from].includes(to);
}

/**
 * Task Visibility Policy:
 *
 * 1. Draft = Developer-private work:
 *    - Visible ONLY to the owning developer holding the Developer role.
 *    - Hidden from other developers, Reviewers, and normal Admins.
 * 2. Non-Draft operational tasks:
 *    - Visible to Admins and SuperAdmins.
 *    - Visible to the owning developer holding the Developer role.
 *    - Visible to Reviewers if:
 *      a) Currently assigned to that Reviewer (InReview).
 *      b) Available in the queue (Submitted/ReSubmitted, unassigned, not own, not handed over).
 *      c) Part of that Reviewer's decided review history.
 */
export function canViewTask(
  actor: TaskActor,
  task: TaskSubject,
  context?: { hasHistoricalReview?: boolean },
): boolean {
  // 1. Draft: strictly developer-private
  if (task.status === 'Draft') {
    return hasRole(actor, 'Developer') && actor.userId === task.developerId;
  }

  // 2. Admin & SuperAdmin can view all non-Draft operational tasks
  if (hasRole(actor, 'Admin') || hasRole(actor, 'SuperAdmin')) {
    return true;
  }

  // 3. Owning developer can view their own non-Draft tasks
  if (hasRole(actor, 'Developer') && actor.userId === task.developerId) {
    return true;
  }

  // 4. Reviewer visibility rules
  if (hasRole(actor, 'Reviewer')) {
    // Current assignment
    if (task.status === 'InReview' && task.reviewerId === actor.userId) {
      return true;
    }
    // Available queue eligibility
    if (
      task.reviewerId === null &&
      task.developerId !== actor.userId &&
      !task.isHandedOver &&
      (task.status === 'Submitted' || task.status === 'ReSubmitted')
    ) {
      return true;
    }
    // Decided review history
    if (context?.hasHistoricalReview) {
      return true;
    }
  }

  return false;
}

/**
 * Edit Draft Policy:
 * Only the owning developer holding the Developer role may edit private draft tasks.
 */
export function canEditDraft(actor: TaskActor, task: TaskSubject): boolean {
  if (!hasRole(actor, 'Developer')) return false;
  if (actor.userId !== task.developerId) return false;
  return task.status === 'Draft';
}

/**
 * Discard Draft Policy:
 * Owning developer can discard their private working draft if it has never entered
 * submitted/review workflow.
 */
export function canDiscardDraft(
  actor: TaskActor,
  task: TaskSubject,
  evidenceFlags?: PurgeEvidenceFlags,
): boolean {
  if (!hasRole(actor, 'Developer')) return false;
  if (actor.userId !== task.developerId) return false;
  if (task.status !== 'Draft') return false;

  if (evidenceFlags?.hasSubmittedSnapshot || evidenceFlags?.hasReviews) {
    return false;
  }

  return true;
}

/**
 * Submit Task Policy:
 * Covers first-time submission (Draft -> Submitted) and re-submission
 * (ChangesRequested -> ReSubmitted). Only open to the owning developer.
 */
export function canSubmitTask(actor: TaskActor, task: TaskSubject): boolean {
  if (!hasRole(actor, 'Developer')) return false;
  if (actor.userId !== task.developerId) return false;
  return task.status === 'Draft' || task.status === 'ChangesRequested';
}

/**
 * Reviewer Pick Policy:
 * Reviewer can pick up an unassigned Submitted or ReSubmitted task that is not
 * their own and not currently handed over.
 */
export function canPickTask(actor: TaskActor, task: TaskSubject): boolean {
  if (!hasRole(actor, 'Reviewer')) return false;
  if (actor.userId === task.developerId) return false;
  if (task.reviewerId !== null) return false;
  if (task.isHandedOver) return false;
  return task.status === 'Submitted' || task.status === 'ReSubmitted';
}

/**
 * Admin Initial Reviewer Assignment Policy:
 * Admin may assign an initial reviewer only when:
 * - actor has Admin role
 * - task status is Submitted or ReSubmitted
 * - task is not handed over (pending handovers require the dedicated handover resolution flow)
 * - task is currently unassigned (task.reviewerId === null)
 */
export function canAssignReviewer(actor: TaskActor, task: TaskSubject): boolean {
  if (!hasRole(actor, 'Admin')) return false;
  if (task.isHandedOver) return false;
  if (task.reviewerId !== null) return false;
  return task.status === 'Submitted' || task.status === 'ReSubmitted';
}

/**
 * Admin Reviewer Reassignment Policy:
 * Admin may reassign an InReview task to another reviewer.
 * - actor has Admin role
 * - task status is InReview
 * - task is not handed over
 * - task already has an assigned reviewer
 */
export function canReassignReviewer(actor: TaskActor, task: TaskSubject): boolean {
  if (!hasRole(actor, 'Admin')) return false;
  if (task.isHandedOver) return false;
  if (task.status !== 'InReview') return false;
  return task.reviewerId !== null;
}

/**
 * Request Changes Policy:
 * Only the currently assigned reviewer on an InReview, non-handed-over task may request changes.
 */
export function canRequestChanges(actor: TaskActor, task: TaskSubject): boolean {
  if (!hasRole(actor, 'Reviewer')) return false;
  if (task.reviewerId !== actor.userId) return false;
  if (task.status !== 'InReview') return false;
  if (task.isHandedOver) return false;
  return true;
}

/**
 * Approve Review Policy:
 * Only the currently assigned reviewer on an InReview, non-handed-over task may approve.
 */
export function canApprove(actor: TaskActor, task: TaskSubject): boolean {
  return canRequestChanges(actor, task);
}

/**
 * Reviewer Handover Policy:
 * The assigned reviewer on an InReview task may hand it over if not already handed over.
 */
export function canHandover(actor: TaskActor, task: TaskSubject): boolean {
  if (task.isHandedOver) return false;
  return canRequestChanges(actor, task);
}

/**
 * Admin Cancellation Policy:
 * Admin may cancel an active workflow task (Submitted, ReSubmitted, InReview, ChangesRequested).
 * Draft cannot be cancelled by Admin (Developer may discard).
 * Approved and Cancelled remain terminal.
 */
export function canCancelTask(actor: TaskActor, task: TaskSubject): boolean {
  if (!hasRole(actor, 'Admin')) return false;
  return (
    task.status === 'Submitted' ||
    task.status === 'ReSubmitted' ||
    task.status === 'InReview' ||
    task.status === 'ChangesRequested'
  );
}

/**
 * Super Admin Purge Policy:
 * Exceptional permanent removal by Super Admin.
 * Permitted ONLY for Draft or legacy Cancelled tasks that contain NO immutable
 * submitted/review evidence.
 */
export function canPurgeTask(
  actor: TaskActor,
  task: TaskSubject,
  evidenceFlags?: PurgeEvidenceFlags,
): boolean {
  if (!hasRole(actor, 'SuperAdmin')) return false;
  if (task.status !== 'Draft' && task.status !== 'Cancelled') return false;

  if (evidenceFlags) {
    if (
      evidenceFlags.hasSubmittedSnapshot ||
      evidenceFlags.hasReviews ||
      evidenceFlags.hasReviewComments ||
      evidenceFlags.hasReviewScreenshots ||
      evidenceFlags.hasIssueResponses ||
      evidenceFlags.hasAdjudication ||
      evidenceFlags.hasHandoverHistory ||
      evidenceFlags.hasReviewSessions ||
      evidenceFlags.hasWorkflowEvents
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Respond to Findings Policy:
 * Developer response turn during ChangesRequested.
 */
export function canRespondToFindings(actor: TaskActor, task: TaskSubject): boolean {
  if (!hasRole(actor, 'Developer')) return false;
  return actor.userId === task.developerId && task.status === 'ChangesRequested';
}
