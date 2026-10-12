import type { ChecklistQuestion } from '@sdp/contracts';

/**
 * Where a checklist question sits inside its category.
 *
 * `order` is scoped to the category and unique only by convention — nothing in
 * the schema enforces it, and nothing renumbered siblings, so an admin who typed
 * an occupied number got two rows sharing it and a grid whose sort fell back to
 * insertion order.
 *
 * In `lib/` rather than in `features/admin/domain/` because there are two
 * callers with the same rule: the admin screens, and the NestJS checklist
 * services that answer `POST /checklist-questions` apply the same ordering.
 * Standards §4 — a rule asked from more than one place moves to `lib/` and
 * keeps the coverage bar.
 *
 * Every function is pure and returns new objects. The handler mutates a
 * module-level store; keeping the arithmetic out of that mutation is what makes
 * the reordering assertable without an HTTP round trip.
 */

/**
 * The next free slot: one past the highest in use.
 *
 * Seeded at 0 and stepped by 1, so the first question in an empty category is
 * `1`, not `0` — matching what the seed data and the admin grid already show.
 */
export function nextQuestionOrder(questions: readonly { order: number }[]): number {
  return questions.reduce((highest, question) => Math.max(highest, question.order), 0) + 1;
}

/**
 * The question currently holding `order`, if any.
 *
 * Returns the FIRST match. Duplicates should not exist, but this module is
 * partly here to clean up categories where they already do, and picking the
 * first is what makes a repeated `shift` converge rather than ping-pong.
 */
export function questionAtOrder(
  questions: readonly ChecklistQuestion[],
  order: number,
): ChecklistQuestion | undefined {
  return questions.find((question) => question.order === order);
}

/**
 * Make room at `order` by moving everything at or after it up by one.
 *
 * `1,2,3,4,5` with `order: 3` becomes `1,2,4,5,6`, leaving 3 free for the
 * incoming question and no gap anywhere in the sequence.
 *
 * Returns the FULL list — questions before `order` included, unchanged — so the
 * caller assigns one array back rather than merging a partial result. The
 * ordering is preserved as given; sorting is the reader's job (`sortedTemplate`
 * in the handler already does it), because sorting here would quietly reorder a
 * category that had duplicates before this ran.
 *
 * Only ever called with ONE category's questions. Orders in a sibling category
 * are independent and must not move.
 */
export function shiftOrdersFrom(
  questions: readonly ChecklistQuestion[],
  order: number,
): ChecklistQuestion[] {
  return questions.map((question) =>
    question.order >= order ? { ...question, order: question.order + 1 } : question,
  );
}

/* -------------------------------------------------------------------------- */
/* Drag reordering                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Move one id to sit immediately before or after another.
 *
 * Positional, not index-based, and that is the point. The grids page and filter,
 * so a row's index ON SCREEN is not its index in the collection — reordering by
 * visible index is exactly how a paginated list ends up with 1–15 written over
 * every page. Both ids come from the drop, and both are resolved against the
 * FULL list by the caller.
 *
 * Ids only, so this serves questions, categories and task types alike.
 *
 * Returns `ids` unchanged when either id is absent or they are the same, so a
 * drop onto itself is a no-op rather than a corruption.
 */
export function moveRecordId(
  ids: readonly string[],
  movedId: string,
  targetId: string,
  placement: 'before' | 'after',
): string[] {
  if (movedId === targetId) return [...ids];

  const from = ids.indexOf(movedId);
  const target = ids.indexOf(targetId);
  if (from === -1 || target === -1) return [...ids];

  const without = ids.filter((id) => id !== movedId);
  // Recomputed AFTER the removal: taking the target's original index would be
  // one too high whenever the row moves downwards past it.
  const at = without.indexOf(targetId);
  const insertAt = placement === 'before' ? at : at + 1;

  return [...without.slice(0, insertAt), movedId, ...without.slice(insertAt)];
}

/**
 * Renumber a set of records densely, 1…n, in the sequence `orderedIds` gives.
 *
 * Generic over anything carrying an `id` and an `order`, because all three
 * administered lists need exactly this: a category's questions, the categories
 * themselves, and the task types. Writing it three times would be three places
 * for the off-by-one to differ.
 *
 * Dense, matching `nextQuestionOrder` above, which appends with a step of 1. The
 * seeds once numbered 10/20/30 and the two conventions disagreed — appending to
 * a 10/20 list produced 21 — so the seeds were renumbered 1…n and this keeps
 * them that way. It also makes a duplicate `order` unreachable by this path,
 * since the positions come from an array index.
 *
 * Returns `null` unless `orderedIds` is EXACTLY the given records — no missing,
 * no extra, no repeats. The server applies the same rule (ORDER_INCOMPLETE), so
 * a payload it would reject cannot be built by the UI either, and a
 * partial list can never silently renumber a subset and orphan the rest. That
 * last case is the one that matters on a paged grid.
 */
export function resequenceRecords<T extends { id: string; order: number }>(
  records: readonly T[],
  orderedIds: readonly string[],
): T[] | null {
  if (orderedIds.length !== records.length) return null;
  if (new Set(orderedIds).size !== orderedIds.length) return null;

  const byId = new Map(records.map((record) => [record.id, record]));
  const resequenced: T[] = [];

  for (const [index, id] of orderedIds.entries()) {
    const record = byId.get(id);
    if (record === undefined) return null;
    resequenced.push({ ...record, order: index + 1 });
  }

  return resequenced;
}

/**
 * Close the gap a deletion leaves, renumbering what remains 1…n.
 *
 * Called by every delete handler. Without it "sequential" is only true until
 * someone deletes: removing the third of five leaves 1, 2, 4, 5, and nothing
 * repairs it until an admin happens to drag something.
 *
 * Order is taken from the records as given, so the caller sorts first if its
 * store is not already in order — the handlers keep their lists sorted on read
 * rather than on write.
 */
export function resequenceAfterRemoval<T extends { id: string; order: number }>(
  records: readonly T[],
): T[] {
  return records.map((record, index) => ({ ...record, order: index + 1 }));
}
