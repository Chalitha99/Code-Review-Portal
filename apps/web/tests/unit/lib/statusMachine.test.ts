import { describe, expect, it } from 'vitest';
import { TASK_STATUSES, type Role, type TaskStatus } from '@sdp/contracts';
import {
  canAssignReviewer,
  canCancelTask,
  canDecideReview,
  canDeleteTask,
  canDiscardDraft,
  canEditDraft,
  canEditTask,
  canHandOver,
  canPickForReview,
  canPurgeTask,
  canReassignReviewer,
  canRespondToFindings,
  canSubmitForReview,
  canTransition,
  canViewTask,
  isTerminal,
  nextStatuses,
  type TaskActor,
  type TaskSubject,
} from '@/lib/statusMachine.ts';

const DEV = 'user-dev';
const REVIEWER = 'user-rev';
const OTHER_REVIEWER = 'user-rev-2';
const ADMIN = 'user-admin';

function actor(userId: string, ...roles: Role[]): TaskActor {
  return { userId, roles };
}

function task(overrides: Partial<TaskSubject> = {}): TaskSubject {
  return { status: 'Draft', developerId: DEV, reviewerId: null, ...overrides };
}

describe('transitions', () => {
  it('allows only the edges the lifecycle declares', () => {
    expect(canTransition('Draft', 'Submitted')).toBe(true);
    expect(canTransition('Draft', 'Approved')).toBe(false);
    expect(canTransition('InReview', 'ChangesRequested')).toBe(true);
    expect(canTransition('ChangesRequested', 'ReSubmitted')).toBe(true);
    expect(canTransition('InReview', 'Approved')).toBe(true);
  });

  it('treats Approved and Cancelled as terminal, and nothing else', () => {
    const terminal = TASK_STATUSES.filter(isTerminal);
    expect(terminal).toEqual(['Approved', 'Cancelled']);

    for (const status of terminal) {
      expect(nextStatuses(status)).toHaveLength(0);
    }
  });

  it('keeps Draft -> Cancelled in the contract while the admin policy excludes Draft', () => {
    const cancellable = TASK_STATUSES.filter((status) => canTransition(status, 'Cancelled'));
    // Approved is excluded: an approved task is handed to the Delivery Portal.
    expect(cancellable).toEqual([
      'Draft',
      'Submitted',
      'InReview',
      'ChangesRequested',
      'ReSubmitted',
    ]);
    // A Draft is private to its developer, who discards it instead.
    expect(canCancelTask(actor(ADMIN, 'Admin'), task({ status: 'Draft' }))).toBe(false);
  });

  it('never lets a status transition to itself', () => {
    for (const status of TASK_STATUSES) {
      expect(canTransition(status, status)).toBe(false);
    }
  });
});

describe('canEditTask', () => {
  it('permits the owning developer on Draft, but not on ChangesRequested (which is response turn only)', () => {
    expect(canEditTask(actor(DEV, 'Developer'), task({ status: 'Draft' }))).toBe(true);
    expect(canEditTask(actor(DEV, 'Developer'), task({ status: 'ChangesRequested' }))).toBe(false);
  });

  it('refuses once the task is with a reviewer', () => {
    expect(canEditTask(actor(DEV, 'Developer'), task({ status: 'Submitted' }))).toBe(false);
    expect(canEditTask(actor(DEV, 'Developer'), task({ status: 'InReview' }))).toBe(false);
    expect(canEditTask(actor(DEV, 'Developer'), task({ status: 'Approved' }))).toBe(false);
  });

  it('refuses another developer, even an admin', () => {
    expect(canEditTask(actor(ADMIN, 'Admin', 'Developer'), task())).toBe(false);
  });
});

describe('canSubmitForReview', () => {
  it('covers both the first submission and a resubmission', () => {
    expect(canSubmitForReview(actor(DEV, 'Developer'), task({ status: 'Draft' }))).toBe(true);
    expect(canSubmitForReview(actor(DEV, 'Developer'), task({ status: 'ChangesRequested' }))).toBe(
      true,
    );
  });

  it('refuses a non-owner and an already-submitted task', () => {
    expect(canSubmitForReview(actor(REVIEWER, 'Developer'), task())).toBe(false);
    expect(canSubmitForReview(actor(DEV, 'Developer'), task({ status: 'Submitted' }))).toBe(false);
  });
});

