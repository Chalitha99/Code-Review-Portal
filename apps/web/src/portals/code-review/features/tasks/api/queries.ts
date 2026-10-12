import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  taskChecklistSchema,
  issueResponseRecordSchema,
  taskListItemSchema,
  nextTaskVersionSchema,
  type ChecklistDraft,
  type TaskDraft,
} from '@sdp/contracts';
import { api } from '@/lib/apiClient.ts';
import { taskKeys } from '@/portals/code-review/hooks/useTasks.ts';
import { reviewKeys } from '@/portals/code-review/hooks/useReviews.ts';
import type { ResponseLike } from '../domain/responseRules.ts';

/**
 * WRITING tasks. Reading them lives in `hooks/useTasks.ts`, because every
 * workspace lists tasks while only this one creates and edits them.
 */
export {
  taskKeys,
  useTask,
  useTaskChecklist,
  useChecklistSubmissions,
  useIssueResponses,
  useTaskEvents,
  useTasks,
  type TaskScope,
} from '@/portals/code-review/hooks/useTasks.ts';

/**
 * The administered reference lists live in `hooks/useReferenceData.ts`: the
 * admin workspace maintains them, this one consumes them, so neither feature
 * owns them. Re-exported here so the wizard's imports stay in one place.
 */
export {
  useChecklistTemplate,
  useCustomers,
  useTaskTypes,
} from '@/portals/code-review/hooks/useReferenceData.ts';

/**
 * Server state for the developer workspace.
 *
 * Every screen reads through these hooks rather than calling `api` directly, so
 * cache invalidation lives in one place: submitting a task has to refresh the
 * list, the detail and the notification badge, and scattering that across four
 * components is how a grid ends up showing a status the detail page disagrees
 * with.
 */

export function useNextTaskVersion(customerId: string, crimId: string, enabled = true) {
  const normalizedCrimId = crimId.trim().toLocaleLowerCase();
  return useQuery({
    queryKey: [...taskKeys.all, 'next-version', customerId, normalizedCrimId],
    queryFn: ({ signal }) =>
      api.get('/task-identities/next-version', nextTaskVersionSchema, {
        signal,
        searchParams: { customerId, crimId: crimId.trim() },
      }),
    enabled: enabled && customerId !== '' && normalizedCrimId !== '',
    staleTime: 0,
  });
}

/* -------------------------------------------------------------------------- */
/* Mutations                                                                   */
/* -------------------------------------------------------------------------- */

export function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (draft: TaskDraft) => api.post('/tasks', taskListItemSchema, draft),
    onSuccess: (task) => {
      queryClient.setQueryData(taskKeys.detail(task.id), task);
      void queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: taskKeys.checklist(task.id) });
    },
  });
}

export function useUpdateTask(taskId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (draft: Partial<TaskDraft>) =>
      api.patch(`/tasks/${taskId}`, taskListItemSchema, draft),
    onSuccess: (task) => {
      queryClient.setQueryData(taskKeys.detail(task.id), task);
      void queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: taskKeys.checklist(task.id) });
    },
  });
}

export function useSaveChecklist(taskId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (draft: ChecklistDraft) =>
      api.put(`/tasks/${taskId}/checklist`, taskChecklistSchema, draft),
    onSuccess: (checklist) => {
      queryClient.setQueryData(taskKeys.checklist(taskId), checklist);
      // Saving the checklist changes the task's `isChecklistComplete` and
      // `taskTypes`, which the submit gate reads — so the task must refetch too.
      void queryClient.invalidateQueries({ queryKey: taskKeys.detail(taskId) });
      void queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
    },
  });
}

export function useSubmitTask(taskId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.post(`/tasks/${taskId}/submit`, taskListItemSchema),
    onSuccess: async (task) => {
      queryClient.setQueryData(taskKeys.detail(task.id), task);
      await Promise.all(
        [
          taskKeys.lists(),
          taskKeys.events(task.id),
          taskKeys.responses(task.id),
          taskKeys.checklistSubmissions(task.id),
          reviewKeys.current(task.id),
          reviewKeys.history(task.id),
          ['notifications'],
        ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
    },
  });
}

export function useDiscardDraft() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (taskId: string) => api.delete(`/tasks/${taskId}`, z.unknown()),
    onSuccess: async (_data, taskId) => {
      queryClient.removeQueries({ queryKey: taskKeys.detail(taskId) });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: taskKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: ['notifications'] }),
      ]);
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Responding to review feedback (FL 2.11.2.3-01)                              */
/* -------------------------------------------------------------------------- */

/**
 * Record one response.
 *
 * The endpoint returns the whole set for the cycle, so the cache is replaced
 * rather than patched — changing your mind about a finding overwrites the
 * previous answer server-side, and mirroring that here keeps the two in step.
 */
export function useRespondToIssue(taskId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ResponseLike) =>
      api.post(`/tasks/${taskId}/responses`, z.array(issueResponseRecordSchema), input),
    onSuccess: async (records) => {
      queryClient.setQueryData(taskKeys.responses(taskId), records);
      await queryClient.invalidateQueries({ queryKey: reviewKeys.history(taskId) });
    },
  });
}

/**
 * Remove one response (reverting it to Pending).
 */
export function useDeleteIssueResponse(taskId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (responseId: string) =>
      api.delete(`/tasks/${taskId}/responses/${responseId}`, z.array(issueResponseRecordSchema)),
    onSuccess: async (records) => {
      queryClient.setQueryData(taskKeys.responses(taskId), records);
      await queryClient.invalidateQueries({ queryKey: reviewKeys.history(taskId) });
    },
  });
}
