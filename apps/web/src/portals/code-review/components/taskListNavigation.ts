import { PRIORITIES, TASK_STATUSES } from '@sdp/contracts';
import {
  ALL,
  EMPTY_TASK_FILTERS,
  type TaskFilters,
} from '@/portals/code-review/components/taskFilters.ts';
import { isKpiBucket } from '@/lib/kpiBuckets.ts';
import type { SortingState } from '@tanstack/react-table';

const PAGE_SIZES = [10, 15, 25, 50, 100] as const;
const CYCLES = new Set([ALL, '1', '2', '3+']);
const SORT_COLUMNS = new Set([
  'taskCode',
  'title',
  'crimId',
  'customerName',
  'developerName',
  'reviewerName',
  'fromReviewerName',
  'reason',
  'status',
  'priority',
  'reviewRound',
  'countedCycle',
  'reviewCycle',
  'reassignedToName',
  'createdAt',
]);

function supported(value: string | null, values: readonly string[], fallback = ALL): string {
  return value !== null && values.includes(value) ? value : fallback;
}

export function readTaskListFilters(params: URLSearchParams): TaskFilters {
  return {
    ...EMPTY_TASK_FILTERS,
    search: params.get('search') ?? '',
    status: supported(params.get('status') ?? params.get('decision'), TASK_STATUSES),
    priority: supported(params.get('priority'), PRIORITIES),
    cycle: supported(params.get('cycle'), [...CYCLES]),
    customerId: params.get('customer') ?? params.get('customerId') ?? ALL,
    bucket: isKpiBucket(params.get('bucket')) ? (params.get('bucket') ?? ALL) : ALL,
  };
}

export function writeTaskListFilters(
  params: URLSearchParams,
  filters: TaskFilters,
  options: { customer?: boolean } = {},
): void {
  const setOrDelete = (key: string, value: string | undefined, fallback = ALL) => {
    if (value && value !== fallback) params.set(key, value);
    else params.delete(key);
  };

  setOrDelete('search', filters.search.trim(), '');
  setOrDelete('status', filters.status);
  params.delete('decision');
  setOrDelete('priority', filters.priority);
  setOrDelete('cycle', filters.cycle);
  if (options.customer) {
    setOrDelete('customer', filters.customerId);
    params.delete('customerId');
  }
}

export function readPagination(params: URLSearchParams, defaultPageSize = 15) {
  const page = Number.parseInt(params.get('page') ?? '1', 10);
  const requestedSize = Number.parseInt(params.get('pageSize') ?? String(defaultPageSize), 10);
  return {
    pageIndex: Number.isFinite(page) && page > 0 ? page - 1 : 0,
    pageSize: (PAGE_SIZES as readonly number[]).includes(requestedSize)
      ? requestedSize
      : defaultPageSize,
  };
}

export function writePagination(
  params: URLSearchParams,
  pageIndex: number,
  pageSize: number,
  defaultPageSize = 15,
): void {
  if (pageIndex > 0) params.set('page', String(pageIndex + 1));
  else params.delete('page');
  if (pageSize !== defaultPageSize) params.set('pageSize', String(pageSize));
  else params.delete('pageSize');
}

export function readSorting(params: URLSearchParams): SortingState {
  const raw = params.get('sort');
  if (!raw) return [];
  return raw.split(',').flatMap((entry) => {
    const [id, direction] = entry.split(':');
    return id && SORT_COLUMNS.has(id) ? [{ id, desc: direction === 'desc' }] : [];
  });
}

export function writeSorting(params: URLSearchParams, sorting: SortingState): void {
  if (sorting.length === 0) params.delete('sort');
  else
    params.set('sort', sorting.map(({ id, desc }) => `${id}:${desc ? 'desc' : 'asc'}`).join(','));
}

export function currentListUrl(pathname: string, search: string): string {
  return `${pathname}${search}`;
}

export function buildDetailUrl(detailPath: string, returnTo: string): string {
  const params = new URLSearchParams({ returnTo });
  return `${detailPath}?${params.toString()}`;
}

export function safeListReturnTo(
  params: URLSearchParams,
  allowedPaths: readonly string[],
  fallback: string,
): string {
  const candidate = params.get('returnTo');
  if (!candidate || candidate.includes('\\')) return fallback;
  try {
    const parsed = new URL(candidate, 'http://internal.local');
    if (parsed.origin !== 'http://internal.local') return fallback;
    if (!allowedPaths.includes(parsed.pathname)) return fallback;
    if (parsed.searchParams.has('returnTo')) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
