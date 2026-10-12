import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './common.js';

export const SYSTEM_AUDIT_ACTIONS = [
  'AdminGranted',
  'AdminRevoked',
  'SuperAdminGranted',
  'SuperAdminRevoked',
  'PrivilegedUserActivated',
  'PrivilegedUserDeactivated',
  'UserDeleted',
  /** An invite withdrawn before the user ever signed in (temporary local auth). */
  'InviteRevoked',
  'TaskDeleted',
  'CustomerDeleted',
] as const;

export const systemAuditActionSchema = z.enum(SYSTEM_AUDIT_ACTIONS);
export type SystemAuditAction = z.infer<typeof systemAuditActionSchema>;

export const systemAuditEventSchema = z.object({
  id: idSchema,
  action: systemAuditActionSchema,
  actorId: idSchema,
  actorName: z.string().min(1),
  targetType: z.enum(['User', 'Task', 'Customer']),
  targetId: idSchema,
  targetLabel: z.string().min(1),
  reason: z.string().min(1),
  occurredAt: isoDateTimeSchema,
});
export type SystemAuditEvent = z.infer<typeof systemAuditEventSchema>;
