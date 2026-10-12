import { describe, expect, it } from 'vitest';
import type { ChecklistQuestion, TaskTypeRecord } from '@sdp/contracts';
import {
  moveRecordId,
  nextQuestionOrder,
  questionAtOrder,
  resequenceAfterRemoval,
  resequenceRecords,
  shiftOrdersFrom,
} from '@/lib/checklistOrdering.ts';

/**
 * The arithmetic behind "order 3 is taken — keep both, or replace?".
 *
 * Asserted here rather than through the handler because the failure mode is a
 * sequence, not a status code: an off-by-one leaves a gap or a duplicate that
 * nothing rejects, renders in the admin grid looking plausible, and only shows
 * up as questions appearing in the wrong order on a developer's checklist weeks
 * later.
 */

function question(order: number, id = `q-${String(order)}`): ChecklistQuestion {
  return {
    id,
    categoryId: 'cat-unit-testing',
    text: `Question ${String(order)}`,
    order,
    isActive: true,
  };
}

const ORDERS = (questions: readonly ChecklistQuestion[]) => questions.map((entry) => entry.order);

describe('nextQuestionOrder', () => {
  it('appends after the highest in use', () => {
    expect(nextQuestionOrder([question(1), question(2), question(5)])).toBe(6);
  });

  it('starts an empty category at 1, not 0', () => {
    // The seed data and the admin grid both show 1-based orders. Seeding the
    // reduce at 0 and returning it unchanged would put the first question of a
    // new category at 0 and every later one at 1+.
    expect(nextQuestionOrder([])).toBe(1);
  });

  it('ignores position in the array and reads the highest value', () => {
    // The store does not keep questions sorted — `sortedTemplate` sorts on read
    // — so taking the last element's order would append into an occupied slot.
    expect(nextQuestionOrder([question(9), question(2), question(4)])).toBe(10);
  });
});

describe('questionAtOrder', () => {
  const questions = [question(1), question(2), question(3)];

  it('finds the occupant of a taken slot', () => {
    expect(questionAtOrder(questions, 2)?.id).toBe('q-2');
  });

  it('returns undefined for a free slot', () => {
    expect(questionAtOrder(questions, 4)).toBeUndefined();
  });

  it('returns the first of an existing duplicate pair', () => {
    // Duplicates should not exist, but categories predating this rule may hold
    // them. Picking the first is what makes a repeated shift converge instead of
    // alternating between the two rows.
    const withDuplicate = [question(3, 'q-old'), question(3, 'q-new')];
    expect(questionAtOrder(withDuplicate, 3)?.id).toBe('q-old');
  });
});

describe('shiftOrdersFrom', () => {
  it('opens the requested slot and leaves no gap', () => {
    // The worked example from the requirement: 1,2,3,4,5 with a new question at
    // 3 must end as 1,2,[new 3],4,5,6.
    const shifted = shiftOrdersFrom(
      [1, 2, 3, 4, 5].map((n) => question(n)),
      3,
    );
    expect(ORDERS(shifted)).toEqual([1, 2, 4, 5, 6]);
  });

  it('leaves everything before the requested order alone', () => {
    const shifted = shiftOrdersFrom(
      [1, 2, 3].map((n) => question(n)),
      3,
    );
    expect(shifted[0]).toEqual(question(1));
    expect(shifted[1]).toEqual(question(2));
  });

  it('shifts the occupant itself, not just the rows after it', () => {
    // `>` instead of `>=` is the off-by-one this guards: it would leave the
    // occupant sitting on the order the new question is about to take.
    const shifted = shiftOrdersFrom([question(3)], 3);
    expect(ORDERS(shifted)).toEqual([4]);
  });

  it('appends cleanly when the requested order is past the end', () => {
    const shifted = shiftOrdersFrom(
      [1, 2].map((n) => question(n)),
      9,
    );
    expect(ORDERS(shifted)).toEqual([1, 2]);
  });

  it('does not mutate its input', () => {
    // The handler assigns the result back onto a live store object. A function
    // that mutated in place as well would apply the shift twice.
    const original = [question(1), question(2)];
    shiftOrdersFrom(original, 1);
    expect(ORDERS(original)).toEqual([1, 2]);
  });

  it('handles an empty category', () => {
    expect(shiftOrdersFrom([], 1)).toEqual([]);
  });
});

/**
 * Drag reordering.
 *
 * The failure this guards is silent and delayed in exactly the way the header
 * above describes, with one addition: the grid PAGES at 15, so a function that
 * reasoned about visible position rather than category position would write
 * 1..15 over every page and nothing on screen would look wrong until a
 * developer's checklist came out shuffled.
 */
describe('moveRecordId', () => {
  const IDS = ['a', 'b', 'c', 'd'];

  it('moves a row down, placing it after its target', () => {
    expect(moveRecordId(IDS, 'a', 'c', 'after')).toEqual(['b', 'c', 'a', 'd']);
  });

  it('moves a row up, placing it before its target', () => {
    expect(moveRecordId(IDS, 'd', 'b', 'before')).toEqual(['a', 'd', 'b', 'c']);
  });

  it('lands immediately after the target when moving down, not one past it', () => {
    /*
     * The off-by-one this function exists for. Removing the moved id shifts
     * every later index down by one, so an insertion point taken from the
     * ORIGINAL array overshoots by exactly one place — and only ever downwards,
     * which is why an upward-only test would pass against the bug.
     */
    expect(moveRecordId(IDS, 'a', 'b', 'after')).toEqual(['b', 'a', 'c', 'd']);
    expect(moveRecordId(IDS, 'b', 'd', 'after')).toEqual(['a', 'c', 'd', 'b']);
  });

  it('moves to the very start and the very end', () => {
    expect(moveRecordId(IDS, 'd', 'a', 'before')).toEqual(['d', 'a', 'b', 'c']);
    expect(moveRecordId(IDS, 'a', 'd', 'after')).toEqual(['b', 'c', 'd', 'a']);
  });

  it('treats a drop onto itself as a no-op', () => {
    expect(moveRecordId(IDS, 'b', 'b', 'before')).toEqual(IDS);
    expect(moveRecordId(IDS, 'b', 'b', 'after')).toEqual(IDS);
  });

  it('ignores an id that is not in the list rather than inventing a position', () => {
    expect(moveRecordId(IDS, 'zz', 'b', 'after')).toEqual(IDS);
    expect(moveRecordId(IDS, 'a', 'zz', 'after')).toEqual(IDS);
  });

  it('does not mutate its input', () => {
    const original = [...IDS];
    moveRecordId(original, 'a', 'd', 'after');
    expect(original).toEqual(IDS);
  });
});