describe('canPickForReview', () => {
  const submitted = task({ status: 'Submitted' });

  it('permits a reviewer who did not submit the task', () => {
    expect(canPickForReview(actor(REVIEWER, 'Reviewer'), submitted)).toBe(true);
  });

  it('blocks self-review even when the user holds the Reviewer role', () => {
    expect(canPickForReview(actor(DEV, 'Developer', 'Reviewer'), submitted)).toBe(false);
  });

  it('blocks a task another reviewer already holds', () => {
    expect(
      canPickForReview(actor(REVIEWER, 'Reviewer'), { ...submitted, reviewerId: OTHER_REVIEWER }),
    ).toBe(false);
  });

  it('blocks a user without the Reviewer role', () => {
    expect(canPickForReview(actor(REVIEWER, 'Developer'), submitted)).toBe(false);
  });

  it('accepts a re-submitted task back into the queue', () => {
    expect(canPickForReview(actor(REVIEWER, 'Reviewer'), task({ status: 'ReSubmitted' }))).toBe(
      true,
    );
  });
});

describe('canDecideReview and canHandOver', () => {
  const inReview = task({ status: 'InReview', reviewerId: REVIEWER });

  it('permits only the assigned reviewer', () => {
    expect(canDecideReview(actor(REVIEWER, 'Reviewer'), inReview)).toBe(true);
    expect(canDecideReview(actor(OTHER_REVIEWER, 'Reviewer'), inReview)).toBe(false);
  });

  it('refuses once the review is decided', () => {
    expect(canDecideReview(actor(REVIEWER, 'Reviewer'), { ...inReview, status: 'Approved' })).toBe(
      false,
    );
  });

  it('gates handover the same way as a decision', () => {
    expect(canHandOver(actor(REVIEWER, 'Reviewer'), inReview)).toBe(true);
    expect(canHandOver(actor(OTHER_REVIEWER, 'Reviewer'), inReview)).toBe(false);
  });
});

describe('canCancelTask', () => {
  it('requires the Admin role', () => {
    expect(canCancelTask(actor(ADMIN, 'Admin'), task({ status: 'InReview' }))).toBe(true);
    expect(canCancelTask(actor(DEV, 'Developer', 'Reviewer'), task({ status: 'InReview' }))).toBe(
      false,
    );
  });

  it('refuses a terminal task', () => {
    for (const status of ['Approved', 'Cancelled'] satisfies TaskStatus[]) {
      expect(canCancelTask(actor(ADMIN, 'Admin'), task({ status }))).toBe(false);
    }
  });
});

describe('canDeleteTask', () => {
  it('requires the SuperAdmin role', () => {
    expect(canDeleteTask(actor(ADMIN, 'Admin'), task({ status: 'Draft' }))).toBe(false);
    expect(canDeleteTask(actor(ADMIN, 'Admin', 'SuperAdmin'), task({ status: 'Draft' }))).toBe(
      true,
    );
    expect(canDeleteTask(actor(DEV, 'Developer', 'Reviewer'), task({ status: 'Draft' }))).toBe(
      false,
    );
  });

  /**
   * The distinction that matters: cancel is broad, delete is narrow. Anything
   * that has been through review is countable history, and Reports counts it.
   */
  it('is narrower than cancel — only Draft and Cancelled may be destroyed', () => {
    const deletable: TaskStatus[] = ['Draft', 'Cancelled'];
    const admin = actor(ADMIN, 'Admin', 'SuperAdmin');

    for (const status of TASK_STATUSES) {
      expect(canDeleteTask(admin, task({ status }))).toBe(deletable.includes(status));
    }

    // And every status that is cancellable but not Draft is explicitly NOT
    // deletable, which is the property a future refactor would break silently.
    for (const status of TASK_STATUSES) {
      if (status !== 'Draft' && canCancelTask(admin, task({ status }))) {
        expect(canDeleteTask(admin, task({ status }))).toBe(false);
      }
    }
  });
});

