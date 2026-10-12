import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  checklistCategorySchema,
  checklistQuestionSchema,
  taskTypeRecordSchema,
  type CreateChecklistCategoryInput,
  type CreateChecklistQuestionInput,
  type CreateTaskTypeInput,
  type ReorderInput,
  type UpdateChecklistCategoryInput,
  type UpdateChecklistQuestionInput,
  type UpdateTaskTypeInput,
} from '@sdp/contracts';
import { api } from '@/lib/apiClient.ts';
import { taskKeys } from '@/portals/code-review/hooks/useTasks.ts';

/**
 * Administering the quality checklist.
 *
 * Every mutation invalidates BOTH the admin view and the developer-facing
 * reference caches. Those caches carry a five-minute `staleTime`, so without the
 * second invalidation an admin could rename a question and still see the old
 * wording in the wizard for the rest of the session — the kind of "it didn't
 * save" report that is really a stale cache.
 */

export const checklistAdminKeys = {
  template: ['admin', 'checklist-template'] as const,
  taskTypes: ['admin', 'task-types'] as const,
};

const templateSchema = z.array(checklistCategorySchema);
const taskTypesSchema = z.array(taskTypeRecordSchema);

/** The whole bank INCLUDING retired rows — the admin maintains those too. */
export function useAdminChecklistTemplate() {
  return useQuery({
    queryKey: checklistAdminKeys.template,
    queryFn: ({ signal }) =>
      api.get('/checklist-template', templateSchema, { signal, searchParams: { scope: 'all' } }),
  });
}

/**
 * Task types INCLUDING retired ones, and its own query key.
 *
 * Separate from the shared `useTaskTypes()` because the two want different
 * lists: the wizard offers only active types, the admin maintains all of them.
 * Sharing one cache entry would mean whichever screen loaded last decided what
 * the other saw.
 *
 * The Task Types tab could not offer Restore without this — a retired row never
 * reached the grid — and could not be reordered either, since the batch endpoint
 * requires the whole set.
 */
export function useAdminTaskTypes() {
  return useQuery({
    queryKey: checklistAdminKeys.taskTypes,
    queryFn: ({ signal }) =>
      api.get('/task-types', taskTypesSchema, { signal, searchParams: { scope: 'all' } }),
  });
}

function useTemplateMutation<TInput, TResult>(request: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: request,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: checklistAdminKeys.template }),
        queryClient.invalidateQueries({ queryKey: checklistAdminKeys.taskTypes }),
        queryClient.invalidateQueries({ queryKey: taskKeys.template() }),
        queryClient.invalidateQueries({ queryKey: taskKeys.taskTypes() }),
      ]);
    },
  });
}

/* ------------------------------------------------------------------ task types */

export function useCreateTaskType() {
  return useTemplateMutation((input: CreateTaskTypeInput) =>
    api.post('/task-types', taskTypeRecordSchema, input),
  );
}

export function useUpdateTaskType() {
  return useTemplateMutation(({ id, input }: { id: string; input: UpdateTaskTypeInput }) =>
    api.patch(`/task-types/${id}`, taskTypeRecordSchema, input),
  );
}

export function useDeleteTaskType() {
  return useTemplateMutation((id: string) => api.delete(`/task-types/${id}`, z.unknown()));
}

/* ------------------------------------------------------------------ categories */

export function useCreateCategory() {
  return useTemplateMutation((input: CreateChecklistCategoryInput) =>
    api.post('/checklist-categories', checklistCategorySchema, input),
  );
}

export function useUpdateCategory() {
  return useTemplateMutation(({ id, input }: { id: string; input: UpdateChecklistCategoryInput }) =>
    api.patch(`/checklist-categories/${id}`, checklistCategorySchema, input),
  );
}

export function useDeleteCategory() {
  return useTemplateMutation((id: string) =>
    api.delete(`/checklist-categories/${id}`, z.unknown()),
  );
}

/* ------------------------------------------------------------------- questions */

export function useCreateQuestion() {
  return useTemplateMutation((input: CreateChecklistQuestionInput) =>
    api.post('/checklist-questions', checklistQuestionSchema, input),
  );
}

export function useUpdateQuestion() {
  return useTemplateMutation(({ id, input }: { id: string; input: UpdateChecklistQuestionInput }) =>
    api.patch(`/checklist-questions/${id}`, checklistQuestionSchema, input),
  );
}

export function useDeleteQuestion() {
  return useTemplateMutation((id: string) => api.delete(`/checklist-questions/${id}`, z.unknown()));
}

/**
 * Persist a whole category's question order in one call.
 *
 * One request for the entire sequence rather than a PATCH per moved row: a drag
 * session produces many intermediate arrangements and only the final one is
 * worth writing. Sending each would multiply the writes, leave the list
 * reorderable into a half-applied state on a mid-sequence failure, and race two
 * admins against each other for no benefit.
 *
 * Through `useTemplateMutation` like every other write here, so a save also
 * refreshes the developer-facing template and task-type caches — those carry a
 * five-minute `staleTime`, and a reordered checklist that only the admin can see
 * is the bug that wrapper exists to prevent.
 */
export function useReorderQuestions() {
  return useTemplateMutation(({ categoryId, ids }: { categoryId: string } & ReorderInput) =>
    api.patch(`/checklist-categories/${categoryId}/question-order`, checklistCategorySchema, {
      ids,
    }),
  );
}

/**
 * The two administered lists, reordered wholesale.
 *
 * Same shape as the question reorder above and the same reasoning: one request
 * carrying the final sequence, ids only, with the order values derived from
 * array position on the server. The URL says which collection; the body never
 * has to.
 */
export function useReorderCategories() {
  return useTemplateMutation((input: ReorderInput) =>
    api.patch('/checklist-categories/order', templateSchema, input),
  );
}

export function useReorderTaskTypes() {
  return useTemplateMutation((input: ReorderInput) =>
    api.patch('/task-types/order', taskTypesSchema, input),
  );
}
