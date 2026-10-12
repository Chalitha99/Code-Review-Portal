import { describe, expect, it } from 'vitest';
import { TASK_STATUSES, type TaskStatus } from '@sdp/contracts';
import { BUCKET_PARAM, KPI_BUCKETS, bucketStatuses, isKpiBucket } from '@/lib/kpiBuckets.ts';

/**
 * The dashboard counters and the grids they filter must agree, and these are the
 * definitions both read. A wrong entry here does not throw — it produces a card
 * that says 7 and opens a grid of 5, which is the kind of defect a user reports
 * as "the numbers are wrong" months later.
 */

describe('KPI_BUCKETS', () => {
  it('only names statuses the domain actually has', () => {
    // Guards against a typo (`"Resubmitted"` for `"ReSubmitted"`) silently
    // producing a bucket that matches no task at all.
    for (const statuses of Object.values(KPI_BUCKETS)) {
      for (const status of statuses) {
        expect(TASK_STATUSES).toContain(status);
      }
    }
  });

  it('keeps the developer and admin submitted counters distinct', () => {
    /*
     * These two look like duplicates and are not, so the distinction is asserted
     * rather than left to the comment.
     *
     * To a developer, "Submitted" means everything handed over and no longer
     * theirs to edit; to an admin it is the literal status, because the admin
     * row shows In Review separately beside it.
     */
    expect(KPI_BUCKETS.submitted).toEqual(['Submitted']);
    expect(KPI_BUCKETS.awaitingReview).toEqual(['Submitted', 'ReSubmitted', 'InReview']);
  });

  it('maps the approved bucket to Approved', () => {
    expect(KPI_BUCKETS.approved).toEqual(['Approved']);
  });

  it('never claims a task is in two buckets that sit side by side on one dashboard', () => {
    // The admin row shows draft / submitted / inReview / changesRequested /
    // approved together; if any status appeared twice, one task would be counted
    // twice in the same row.
    const adminRow = ['draft', 'submitted', 'inReview', 'changesRequested', 'approved'] as const;
    const seen = new Set<TaskStatus>();

    for (const bucket of adminRow) {
      for (const status of KPI_BUCKETS[bucket]) {
        expect(seen.has(status)).toBe(false);
        seen.add(status);
      }
    }
  });
});

describe('isKpiBucket', () => {
  it('accepts every declared bucket', () => {
    for (const key of Object.keys(KPI_BUCKETS)) {
      expect(isKpiBucket(key)).toBe(true);
    }
  });

  it('rejects anything else, including absent values', () => {
    // A hand-edited URL must not be able to empty a grid.
    expect(isKpiBucket('all')).toBe(false);
    expect(isKpiBucket('Draft')).toBe(false);
    expect(isKpiBucket('')).toBe(false);
    expect(isKpiBucket(null)).toBe(false);
    expect(isKpiBucket(undefined)).toBe(false);
  });

  it('rejects inherited Object properties', () => {
    // `Object.hasOwn`, not `in`: `'toString' in KPI_BUCKETS` is true, and would
    // have made `?bucket=toString` a bucket whose statuses are a function.
    expect(isKpiBucket('toString')).toBe(false);
    expect(isKpiBucket('constructor')).toBe(false);
  });
});

describe('bucketStatuses', () => {
  it('returns the statuses for a known bucket', () => {
    expect(bucketStatuses('changesRequested')).toEqual(['ChangesRequested']);
  });

  it('returns null for anything unrecognised, so callers filter nothing', () => {
    expect(bucketStatuses('all')).toBeNull();
    expect(bucketStatuses(null)).toBeNull();
  });
});

describe('BUCKET_PARAM', () => {
  it('is the key the cards write and the grids read', () => {
    // Asserted because the two sides live in different components and a rename
    // on one of them would otherwise fail silently.
    expect(BUCKET_PARAM).toBe('bucket');
  });
});
