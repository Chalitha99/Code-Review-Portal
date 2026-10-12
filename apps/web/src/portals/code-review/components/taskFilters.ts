import type { TaskListItem } from '@sdp/contracts';
import { bucketStatuses } from '@/lib/kpiBuckets.ts';

/**
 * Filter state and the predicate that applies it.
 *
 * Split from `TaskFilterBar.tsx` so that file exports only components, which is
 * what React Fast Refresh needs to hot-reload a filter bar without resetting the
 * grid — the same reason `fieldContext.ts` sits beside `Field.tsx`.
 */

/**
 * "No filter" sentinel. Not an empty string: Radix Select reads `''` as "nothing
 * selected" and would show the placeholder instead of the "All Statuses" option.
 */
export const ALL = 'all';

export interface TaskFilters {
  search: string;
  status: string;
  priority: string;
  cycle: string;
  customerId?: string;
  /**
   * A dashboard counter's selection — a `KpiBucket` key, or `ALL`.
   *
   * Held separately from `status` because the two are different questions:
   * `status` is the exact value chosen in the filter bar's Select, while a
   * bucket is a named GROUP of statuses that no single Select option can
   * express. Folding them together would mean the Select showing "Submitted"
   * when the user had actually clicked a card covering three statuses.
   *
   * They compose with AND, which is the intuitive reading of "I clicked Approved
   * and then also picked High priority".
   */
  bucket: string;
}

export const EMPTY_TASK_FILTERS: TaskFilters = {
  search: '',
  status: ALL,
  priority: ALL,
  cycle: ALL,
  customerId: ALL,
  bucket: ALL,
};

/**
 * Applies the filters to a task list.
 *
 * Exported so the grid and the count above it agree: "Showing 3 of 14" has to
 * describe the rows actually rendered, which means one implementation of
 * "which tasks match".
 */
export function filterTasks(items: readonly TaskListItem[], filters: TaskFilters): TaskListItem[] {
  const needle = filters.search.trim().toLowerCase();

  return items.filter((task) => {
    if (filters.status !== ALL) {
      if (filters.status === 'Submitted' && filters.bucket === 'awaitingReview') {
        if (
          task.status !== 'Submitted' &&
          task.status !== 'ReSubmitted' &&
          task.status !== 'InReview'
        )
          return false;
      } else if (filters.status === 'Submitted' && filters.bucket === 'awaitingReviewAdmin') {
        if (task.status !== 'Submitted' && task.status !== 'ReSubmitted') return false;
      } else if (task.status !== filters.status) {
        return false;
      }
    }

    // An unrecognised bucket — a hand-edited URL, or a param left behind by an
    // older build — filters nothing rather than emptying the grid.
    const statuses = bucketStatuses(filters.bucket);
    if (statuses !== null && !statuses.includes(task.status)) return false;

    if (filters.priority !== ALL && task.priority !== filters.priority) return false;

    if (
      filters.customerId &&
      filters.customerId !== ALL &&
      task.customerId !== filters.customerId
    ) {
      return false;
    }

    if (filters.cycle !== ALL) {
      // "3+" is one bucket: past round 3 the exact number matters less than the
      // fact that the task has gone round too many times.
      if (filters.cycle === '3+') {
        if (task.reviewRound < 3) return false;
      } else if (String(task.reviewRound) !== filters.cycle) {
        return false;
      }
    }

    if (needle === '') return true;
    return (
      task.taskCode.toLowerCase().includes(needle) ||
      task.title.toLowerCase().includes(needle) ||
      task.crimId.toLowerCase().includes(needle) ||
      task.customerName.toLowerCase().includes(needle)
    );
  });
}
