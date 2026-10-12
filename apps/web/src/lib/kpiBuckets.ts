import type { TaskStatus } from '@sdp/contracts';

/**
 * What each dashboard counter counts.
 *
 * Operational Admin summary concepts:
 * - Total Tasks (all non-Draft tasks visible to Admin)
 * - Awaiting Review (Submitted + ReSubmitted)
 * - In Review (InReview)
 * - Changes Requested (ChangesRequested)
 * - Approved (Approved)
 * - Cancelled (Cancelled)
 *
 * Developer concepts:
 * - Draft
 * - Awaiting Review (Submitted + ReSubmitted + InReview)
 * - Changes Requested
 * - Approved
 */
export const KPI_BUCKETS = {
  draft: ['Draft'],
  submitted: ['Submitted'],
  awaitingReview: ['Submitted', 'ReSubmitted', 'InReview'],
  awaitingReviewAdmin: ['Submitted', 'ReSubmitted'],
  inReview: ['InReview'],
  changesRequested: ['ChangesRequested'],
  approved: ['Approved'],
  cancelled: ['Cancelled'],
} as const satisfies Record<string, readonly TaskStatus[]>;

export type KpiBucket = keyof typeof KPI_BUCKETS;

/** The query-string key the dashboard cards write and the grids read. */
export const BUCKET_PARAM = 'bucket';

export function isKpiBucket(value: string | null | undefined): value is KpiBucket {
  return typeof value === 'string' && Object.hasOwn(KPI_BUCKETS, value);
}

/** Statuses for a bucket, or `null` when the value is not a bucket at all. */
export function bucketStatuses(value: string | null | undefined): readonly TaskStatus[] | null {
  return isKpiBucket(value) ? KPI_BUCKETS[value] : null;
}

export const BUCKET_TO_STATUS: Record<KpiBucket, TaskStatus> = {
  draft: 'Draft',
  submitted: 'Submitted',
  awaitingReview: 'Submitted',
  awaitingReviewAdmin: 'Submitted',
  inReview: 'InReview',
  changesRequested: 'ChangesRequested',
  approved: 'Approved',
  cancelled: 'Cancelled',
};

export const STATUS_TO_BUCKET: Partial<Record<TaskStatus, KpiBucket>> = {
  Draft: 'draft',
  Submitted: 'submitted',
  ChangesRequested: 'changesRequested',
  Approved: 'approved',
  Cancelled: 'cancelled',
};
