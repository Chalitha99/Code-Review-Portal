import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import {
  checklistSubmissionSchema,
  issueResponseRecordSchema,
  taskAttachmentSchema,
  taskChecklistSchema,
  taskEventSchema,
  taskListItemSchema,
} from '@sdp/contracts';
import { absentAsNull, api } from '@/lib/apiClient.ts';

/**
 * Reading task lists — shared by every workspace.
 *
 * Lives in `hooks/` rather than inside `features/tasks` because all three
 * workspaces list tasks: the developer their own, the reviewer three different
 * queues, the admin everything. A cross-feature import for that would be shared
 * infrastructure wearing one feature's name, which the boundary rules correctly
 * reject.
 *
 * WRITING a task stays in `features/tasks` — creating, editing, submitting and
 * the checklist are the developer feature's own business.
 */

export const taskKeys = {
  all: ['tasks'] as const,
  lists: () => [...taskKeys.all, 'list'] as const,
  list: (scope: TaskScope) => [...taskKeys.lists(), scope] as const,
  detail: (taskId: string) => [...taskKeys.all, 'detail', taskId] as const,
  events: (taskId: string) => [...taskKeys.all, 'events', taskId] as const,
  checklist: (taskId: string) => [...taskKeys.all, 'checklist', taskId] as const,
  checklistSubmissions: (taskId: string) =>
    [...taskKeys.all, 'checklist-submissions', taskId] as const,
  attachments: (taskId: string) => [...taskKeys.all, 'attachments', taskId] as const,
  responses: (taskId: string) => [...taskKeys.all, 'responses', taskId] as const,
  template: () => ['checklist-template'] as const,
  taskTypes: () => ['task-types'] as const,
  customers: () => ['customers'] as const,
};

/**
 * Mirrors the `scope` the API enforces. The SERVER decides what each one means —
 * `available` excludes the caller's own submissions, `mine` is theirs alone — so
 * a client cannot widen its view by editing a query string.
 */
export type TaskScope = 'mine' | 'all' | 'available' | 'assigned' | 'history';

const taskListSchema = z.object({
  items: z.array(taskListItemSchema),
  pagination: z.object({
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  }),
});

export function useTasks(scope: TaskScope) {
  return useQuery({
    queryKey: taskKeys.list(scope),
    queryFn: ({ signal }) => api.get('/tasks', taskListSchema, { signal, searchParams: { scope } }),
    select: (data) => data.items,

    /*
     * Keep the outgoing scope's rows on screen while the incoming one loads.
     *
     * Each scope is its own query key, so moving between the reviewer's three
     * tabs — or between a workspace and its analytics — used to drop the grid to
     * a skeleton and back for every click. `isFetching` stays true through the
     * swap, which `DataTable` marks with a hairline progress bar rather than a
     * teardown, so the table keeps its rows, its height and its scroll position
     * and the page does not jump.
     *
     * This is also the behaviour a server-paged list needs, which is why it is
     * set here rather than per screen.
     */
    placeholderData: keepPreviousData,
  });
}

export function useTask(taskId: string | undefined) {
  return useQuery({
    queryKey: taskKeys.detail(taskId ?? ''),
    queryFn: ({ signal }) => api.get(`/tasks/${taskId ?? ''}`, taskListItemSchema, { signal }),
    enabled: taskId !== undefined && taskId !== '',
  });
}

/**
 * A task with no checklist yet answers 204, which the client models as `null`
 * rather than an error — an unstarted checklist is the normal state of a draft.
 */
export function useTaskChecklist(taskId: string | undefined) {
  return useQuery({
    queryKey: taskKeys.checklist(taskId ?? ''),
    queryFn: ({ signal }) =>
      api.get(`/tasks/${taskId ?? ''}/checklist`, absentAsNull(taskChecklistSchema), { signal }),
    enabled: taskId !== undefined && taskId !== '',
  });
}

export function useChecklistSubmissions(taskId: string | undefined) {
  return useQuery({
    queryKey: taskKeys.checklistSubmissions(taskId ?? ''),
    queryFn: ({ signal }) =>
      api.get(`/tasks/${taskId ?? ''}/checklist-submissions`, checklistSubmissionSchema.array(), {
        signal,
      }),
    enabled: taskId !== undefined && taskId !== '',
  });
}

/**
 * The developer's supporting images.
 *
 * Read by both workspaces: the developer manages them, the reviewer looks at
 * them — which is the entire reason for attaching one.
 */
export function useTaskAttachments(taskId: string | undefined) {
  return useQuery({
    queryKey: taskKeys.attachments(taskId ?? ''),
    queryFn: ({ signal }) =>
      api.get(`/tasks/${taskId ?? ''}/attachments`, z.array(taskAttachmentSchema), { signal }),
    enabled: taskId !== undefined && taskId !== '',
  });
}

/**
 * The task's activity log and the developer's responses to review comments.
 * Read here rather than in `features/tasks` because the reviewer and admin
 * screens render them too.
 */
export function useTaskEvents(taskId: string | undefined) {
  return useQuery({
    queryKey: taskKeys.events(taskId ?? ''),
    queryFn: ({ signal }) =>
      api.get(`/tasks/${taskId ?? ''}/events`, z.array(taskEventSchema), { signal }),
    enabled: taskId !== undefined && taskId !== '',
  });
}

export function useIssueResponses(taskId: string | undefined) {
  return useQuery({
    queryKey: taskKeys.responses(taskId ?? ''),
    queryFn: ({ signal }) =>
      api.get(`/tasks/${taskId ?? ''}/responses`, z.array(issueResponseRecordSchema), { signal }),
    enabled: taskId !== undefined && taskId !== '',
  });
}