describe('canAssignReviewer', () => {
  it('requires the Admin role', () => {
    expect(canAssignReviewer(actor(ADMIN, 'Admin'), task({ status: 'Submitted' }))).toBe(true);
    expect(
      canAssignReviewer(actor(REVIEWER, 'Developer', 'Reviewer'), task({ status: 'Submitted' })),
    ).toBe(false);
  });

  it('permits initial assignment only on Submitted and ReSubmitted when unassigned', () => {
    expect(canAssignReviewer(actor(ADMIN, 'Admin'), task({ status: 'Submitted' }))).toBe(true);
    expect(canAssignReviewer(actor(ADMIN, 'Admin'), task({ status: 'ReSubmitted' }))).toBe(true);
    expect(canAssignReviewer(actor(ADMIN, 'Admin'), task({ status: 'Draft' }))).toBe(false);
    expect(canAssignReviewer(actor(ADMIN, 'Admin'), task({ status: 'ChangesRequested' }))).toBe(
      false,
    );
    expect(canAssignReviewer(actor(ADMIN, 'Admin'), task({ status: 'Approved' }))).toBe(false);
    expect(canAssignReviewer(actor(ADMIN, 'Admin'), task({ status: 'Cancelled' }))).toBe(false);
  });

  it('blocks generic assign if the task is already assigned or handed over', () => {
    expect(
      canAssignReviewer(
        actor(ADMIN, 'Admin'),
        task({ status: 'Submitted', reviewerId: OTHER_REVIEWER }),
      ),
    ).toBe(false);
    expect(
      canAssignReviewer(actor(ADMIN, 'Admin'), task({ status: 'Submitted', isHandedOver: true })),
    ).toBe(false);
  });
});

describe('canReassignReviewer', () => {
  it('permits Admin reassignment on InReview task with existing reviewer and not handed over', () => {
    expect(
      canReassignReviewer(
        actor(ADMIN, 'Admin'),
        task({ status: 'InReview', reviewerId: OTHER_REVIEWER }),
      ),
    ).toBe(true);
    expect(
      canReassignReviewer(actor(ADMIN, 'Admin'), task({ status: 'InReview', reviewerId: null })),
    ).toBe(false);
    expect(
      canReassignReviewer(
        actor(ADMIN, 'Admin'),
        task({ status: 'InReview', reviewerId: OTHER_REVIEWER, isHandedOver: true }),
      ),
    ).toBe(false);
    expect(
      canReassignReviewer(
        actor(REVIEWER, 'Reviewer'),
        task({ status: 'InReview', reviewerId: OTHER_REVIEWER }),
      ),
    ).toBe(false);
  });
});

describe('canViewTask', () => {
  it('makes Draft developer-private (visible only to owning developer with Developer role)', () => {
    const draft = task({ status: 'Draft', developerId: DEV });
    expect(canViewTask(actor(DEV, 'Developer'), draft)).toBe(true);
    expect(canViewTask(actor('other-dev', 'Developer'), draft)).toBe(false);
    expect(canViewTask(actor(ADMIN, 'Admin'), draft)).toBe(false);
    expect(canViewTask(actor(REVIEWER, 'Reviewer'), draft)).toBe(false);
  });

  it('allows Admin and owning Developer to view non-Draft tasks', () => {
    const submitted = task({ status: 'Submitted', developerId: DEV });
    expect(canViewTask(actor(ADMIN, 'Admin'), submitted)).toBe(true);
    expect(canViewTask(actor(DEV, 'Developer'), submitted)).toBe(true);
  });

  it('allows Reviewer to view available, assigned, or historical tasks', () => {
    const available = task({ status: 'Submitted', developerId: DEV, reviewerId: null });
    expect(canViewTask(actor(REVIEWER, 'Reviewer'), available)).toBe(true);
    // Reviewer without Developer role cannot view own submission in available queue
    expect(canViewTask(actor(DEV, 'Reviewer'), available)).toBe(false);

    const assigned = task({ status: 'InReview', developerId: DEV, reviewerId: REVIEWER });
    expect(canViewTask(actor(REVIEWER, 'Reviewer'), assigned)).toBe(true);
    expect(canViewTask(actor(OTHER_REVIEWER, 'Reviewer'), assigned)).toBe(false);

    const historical = task({ status: 'Approved', developerId: DEV, reviewerId: OTHER_REVIEWER });
    expect(
      canViewTask(actor(REVIEWER, 'Reviewer'), historical, { hasHistoricalReview: true }),
    ).toBe(true);
    expect(
      canViewTask(actor(REVIEWER, 'Reviewer'), historical, { hasHistoricalReview: false }),
    ).toBe(false);
  });
});

