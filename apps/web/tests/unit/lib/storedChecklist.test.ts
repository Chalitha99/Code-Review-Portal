import { describe, expect, it } from 'vitest';
import { groupStoredAnswers } from '@/lib/storedChecklist.ts';

describe('groupStoredAnswers — history is read from the snapshot, not the template', () => {
  const stored = [
    {
      questionId: 'q-1',
      answer: 'Yes' as const,
      questionText: 'First',
      categoryName: 'Alpha',
      order: 0,
    },
    {
      questionId: 'q-2',
      answer: 'No' as const,
      questionText: 'Second',
      categoryName: 'Alpha',
      order: 1,
    },
    {
      questionId: 'q-3',
      answer: 'NA' as const,
      questionText: 'Third',
      categoryName: 'Beta',
      order: 2,
    },
  ];

  it('groups by the category the question was asked under, in presentation order', () => {
    expect(groupStoredAnswers(stored)).toEqual([
      { categoryName: 'Alpha', answers: [stored[0], stored[1]], issueCount: 1 },
      { categoryName: 'Beta', answers: [stored[2]], issueCount: 0 },
    ]);
  });

  it('renders wording that no longer exists in the template', () => {
    // The negative control for the snapshot decision: none of these question ids
    // are in FIXTURE or in the real template, yet the record still reads back in
    // full. An admin deleting a question cannot erase a completed review.
    const groups = groupStoredAnswers(stored);
    expect(groups.flatMap((g) => g.answers.map((a) => a.questionText))).toEqual([
      'First',
      'Second',
      'Third',
    ]);
  });

  it('restores presentation order even if the answers arrive shuffled', () => {
    const shuffled = [stored[2], stored[0], stored[1]] as typeof stored;
    expect(groupStoredAnswers(shuffled).map((g) => g.categoryName)).toEqual(['Alpha', 'Beta']);
  });
});