describe('resequenceRecords', () => {
  const CATEGORY = [question(10, 'a'), question(20, 'b'), question(30, 'c')];

  it('renumbers densely from 1 in the order given', () => {
    const result = resequenceRecords(CATEGORY, ['c', 'a', 'b']);
    expect(result?.map((entry) => [entry.id, entry.order])).toEqual([
      ['c', 1],
      ['a', 2],
      ['b', 3],
    ]);
  });

  it('closes gaps, so a hand-numbered category comes back dense', () => {
    // The fixture is deliberately gapped. `nextQuestionOrder` appends with a step
    // of 1, so a category left on 10/20/30 appends 21 — the disagreement that
    // had the seed renumbered. Anything a save touches comes back on the step-1
    // convention regardless of what the admin typed by hand.
    const result = resequenceRecords(CATEGORY, ['a', 'b', 'c']);
    expect(ORDERS(result ?? [])).toEqual([1, 2, 3]);
    expect(nextQuestionOrder(result ?? [])).toBe(4);
  });

  it('rejects a list that is missing a question', () => {
    // The paginated case: a caller that sent only the rows on screen would
    // renumber a subset and orphan the rest at their old values.
    expect(resequenceRecords(CATEGORY, ['a', 'b'])).toBeNull();
  });

  it('rejects a list carrying an unknown id', () => {
    expect(resequenceRecords(CATEGORY, ['a', 'b', 'zz'])).toBeNull();
  });

  it('rejects a list with a repeated id', () => {
    // Same length, right ids, still wrong — this is the shape that would
    // otherwise produce two questions sharing an order.
    expect(resequenceRecords(CATEGORY, ['a', 'b', 'b'])).toBeNull();
  });

  it('accepts an empty category', () => {
    expect(resequenceRecords([], [])).toEqual([]);
  });

  it('does not mutate its input', () => {
    resequenceRecords(CATEGORY, ['c', 'b', 'a']);
    expect(ORDERS(CATEGORY)).toEqual([10, 20, 30]);
  });
});

/**
 * The same two helpers, over a shape that is not a question.
 *
 * `resequenceRecords` and `resequenceAfterRemoval` are constrained to
 * `{ id, order }` rather than to `ChecklistQuestion` precisely so the categories
 * and task types tabs can share them, and a signature that only ever meets one
 * shape is a generic nobody has checked. `TaskTypeRecord` is the second real
 * caller, so it is what the widening is asserted against.
 */
describe('the ordering helpers over a task type', () => {
  const TYPES: TaskTypeRecord[] = [
    { id: 'tt-a', name: 'Customization', order: 1, isActive: true },
    { id: 'tt-b', name: 'Configuration', order: 2, isActive: true },
    { id: 'tt-c', name: 'Lobby', order: 3, isActive: false },
  ];

  it('renumbers a flat list and keeps every other field', () => {
    const result = resequenceRecords(TYPES, ['tt-c', 'tt-a', 'tt-b']);

    expect(result?.map((entry) => [entry.id, entry.order])).toEqual([
      ['tt-c', 1],
      ['tt-a', 2],
      ['tt-b', 3],
    ]);
    // A reorder must not quietly restore a retired row: the helper carries the
    // record through, it does not rebuild it from the two fields it reads.
    expect(result?.map((entry) => entry.isActive)).toEqual([false, true, true]);
    expect(result?.map((entry) => entry.name)).toEqual(['Lobby', 'Customization', 'Configuration']);
  });

  it('still refuses a partial list', () => {
    expect(resequenceRecords(TYPES, ['tt-a', 'tt-b'])).toBeNull();
  });
});

describe('resequenceAfterRemoval', () => {
  it('closes the gap a delete leaves', () => {
    // The delete case: `2` is gone, and what follows moves up rather than
    // leaving a hole that the next append would number past.
    const remaining = [question(1, 'a'), question(3, 'c'), question(4, 'd')];

    expect(ORDERS(resequenceAfterRemoval(remaining))).toEqual([1, 2, 3]);
  });

  it('numbers from the array order it is given, not from the old values', () => {
    // Callers sort before removing; this function trusts that order and only
    // supplies the numbering. Handed a list in an order it did not expect, it
    // must renumber to THAT order rather than half-preserving the old one.
    const shuffled = [question(30, 'c'), question(10, 'a'), question(20, 'b')];

    expect(resequenceAfterRemoval(shuffled).map((entry) => [entry.id, entry.order])).toEqual([
      ['c', 1],
      ['a', 2],
      ['b', 3],
    ]);
  });

  it('leaves an emptied list empty', () => {
    expect(resequenceAfterRemoval([])).toEqual([]);
  });

  it('does not mutate its input', () => {
    const original = [question(10, 'a'), question(20, 'b')];
    resequenceAfterRemoval(original);
    expect(ORDERS(original)).toEqual([10, 20]);
  });
});
