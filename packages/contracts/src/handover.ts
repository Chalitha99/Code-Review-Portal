import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './common.js';
import { handoverStatusSchema } from './enums.js';
import { reviewDraftSchema } from './review.js';

/**
 * Handover — spec §1.5 p.12.
 *
 * ⚠️ This entity has no Figma screen and no development-spec section; the UI is
 * our design (plan §1.3). Treat the shape as provisional until reviewed.
 *
 * Flow: a reviewer who cannot finish clicks Handover with a reason → the task
 * appears in the Admin "Handovers" tab and the admin is emailed → the admin
 * reassigns it to another reviewer, which moves it to that reviewer's My Review
 * Tasks and clears it from the handover queue.
 */
export const handoverSchema = z.object({
  id: idSchema,
  taskId: idSchema,
  fromReviewerId: idSchema,
  fromReviewerName: z.string(),
  reason: z.string().min(1),
  status: handoverStatusSchema,
  /** Populated once an admin reassigns the task. */
  reassignedToId: idSchema.nullable(),
  reassignedToName: z.string().nullable(),
  reassignedById: idSchema.nullable(),
  createdAt: isoDateTimeSchema,
  resolvedAt: isoDateTimeSchema.nullable(),
});
export type Handover = z.infer<typeof handoverSchema>;

export const createHandoverInputSchema = z.object({
  reason: z.string().trim().min(1, 'Please provide a reason for handing over this review.'),
  draft: reviewDraftSchema.optional(),
});
export type CreateHandoverInput = z.infer<typeof createHandoverInputSchema>;

export const reassignHandoverInputSchema = z.object({
  reviewerId: idSchema.min(1, 'Select a reviewer'),
});
export type ReassignHandoverInput = z.infer<typeof reassignHandoverInputSchema>;