describe('canDiscardDraft', () => {
  it('allows owning developer to discard Draft if no workflow evidence exists', () => {
    const draft = task({ status: 'Draft', developerId: DEV });
    expect(canDiscardDraft(actor(DEV, 'Developer'), draft)).toBe(true);
    expect(canDiscardDraft(actor(ADMIN, 'Admin'), draft)).toBe(false);
    expect(canDiscardDraft(actor('other-dev', 'Developer'), draft)).toBe(false);
  });

  it('blocks discard if task is not Draft or has submitted snapshots', () => {
    expect(canDiscardDraft(actor(DEV, 'Developer'), task({ status: 'Submitted' }))).toBe(false);
    expect(
      canDiscardDraft(actor(DEV, 'Developer'), task({ status: 'Draft' }), {
        hasSubmittedSnapshot: true,
      }),
    ).toBe(false);
  });
});

describe('canRespondToFindings', () => {
  it('is open to the owning developer only while changes are requested', () => {
    expect(
      canRespondToFindings(actor(DEV, 'Developer'), task({ status: 'ChangesRequested' })),
    ).toBe(true);
    expect(canRespondToFindings(actor(DEV, 'Developer'), task({ status: 'InReview' }))).toBe(false);
    expect(
      canRespondToFindings(actor(REVIEWER, 'Developer'), task({ status: 'ChangesRequested' })),
    ).toBe(false);
  });
});

describe('canEditDraft', () => {
  it('allows owning developer with Developer role to edit Draft only', () => {
    const draft = task({ status: 'Draft', developerId: DEV });
    expect(canEditDraft(actor(DEV, 'Developer'), draft)).toBe(true);
    expect(canEditDraft(actor(DEV, 'Reviewer'), draft)).toBe(false);
    expect(canEditDraft(actor('other-dev', 'Developer'), draft)).toBe(false);
    expect(
      canEditDraft(actor(DEV, 'Developer'), task({ status: 'Submitted', developerId: DEV })),
    ).toBe(false);
  });
});

describe('canPurgeTask', () => {
  it('allows SuperAdmin to purge Draft or Cancelled task with zero evidence', () => {
    const draft = task({ status: 'Draft' });
    const cancelled = task({ status: 'Cancelled' });
    expect(canPurgeTask(actor(ADMIN, 'SuperAdmin'), draft, {})).toBe(true);
    expect(canPurgeTask(actor(ADMIN, 'SuperAdmin'), cancelled, {})).toBe(true);
    expect(canPurgeTask(actor(ADMIN, 'Admin'), draft, {})).toBe(false);
    expect(canPurgeTask(actor(DEV, 'Developer'), draft, {})).toBe(false);
  });

  it('blocks SuperAdmin purge if workflow evidence exists', () => {
    const cancelled = task({ status: 'Cancelled' });
    expect(
      canPurgeTask(actor(ADMIN, 'SuperAdmin'), cancelled, { hasSubmittedSnapshot: true }),
    ).toBe(false);
    expect(canPurgeTask(actor(ADMIN, 'SuperAdmin'), cancelled, { hasReviews: true })).toBe(false);
  });
});
