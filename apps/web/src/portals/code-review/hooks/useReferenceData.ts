import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { checklistCategorySchema, customerSchema, taskTypeRecordSchema } from '@sdp/contracts';
import { api } from '@/lib/apiClient.ts';
import { taskKeys } from './useTasks.ts';

/**
 * The administered reference lists — customers, task types, checklist template.
 *
 * In `hooks/` rather than inside a feature because both sides read them: the
 * developer workspace to render a checklist and a customer picker, the admin
 * workspace to maintain them. A cross-feature import for that would be shared
 * infrastructure wearing one feature's name, which the boundary rules correctly
 * reject.
 *
 * All three are cached for five minutes. They change only when an admin edits
 * them, and every filter bar and create form reads them, so refetching per
 * screen would be pure noise. The admin mutations invalidate these keys, so an
 * edit is still visible immediately to the person who made it.
 */

export function useCustomers() {
  return useQuery({
    queryKey: taskKeys.customers(),
    queryFn: ({ signal }) => api.get('/customers', z.array(customerSchema), { signal }),
    staleTime: 5 * 60 * 1000,
  });
}

export function useTaskTypes() {
  return useQuery({
    queryKey: taskKeys.taskTypes(),
    queryFn: ({ signal }) => api.get('/task-types', z.array(taskTypeRecordSchema), { signal }),
    staleTime: 5 * 60 * 1000,
  });
}

export function useChecklistTemplate() {
  return useQuery({
    queryKey: taskKeys.template(),
    queryFn: ({ signal }) =>
      api.get('/checklist-template', z.array(checklistCategorySchema), {
        signal,
      }),
    staleTime: 5 * 60 * 1000,
  });
}
