import { describe, expect, it } from 'vitest';
import {
  buildDetailUrl,
  readPagination,
  readSorting,
  readTaskListFilters,
  safeListReturnTo,
  writePagination,
  writeSorting,
  writeTaskListFilters,
} from '@/portals/code-review/components/taskListNavigation.ts';

describe('task list URL state', () => {
  it('round-trips filters, pagination, and sorting', () => {
    const params = new URLSearchParams();
    writeTaskListFilters(
      params,
      {
        search: 'CRIM-949',
        status: 'ChangesRequested',
        priority: 'High',
        cycle: '2',
        customerId: 'c-semco',
        bucket: 'all',
      },
      { customer: true },
    );
    writePagination(params, 2, 25);
    writeSorting(params, [{ id: 'createdAt', desc: true }]);

    expect(readTaskListFilters(params)).toMatchObject({
      search: 'CRIM-949',
      status: 'ChangesRequested',
      priority: 'High',
      cycle: '2',
      customerId: 'c-semco',
    });
    expect(readPagination(params)).toEqual({ pageIndex: 2, pageSize: 25 });
    expect(readSorting(params)).toEqual([{ id: 'createdAt', desc: true }]);
  });

  it('normalizes invalid query values', () => {
    const params = new URLSearchParams(
      'status=INVALID&priority=INVALID&cycle=99&page=-4&pageSize=999',
    );
    expect(readTaskListFilters(params)).toMatchObject({
      status: 'all',
      priority: 'all',
      cycle: 'all',
    });
    expect(readPagination(params)).toEqual({ pageIndex: 0, pageSize: 15 });
  });

  it('accepts only whitelisted internal return destinations', () => {
    const returnTo = '/crp/admin?status=InReview&page=3';
    const detail = buildDetailUrl('/crp/admin/tasks/t-1', returnTo);
    const detailParams = new URL(detail, 'http://internal.local').searchParams;
    expect(safeListReturnTo(detailParams, ['/crp/admin'], '/crp/admin')).toBe(returnTo);

    for (const malicious of [
      'https://evil.example',
      '//evil.example',
      '/crp/developer',
      '/crp/admin?returnTo=/admin',
    ]) {
      expect(
        safeListReturnTo(
          new URLSearchParams({ returnTo: malicious }),
          ['/crp/admin'],
          '/crp/admin',
        ),
      ).toBe('/crp/admin');
    }
  });
});
