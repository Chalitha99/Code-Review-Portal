import { describe, expect, it } from 'vitest';
import { checklistCategorySchema, type ChecklistCategory } from '@sdp/contracts';
import rawTemplate from '@tests/support/fixtures/data/checklistTemplate.json';
import {
  answersComplete,
  checklistProgress,
  issueCount,
  orphanedAnswers,
  visibleCategories,
  visibleQuestions,
} from '@/portals/code-review/features/tasks/domain/checklistRules.ts';

/**
 * Two suites here, doing different jobs.
 *
 * The first runs against the REAL seeded template and asserts the exact question
 * counts the business supplied. Those numbers are an external oracle: if the
 * seed drifts from the specification, this fails and names the task type.
 *
 * The second uses a small synthetic fixture to exercise the engine's edges
 * without depending on the real content, so re-wording a question cannot break
 * a test about, say, empty categories.
 */

const TEMPLATE: ChecklistCategory[] = checklistCategorySchema.array().parse(rawTemplate);

const CUSTOMIZATION = 'tt-customization';
const CONFIGURATION = 'tt-configuration';
const LOBBY = 'tt-lobby';
const QUICK_REPORT = 'tt-quick-report';
const UPGRADE_SERVICE = 'tt-upgrade-service';

describe('the seeded checklist matches the specification', () => {
  it.each([
    [
      CUSTOMIZATION,
      23,
      ['Reservation', 'Code', 'Security', 'Translations', 'Unit Testing', 'Completion'],
    ],
    [CONFIGURATION, 8, ['Configurations', 'Unit Testing', 'Completion']],
    [LOBBY, 8, ['Configurations', 'Unit Testing', 'Completion']],
    [QUICK_REPORT, 9, ['Quick Reports', 'Unit Testing', 'Completion']],
    [UPGRADE_SERVICE, 10, ['Upgrade Quality', 'Unit Testing', 'Completion']],
  ])('%s renders %i questions in the right categories', (taskTypeId, count, categoryNames) => {
    expect(visibleQuestions(TEMPLATE, [taskTypeId])).toHaveLength(count);
    expect(visibleCategories(TEMPLATE, [taskTypeId]).map((c) => c.name)).toEqual(categoryNames);
  });

  it('unions without double-counting the shared categories', () => {
    // Customization 23 + Quick Reports 2 = 25. Unit Testing and Completion are
    // shared, so they must be counted once, not twice.
    expect(visibleQuestions(TEMPLATE, [CUSTOMIZATION, QUICK_REPORT])).toHaveLength(25);
  });

  it('holds 29 distinct questions across all five task types', () => {
    const all = visibleQuestions(TEMPLATE, [
      CUSTOMIZATION,
      CONFIGURATION,
      LOBBY,
      QUICK_REPORT,
      UPGRADE_SERVICE,
    ]);
    expect(all).toHaveLength(29);
    expect(new Set(all.map((q) => q.id)).size).toBe(29);
  });

  it('gives Configuration and Lobby identical checklists', () => {
    const configuration = visibleQuestions(TEMPLATE, [CONFIGURATION]).map((q) => q.id);
    const lobby = visibleQuestions(TEMPLATE, [LOBBY]).map((q) => q.id);
    expect(configuration).toEqual(lobby);
  });

  it('stores each shared question once rather than per task type', () => {
    // Applicability lives on the category, so a shared category's questions are
    // stored once and a wording fix is a single edit.
    const unitTesting = TEMPLATE.find((c) => c.name === 'Unit Testing');
    expect(unitTesting?.questions).toHaveLength(4);
    expect(unitTesting?.applicableTaskTypeIds).toHaveLength(5);
  });
});

/* -------------------------------------------------------------------------- */
/* Engine behaviour, on a synthetic fixture                                    */
/* -------------------------------------------------------------------------- */

const A = 'tt-a';
const B = 'tt-b';

const FIXTURE: ChecklistCategory[] = [
  {
    id: 'cat-shared',
    name: 'Shared',
    order: 10,
    isActive: true,
    applicableTaskTypeIds: [A, B],
    questions: [
      { id: 'q-s1', categoryId: 'cat-shared', text: 'Shared 1', order: 10, isActive: true },
    ],
  },
  {
    id: 'cat-a-only',
    name: 'A only',
    order: 20,
    isActive: true,
    applicableTaskTypeIds: [A],
    questions: [
      { id: 'q-a1', categoryId: 'cat-a-only', text: 'A 1', order: 10, isActive: true },
      { id: 'q-a2', categoryId: 'cat-a-only', text: 'A 2', order: 20, isActive: true },
    ],
  },
  {
    id: 'cat-retired',
    name: 'Retired',
    order: 30,
    isActive: false,
    applicableTaskTypeIds: [A],
    questions: [
      { id: 'q-r1', categoryId: 'cat-retired', text: 'Retired 1', order: 10, isActive: true },
    ],
  },
  {
    id: 'cat-mixed',
    name: 'Mixed',
    order: 40,
    isActive: true,
    applicableTaskTypeIds: [A],
    questions: [
      { id: 'q-m1', categoryId: 'cat-mixed', text: 'Live', order: 10, isActive: true },
      { id: 'q-m2', categoryId: 'cat-mixed', text: 'Retired', order: 20, isActive: false },
    ],
  },
];

