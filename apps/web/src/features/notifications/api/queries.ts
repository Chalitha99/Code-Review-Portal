import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { notificationSchema } from '@sdp/contracts';
import { api } from '@/lib/apiClient.ts';

export const notificationKeys = {
  all: ['notifications'] as const,
  list: () => [...notificationKeys.all, 'list'] as const,
};

export function useNotifications() {
  return useQuery({
    queryKey: notificationKeys.list(),
    queryFn: ({ signal }) => api.get('/notifications', notificationSchema.array(), { signal }),
    refetchInterval: 60_000,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`, notificationSchema),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    // 204 No Content — `z.undefined()` documents that and makes the api client
    // assert it rather than silently accepting any body.
    mutationFn: () => api.post('/notifications/read-all', z.undefined()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}
