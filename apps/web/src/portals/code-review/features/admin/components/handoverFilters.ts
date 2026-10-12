import { HANDOVER_STATUSES, type HandoverStatus } from '@sdp/contracts';
import { ALL } from '@/portals/code-review/components/taskFilters.ts';

export const HANDOVER_DATE_RANGES = ['all', 'today', '7d', '30d'] as const;
export type HandoverDateRange = (typeof HANDOVER_DATE_RANGES)[number];

export interface HandoverFilters {
  search: string;
  status: HandoverStatus | typeof ALL;
  reviewerId: string;
  dateRange: HandoverDateRange;
  customerId: string;
}

export const EMPTY_HANDOVER_FILTERS: HandoverFilters = {
  search: '',
  status: ALL,
  reviewerId: ALL,
  dateRange: 'all',
  customerId: ALL,
};

export interface FilterableHandover {
  taskCode: string;
  taskTitle: string;
  crimId: string;
  customerId: string;
  fromReviewerId: string;
  fromReviewerName: string;
  reason: string;
  status: HandoverStatus;
  createdAt: string;
}

const isOneOf = <T extends string>(value: string | null, values: readonly T[]): value is T =>
  value !== null && (values as readonly string[]).includes(value);

export function readHandoverFilters(params: URLSearchParams): HandoverFilters {
  const status = params.get('status');
  const dateRange = params.get('raised');
  return {
    search: params.get('search') ?? '',
    status: isOneOf(status, HANDOVER_STATUSES) ? status : ALL,
    reviewerId: params.get('handedOverBy') ?? ALL,
    dateRange: isOneOf(dateRange, HANDOVER_DATE_RANGES) ? dateRange : 'all',
    customerId: params.get('customer') ?? ALL,
  };
}

export function writeHandoverFilters(params: URLSearchParams, filters: HandoverFilters): void {
  const setOrDelete = (key: string, value: string, fallback = ALL) => {
    if (value !== fallback && value !== '') params.set(key, value);
    else params.delete(key);
  };

  setOrDelete('search', filters.search.trim(), '');
  setOrDelete('status', filters.status);
  setOrDelete('handedOverBy', filters.reviewerId);
  setOrDelete('raised', filters.dateRange, 'all');
  setOrDelete('customer', filters.customerId);
}

export function isHandoverFiltered(filters: HandoverFilters): boolean {
  return (
    filters.search.trim() !== '' ||
    filters.status !== ALL ||
    filters.reviewerId !== ALL ||
    filters.dateRange !== 'all' ||
    filters.customerId !== ALL
  );
}

export function filterHandovers<T extends FilterableHandover>(
  rows: readonly T[],
  filters: HandoverFilters,
  now = new Date(),
): T[] {
  const needle = filters.search.trim().toLocaleLowerCase();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dateCutoff =
    filters.dateRange === 'today'
      ? startOfToday
      : filters.dateRange === '7d'
        ? now.getTime() - 7 * 24 * 60 * 60 * 1000
        : filters.dateRange === '30d'
          ? now.getTime() - 30 * 24 * 60 * 60 * 1000
          : null;

  return rows.filter((row) => {
    const matchesSearch =
      needle === '' ||
      [row.taskCode, row.taskTitle, row.crimId, row.fromReviewerName, row.reason].some((value) =>
        value.toLocaleLowerCase().includes(needle),
      );
    const matchesDate = dateCutoff === null || new Date(row.createdAt).getTime() >= dateCutoff;
    return (
      matchesSearch &&
      (filters.status === ALL || row.status === filters.status) &&
      (filters.reviewerId === ALL || row.fromReviewerId === filters.reviewerId) &&
      (filters.customerId === ALL || row.customerId === filters.customerId) &&
      matchesDate
    );
  });
}
