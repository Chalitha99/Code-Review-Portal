import { z } from 'zod';

/**
 * Primitives shared across every entity.
 *
 * Timestamps cross the wire as ISO-8601 strings, never as `Date`. JSON has no
 * date type, so a `Date` here would be a lie that only holds until the first
 * `JSON.parse`. Components convert at the edge with `formatters.ts`.
 */
export const isoDateTimeSchema = z.string().min(1);
export type IsoDateTime = z.infer<typeof isoDateTimeSchema>;

export const idSchema = z.string().min(1);
export type Id = z.infer<typeof idSchema>;

/** Envelope for every paginated list endpoint. */
export const paginationSchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(200),
  total: z.number().int().min(0),
});
export type Pagination = z.infer<typeof paginationSchema>;

export function paginatedSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    pagination: paginationSchema,
  });
}

export interface Paginated<T> {
  items: T[];
  pagination: Pagination;
}

/**
 * Error shape returned by every API failure. The frontend renders `message`
 * directly, so the backend must keep it human-readable and free of internals.
 * `fieldErrors` drives inline form errors without a second round-trip.
 */
export const apiErrorSchema = z.object({
  statusCode: z.number().int(),
  code: z.string(),
  message: z.string(),
  fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
  correlationId: z.string().optional(),
  /** Structured, code-specific context (e.g. the tasks blocking a deactivation). */
  details: z.unknown().optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
