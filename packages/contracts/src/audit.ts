import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './common.js';

export const AUDIT_ACTION_TYPES = [
  'USER_CREATED',
  'USER_UPDATED',
  'USER_ACTIVATED',
  'USER_DEACTIVATED',
  'USER_DELETED',
  'ROLE_GRANTED',
  'ROLE_REMOVED',
  'ROLES_CHANGED',
  'SUPER_ADMIN_TRANSFERRED',
  'CUSTOMER_CREATED',
  'CUSTOMER_UPDATED',
  'CUSTOMER_ACTIVATED',
  'CUSTOMER_DEACTIVATED',
  'CUSTOMER_DELETED',
  'TASK_CREATED',
  'TASK_SUBMITTED',
  'TASK_RESUBMITTED',
  'TASK_PICKED',
  'REVIEWER_ASSIGNED',
  'REVIEWER_REASSIGNED',
  'REVIEW_STARTED',
  'CHANGES_REQUESTED',
  'TASK_APPROVED',
  'REVIEW_RANK_CHANGED',
  'ISSUE_RESOLVED',
  'ISSUE_REJECTED',
  'DEVELOPER_REJECTION_ACCEPTED',
  'DEVELOPER_REJECTION_REJECTED',
  'TASK_HANDOVER',
  'HANDOVER_REASSIGNED',
  'TASK_CANCELLED',
  'TASK_DELETED',
  'CHECKLIST_COMPLETED',
  'TASK_STATUS_CHANGED',
  'TASK_DELIVERED',
] as const;
export const auditActionTypeSchema = z.enum(AUDIT_ACTION_TYPES);
export type AuditActionType = z.infer<typeof auditActionTypeSchema>;

export const AUDIT_ENTITY_TYPES = [
  'USER',
  'ROLE',
  'CUSTOMER',
  'TASK',
  'REVIEW',
  'REVIEW_FINDING',
  'HANDOVER',
  'CHECKLIST',
] as const;
export const auditEntityTypeSchema = z.enum(AUDIT_ENTITY_TYPES);
export type AuditEntityType = z.infer<typeof auditEntityTypeSchema>;

const jsonValueSchema = z.json();

export const auditLogSchema = z.object({
  id: idSchema,
  timestamp: isoDateTimeSchema,
  actorUserId: idSchema.nullable(),
  actorName: z.string(),
  actorRole: z.string(),
  // Keep historical/custom action names readable even when they predate this catalogue.
  actionType: z.string().min(1),
  entityType: z.string().min(1),
  entityId: z.string().nullable(),
  description: z.string(),
  oldValue: jsonValueSchema.nullable(),
  newValue: jsonValueSchema.nullable(),
  taskId: idSchema.nullable(),
  targetUserId: idSchema.nullable(),
  metadata: jsonValueSchema.nullable(),
});
export type AuditLog = z.infer<typeof auditLogSchema>;

export const auditLogPageSchema = z.object({
  items: z.array(auditLogSchema),
  pagination: z.object({
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    total: z.number().int().min(0),
    totalPages: z.number().int().min(0),
  }),
});
export type AuditLogPage = z.infer<typeof auditLogPageSchema>;