function answers(...entries: [string, 'Yes' | 'No' | 'NA'][]) {
  return entries.map(([questionId, answer]) => ({ questionId, answer }));
}

describe('visibleCategories', () => {
  it('drops a category whose questions do not apply, rather than showing it empty', () => {
    expect(visibleCategories(FIXTURE, [B]).map((c) => c.name)).toEqual(['Shared']);
  });

  it('drops an inactive category and inactive questions inside a live one', () => {
    const visible = visibleCategories(FIXTURE, [A]);
    expect(visible.map((c) => c.name)).toEqual(['Shared', 'A only', 'Mixed']);
    expect(visible.find((c) => c.name === 'Mixed')?.questions.map((q) => q.id)).toEqual(['q-m1']);
  });

  it('returns nothing when no task type is selected, rather than everything', () => {
    expect(visibleCategories(FIXTURE, [])).toEqual([]);
    expect(visibleQuestions(FIXTURE, [])).toEqual([]);
  });

  it('does not mutate the template', () => {
    const before = JSON.stringify(FIXTURE);
    visibleCategories(FIXTURE, [A]);
    expect(JSON.stringify(FIXTURE)).toBe(before);
  });
});

describe('checklistProgress', () => {
  it('counts per category and overall', () => {
    const progress = checklistProgress(FIXTURE, [A], answers(['q-s1', 'Yes'], ['q-a1', 'No']));

    expect(progress.total).toBe(4);
    expect(progress.answered).toBe(2);
    expect(progress.isComplete).toBe(false);
    expect(progress.categories).toEqual([
      {
        categoryId: 'cat-shared',
        categoryName: 'Shared',
        answered: 1,
        total: 1,
        isComplete: true,
      },
      {
        categoryId: 'cat-a-only',
        categoryName: 'A only',
        answered: 1,
        total: 2,
        isComplete: false,
      },
      {
        categoryId: 'cat-mixed',
        categoryName: 'Mixed',
        answered: 0,
        total: 1,
        isComplete: false,
      },
    ]);
  });

  it('is complete once every visible question is answered', () => {
    const filled = answers(['q-s1', 'Yes'], ['q-a1', 'Yes'], ['q-a2', 'NA'], ['q-m1', 'Yes']);
    expect(answersComplete(FIXTURE, [A], filled)).toBe(true);
  });

  it('is NOT complete when nothing is visible', () => {
    // Regression guard: `0 answered === 0 total` must not read as complete, or a
    // task with no task types would pass the submit gate with an empty checklist.
    expect(checklistProgress(FIXTURE, [], []).isComplete).toBe(false);
  });

  it('ignores answers to questions the current task types do not render', () => {
    const stale = answers(['q-s1', 'Yes'], ['q-a1', 'Yes'], ['q-a2', 'Yes'], ['q-m1', 'Yes']);
    const progress = checklistProgress(FIXTURE, [B], stale);

    expect(progress.total).toBe(1);
    expect(progress.answered).toBe(1);
    expect(progress.isComplete).toBe(true);
  });

  it('does not count an answer to a retired question', () => {
    const progress = checklistProgress(FIXTURE, [A], answers(['q-m2', 'Yes']));
    expect(progress.answered).toBe(0);
  });

  it('does not let an invalid runtime answer satisfy the completion gate', () => {
    const malformed = [
      { questionId: 'q-s1', answer: 'Maybe' },
      { questionId: 'q-a1', answer: '' },
      { questionId: 'q-a2', answer: 'Yes' },
      { questionId: 'q-m1', answer: 'No' },
    ];
    const progress = checklistProgress(FIXTURE, [A], malformed);

    expect(progress.answered).toBe(2);
    expect(progress.isComplete).toBe(false);
  });
});

describe('issueCount', () => {
  it('counts "No" only — "N/A" means the question does not apply', () => {
    expect(issueCount(FIXTURE, [A], answers(['q-s1', 'No'], ['q-a1', 'NA'], ['q-a2', 'Yes']))).toBe(
      1,
    );
  });

  it('does not count a "No" hidden by the current task types', () => {
    expect(issueCount(FIXTURE, [B], answers(['q-a1', 'No']))).toBe(0);
  });
});

describe('orphanedAnswers', () => {
  it('names the answers a save should drop', () => {
    expect(orphanedAnswers(FIXTURE, [B], answers(['q-s1', 'Yes'], ['q-a1', 'No']))).toEqual([
      { questionId: 'q-a1', answer: 'No' },
    ]);
  });

  it('is empty when every answer still applies', () => {
    expect(orphanedAnswers(FIXTURE, [A], answers(['q-a1', 'Yes']))).toEqual([]);
  });
});
