import { describe, expect, it } from 'vitest';
import type { HandoverStatus } from '@sdp/contracts';
import {
  EMPTY_HANDOVER_FILTERS,
  filterHandovers,
  isHandoverFiltered,
  readHandoverFilters,
  writeHandoverFilters,
  type FilterableHandover,
  type HandoverFilters,
} from '@/portals/code-review/features/admin/components/handoverFilters.ts';

const NOW = new Date('2026-09-28T12:00:00.000Z');

function row(
  id: string,
  status: HandoverStatus,
  overrides: Partial<FilterableHandover> = {},
): FilterableHandover & { id: string } {
  return {
    id,
    taskCode: `AIM-${id}`,
    taskTitle: `Task ${id}`,
    crimId: id,
    customerId: 'customer-a',
    fromReviewerId: 'reviewer-a',
    fromReviewerName: 'Kavindu Perera',
    reason: 'Needs domain knowledge',
    status,
    createdAt: '2026-09-28T08:00:00.000Z',
    ...overrides,
  };
}

const rows = [
  row('101', 'Pending'),
  row('102', 'Reassigned', {
    taskTitle: 'Reservation customization',
    crimId: 'CRIM-778',
    fromReviewerId: 'reviewer-b',
    fromReviewerName: 'Nimali Silva',
    reason: 'Annual leave coverage',
    customerId: 'customer-b',
    createdAt: '2026-09-24T08:00:00.000Z',
  }),
  row('103', 'ReturnedToQueue', { createdAt: '2026-09-10T08:00:00.000Z' }),
  row('104', 'Cancelled', { createdAt: '2026-07-10T08:00:00.000Z' }),
];

function withFilters(overrides: Partial<HandoverFilters>): HandoverFilters {
  return { ...EMPTY_HANDOVER_FILTERS, ...overrides };
}

describe('handover filters', () => {
  it.each([
    ['task ID', 'AIM-102'],
    ['title', 'reservation'],
    ['CRIM ID', 'crim-778'],
    ['reviewer', 'nimali'],
    ['reason', 'annual leave'],
  ])('searches by %s case-insensitively', (_label, search) => {
    expect(filterHandovers(rows, withFilters({ search }), NOW).map((item) => item.id)).toEqual([
      '102',
    ]);
  });

  it.each([
    ['Pending', '101'],
    ['Reassigned', '102'],
    ['ReturnedToQueue', '103'],
    ['Cancelled', '104'],
  ] as const)('filters the %s lifecycle status exactly', (status, id) => {
    expect(filterHandovers(rows, withFilters({ status }), NOW).map((item) => item.id)).toEqual([
      id,
    ]);
  });

  it('filters by the reviewer who initiated the handover', () => {
    expect(
      filterHandovers(rows, withFilters({ reviewerId: 'reviewer-b' }), NOW).map((item) => item.id),
    ).toEqual(['102']);
  });

  it.each([
    ['today', ['101']],
    ['7d', ['101', '102']],
    ['30d', ['101', '102', '103']],
  ] as const)('filters raised dates for %s', (dateRange, ids) => {
    expect(filterHandovers(rows, withFilters({ dateRange }), NOW).map((item) => item.id)).toEqual(
      ids,
    );
  });

  it('filters by related task customer', () => {
    expect(
      filterHandovers(rows, withFilters({ customerId: 'customer-b' }), NOW).map((item) => item.id),
    ).toEqual(['102']);
  });

  it('combines every filter with AND semantics', () => {
    expect(
      filterHandovers(
        rows,
        withFilters({
          search: 'leave',
          status: 'Reassigned',
          reviewerId: 'reviewer-b',
          dateRange: '7d',
          customerId: 'customer-b',
        }),
        NOW,
      ).map((item) => item.id),
    ).toEqual(['102']);
  });

  it('reads supported URL values and normalizes invalid enum/date values', () => {
    expect(
      readHandoverFilters(
        new URLSearchParams(
          'search=leave&status=Reassigned&handedOverBy=reviewer-b&raised=7d&customer=customer-b',
        ),
      ),
    ).toEqual(
      withFilters({
        search: 'leave',
        status: 'Reassigned',
        reviewerId: 'reviewer-b',
        dateRange: '7d',
        customerId: 'customer-b',
      }),
    );
    expect(readHandoverFilters(new URLSearchParams('status=Unknown&raised=year'))).toEqual(
      EMPTY_HANDOVER_FILTERS,
    );
  });

  it('writes filters without removing pagination size or sorting', () => {
    const params = new URLSearchParams('page=3&pageSize=25&sort=createdAt:desc');
    writeHandoverFilters(params, withFilters({ status: 'Pending', dateRange: '30d' }));
    expect(params.get('status')).toBe('Pending');
    expect(params.get('raised')).toBe('30d');
    expect(params.get('pageSize')).toBe('25');
    expect(params.get('sort')).toBe('createdAt:desc');
  });

  it('recognizes the reset state', () => {
    expect(isHandoverFiltered(EMPTY_HANDOVER_FILTERS)).toBe(false);
    expect(isHandoverFiltered(withFilters({ search: 'AIM' }))).toBe(true);
    expect(filterHandovers(rows, EMPTY_HANDOVER_FILTERS, NOW)).toEqual(rows);
  });
});
