import type { ChecklistAnswerEntry } from '@sdp/contracts';

export interface StoredCategoryGroup {
  categoryName: string;
  answers: ChecklistAnswerEntry[];
  issueCount: number;
}

/**
 * Groups a SUBMITTED checklist's answers by the category they were asked under.
 *
 * Reads the stored snapshot only — it never touches the template. That is the
 * point of snapshotting: a checklist signed off last month renders exactly as it
 * was answered, even after an admin has reworded, re-categorised or retired the
 * questions involved.
 */
export function groupStoredAnswers(
  answers: readonly ChecklistAnswerEntry[],
): StoredCategoryGroup[] {
  const groups = new Map<string, ChecklistAnswerEntry[]>();

  for (const entry of [...answers].sort((a, b) => a.order - b.order)) {
    const existing = groups.get(entry.categoryName);
    if (existing) existing.push(entry);
    else groups.set(entry.categoryName, [entry]);
  }

  return [...groups.entries()].map(([categoryName, entries]) => ({
    categoryName,
    answers: entries,
    issueCount: entries.filter((entry) => entry.answer === 'No').length,
  }));
}
