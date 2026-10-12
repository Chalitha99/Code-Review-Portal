import type { TaskListItem } from '@sdp/contracts';
import {
  ALL,
  filterTasks,
  type TaskFilters,
} from '@/portals/code-review/components/taskFilters.ts';

/**
 * The admin grid filters: everything My Tasks has, plus the three people
 * filters screen 01 draws (customer, developer, reviewer).
 *
 * Composed from `filterTasks` rather than reimplemented, so "which tasks match"
 * has one definition. Extending the shared shape instead would have put three
 * filters that only the admin grid can offer into every developer and reviewer
 * screen's state.
 */

export interface AdminTaskFilters extends TaskFilters {
  customerId: string;
  developerId: string;
  reviewerId: string;
}

export const EMPTY_ADMIN_FILTERS: AdminTaskFilters = {
  search: '',
  status: ALL,
  priority: ALL,
  cycle: ALL,
  bucket: ALL,
  customerId: ALL,
  developerId: ALL,
  reviewerId: ALL,
};

export function filterAdminTasks(
  items: readonly TaskListItem[],
  filters: AdminTaskFilters,
): TaskListItem[] {
  return filterTasks(items, filters).filter((task) => {
    if (filters.customerId !== ALL && task.customerId !== filters.customerId) return false;
    if (filters.developerId !== ALL && task.developerId !== filters.developerId) return false;
    // An unassigned task has no reviewer, so it can never match a named one.
    if (filters.reviewerId !== ALL && task.reviewerId !== filters.reviewerId) return false;
    return true;
  });
}
