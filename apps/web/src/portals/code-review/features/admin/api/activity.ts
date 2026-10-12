import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { auditLogPageSchema } from '@sdp/contracts';
import { api } from '@/lib/apiClient.ts';

export interface ActivityLogFilters {
  search: string;
  dateFrom: string;
  dateTo: string;
  actorUserId: string;
  actorRole: string;
  actionType: string;
  entityType: string;
  page: number;
  pageSize: number;
}

export const activityLogKeys = {
  all: ['audit-logs'] as const,
  list: (filters: ActivityLogFilters) => [...activityLogKeys.all, filters] as const,
};

export function useActivityLogs(filters: ActivityLogFilters) {
  return useQuery({
    queryKey: activityLogKeys.list(filters),
    queryFn: ({ signal }) =>
      api.get('/audit-logs', auditLogPageSchema, {
        signal,
        searchParams: {
          search: filters.search || undefined,
          dateFrom: filters.dateFrom === '' ? undefined : `${filters.dateFrom}T00:00:00.000Z`,
          dateTo: filters.dateTo === '' ? undefined : `${filters.dateTo}T23:59:59.999Z`,
          actorUserId: filters.actorUserId || undefined,
          actorRole: filters.actorRole || undefined,
          actionType: filters.actionType || undefined,
          entityType: filters.entityType || undefined,
          page: filters.page,
          pageSize: filters.pageSize,
        },
      }),
    placeholderData: keepPreviousData,
  });
}
