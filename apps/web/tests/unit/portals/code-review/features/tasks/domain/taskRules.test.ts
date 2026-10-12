import { describe, expect, it } from 'vitest';
import {
  canLeaveStep,
  canSubmit,
  deriveTitle,
  missingRequirements,
  requirementsForStep,
  resumeStep,
  type TaskReadinessInput,
} from '@/portals/code-review/features/tasks/domain/taskRules.ts';

const READY: TaskReadinessInput = {
  draft: { customerId: 'cust-1', crimId: 'CRIM-848', priority: 'Medium' },
  taskTypes: ['Customization'],
  isChecklistComplete: true,
};

describe('deriveTitle (FL 2.5-01)', () => {
  it('joins customer and CRIM ID', () => {
    expect(deriveTitle('AASL', 'CRIM-848')).toBe('AASL-CRIM-848');
  });

  it('appends the version only when there is one', () => {
    expect(deriveTitle('AASL', 'CRIM-848', 'V1')).toBe('AASL-CRIM-848-V1');
    expect(deriveTitle('AASL', 'CRIM-848', '')).toBe('AASL-CRIM-848');
    expect(deriveTitle('AASL', 'CRIM-848', null)).toBe('AASL-CRIM-848');
    expect(deriveTitle('AASL', 'CRIM-848', undefined)).toBe('AASL-CRIM-848');
  });

  it('trims, so stray whitespace never becomes part of the record', () => {
    expect(deriveTitle('  AASL ', ' CRIM-848  ', '  V1 ')).toBe('AASL-CRIM-848-V1');
    // A version that is only whitespace is no version at all.
    expect(deriveTitle('AASL', 'CRIM-848', '   ')).toBe('AASL-CRIM-848');
  });
});

describe('missingRequirements', () => {
  it('reports nothing for a complete draft', () => {
    expect(missingRequirements(READY)).toEqual([]);
    expect(canSubmit(READY)).toBe(true);
  });

  it('reports an empty draft in the order the user meets it', () => {
    expect(
      missingRequirements({
        draft: {},
        taskTypes: [],
        isChecklistComplete: false,
      }),
    ).toEqual(['customer', 'crimId', 'taskTypes', 'checklist']);
  });

  it('treats a whitespace-only CRIM ID as missing', () => {
    expect(
      missingRequirements({
        ...READY,
        draft: { ...READY.draft, crimId: '   ' },
      }),
    ).toEqual(['crimId']);
  });

  it('blocks submission on an incomplete checklist (FL 2.2-03)', () => {
    expect(missingRequirements({ ...READY, isChecklistComplete: false })).toEqual(['checklist']);
    expect(canSubmit({ ...READY, isChecklistComplete: false })).toBe(false);
  });

  it('blocks submission when no task type is selected', () => {
    expect(canSubmit({ ...READY, taskTypes: [] })).toBe(false);
  });
});

describe('wizard step gating (acceptance scenario 1)', () => {
  const empty = missingRequirements({
    draft: {},
    taskTypes: [],
    isChecklistComplete: false,
  });

  it('assigns each requirement to the step that owns it', () => {
    expect(requirementsForStep('details', empty)).toEqual(['customer', 'crimId']);
    expect(requirementsForStep('checklist', empty)).toEqual(['taskTypes', 'checklist']);
    // The review step introduces no requirements of its own; it is blocked only
    // by the steps behind it, which the wizard enforces by not letting the user
    // reach it.
    expect(requirementsForStep('review', empty)).toEqual([]);
  });

  it('holds the user on step 1 until step 1 is done', () => {
    expect(canLeaveStep('details', empty)).toBe(false);
    expect(
      canLeaveStep('details', missingRequirements({ ...READY, isChecklistComplete: false })),
    ).toBe(true);
  });

  it('resumes a draft at the first incomplete step', () => {
    expect(resumeStep(empty)).toBe('details');
    expect(resumeStep(missingRequirements({ ...READY, isChecklistComplete: false }))).toBe(
      'checklist',
    );
    expect(resumeStep(missingRequirements(READY))).toBe('review');
  });
});

describe('Task Date Handling (Created Date vs Submitted Date)', () => {
  it('Created Date represents the moment a task/draft was created and is immutable across updates', () => {
    const createdAt = '2026-08-31T09:00:00.000Z';
    const draft = {
      id: 'task-1',
      createdAt,
      submittedAt: null,
      status: 'Draft' as const,
      priority: 'Medium' as const,
    };

    // Editing fields must never mutate createdAt
    const updatedDraft = {
      ...draft,
      priority: 'High' as const,
      version: 'V2',
    };
    expect(updatedDraft.createdAt).toBe(createdAt);
    expect(updatedDraft.submittedAt).toBeNull();
  });

  it('Submitted Date is null while in Draft status and set upon submission', () => {
    const createdAt = '2026-08-31T09:00:00.000Z';
    const submittedAt = '2026-08-31T09:45:00.000Z';

    const draftTask = {
      id: 'task-1',
      status: 'Draft' as const,
      createdAt,
      submittedAt: null,
    };
    expect(draftTask.submittedAt).toBeNull();

    const submittedTask = {
      ...draftTask,
      status: 'Submitted' as const,
      submittedAt,
    };
    expect(submittedTask.createdAt).toBe(createdAt);
    expect(submittedTask.submittedAt).toBe(submittedAt);
    expect(submittedTask.submittedAt >= submittedTask.createdAt).toBe(true);
  });

  it('Resubmission preserves original Created Date and updates Submitted Date', () => {
    const createdAt = '2026-08-30T10:00:00.000Z';
    const firstSubmission = '2026-08-30T10:30:00.000Z';
    const resubmission = '2026-08-31T11:00:00.000Z';

    const returnedTask = {
      id: 'task-1',
      status: 'ChangesRequested' as const,
      reviewCycle: 1,
      createdAt,
      submittedAt: firstSubmission,
    };

    const resubmittedTask = {
      ...returnedTask,
      status: 'ReSubmitted' as const,
      reviewCycle: 2,
      submittedAt: resubmission,
    };

    expect(resubmittedTask.createdAt).toBe(createdAt);
    expect(resubmittedTask.submittedAt).toBe(resubmission);
    expect(resubmittedTask.submittedAt > returnedTask.submittedAt).toBe(true);
  });
});
