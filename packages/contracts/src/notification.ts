import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './common.js';

/**
 * In-app notifications behind the header bell (badge shows "9+" in the
 * wireframes). Mirrors the four email events the spec defines: approval,
 * changes requested, resubmission, handover.
 */
export const NOTIFICATION_KINDS = [
  'TaskApproved',
  'ChangesRequested',
  'TaskResubmitted',
  'TaskSubmitted',
  'TaskAssigned',
  'TaskReassigned',
  'TaskHandedOver',
  'TaskCancelled',
] as const;
export const notificationKindSchema = z.enum(NOTIFICATION_KINDS);
export type NotificationKind = z.infer<typeof notificationKindSchema>;

export const notificationSchema = z.object({
  id: idSchema,
  kind: notificationKindSchema,
  title: z.string().min(1),
  body: z.string(),
  /** Deep link into the relevant task — the same scheme the emails use. */
  href: z.string().min(1),
  taskId: idSchema.nullable(),
  isRead: z.boolean(),
  createdAt: isoDateTimeSchema,
});
export type Notification = z.infer<typeof notificationSchema>;
