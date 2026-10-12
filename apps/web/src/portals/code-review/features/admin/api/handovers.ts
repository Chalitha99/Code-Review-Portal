import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { handoverSchema, reviewSchema, type Handover } from '@sdp/contracts';
import { absentAsNull, api } from '@/lib/apiClient.ts';
import { taskKeys } from '@/portals/code-review/hooks/useTasks.ts';
import { reviewKeys } from '@/portals/code-review/hooks/useReviews.ts';

/**
 * The admin handover queue and detail queries.
 *
 * Both mutations invalidate the task lists, individual task, and handover detail:
 * resolving a handover changes whose queue the task sits in, and an admin who reassigns
 * while views are cached would otherwise see stale reviewer ownership.
 */

export const handoverKeys = {
  all: ['handovers'] as const,
  detail: (handoverId: string) => [...handoverKeys.all, 'detail', handoverId] as const,
  draft: (handoverId: string) => [...handoverKeys.all, 'draft', handoverId] as const,
};

export function useHandovers() {
  return useQuery({
    queryKey: handoverKeys.all,
    queryFn: ({ signal }) => api.get('/handovers', z.array(handoverSchema), { signal }),
  });
}

export function useHandover(handoverId: string | undefined) {
  return useQuery({
    queryKey: handoverKeys.detail(handoverId ?? ''),
    queryFn: ({ signal }) => api.get(`/handovers/${handoverId ?? ''}`, handoverSchema, { signal }),
    enabled: Boolean(handoverId),
  });
}

export function useHandoverDraft(handoverId: string | undefined) {
  return useQuery({
    queryKey: handoverKeys.draft(handoverId ?? ''),
    queryFn: ({ signal }) =>
      api.get(`/handovers/${handoverId ?? ''}/draft`, absentAsNull(reviewSchema), { signal }),
    enabled: Boolean(handoverId),
  });
}

function useHandoverMutation<TInput>(request: (input: TInput) => Promise<unknown>) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: request,
    onSuccess: (result) => {
      const handover = result as Handover | undefined;
      void queryClient.invalidateQueries({ queryKey: handoverKeys.all });
      void queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
      if (handover?.id) {
        queryClient.setQueryData(handoverKeys.detail(handover.id), handover);
        void queryClient.invalidateQueries({ queryKey: handoverKeys.detail(handover.id) });
      }
      if (handover?.taskId) {
        void queryClient.invalidateQueries({ queryKey: taskKeys.detail(handover.taskId) });
        void queryClient.invalidateQueries({ queryKey: taskKeys.events(handover.taskId) });
        void queryClient.invalidateQueries({ queryKey: reviewKeys.current(handover.taskId) });
        void queryClient.invalidateQueries({ queryKey: reviewKeys.history(handover.taskId) });
      }
    },
    onError: () => {
      // Concurrency race: refresh queries to ensure stale state is updated
      void queryClient.invalidateQueries({ queryKey: handoverKeys.all });
    },
  });
}

export function useReassignHandover() {
  return useHandoverMutation(
    ({ handoverId, reviewerId }: { handoverId: string; reviewerId: string }) =>
      api.post(`/handovers/${handoverId}/reassign`, handoverSchema, { reviewerId }),
  );
}

export function useReturnHandover() {
  return useHandoverMutation((handoverId: string) =>
    api.post(`/handovers/${handoverId}/return`, handoverSchema),
  );
}
