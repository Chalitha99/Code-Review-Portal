import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './common.js';
import { roleSchema } from './enums.js';

export const userRolesSchema = z
  .array(roleSchema)
  .min(1, 'Select at least one role')
  .refine((roles) => new Set(roles).size === roles.length, 'Roles must not be duplicated')
  .refine(
    (roles) => !roles.includes('SuperAdmin') || roles.length === 1,
    'Super Admin must be the only assigned role',
  );

/* -------------------------------------------------------------------------- */
/* User                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * A user as the server returns it. The write-side rules (at least one role,
 * Super Admin exclusive, email format) live on the input schemas: enforcing
 * them here let one non-conforming row reject the whole `GET /users` list.
 */
export const userSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  email: z.string().min(1),
  /** Additive — a user may be Developer AND Reviewer AND Admin at once. */
  roles: z.array(roleSchema),
  isActive: z.boolean(),
  createdAt: isoDateTimeSchema,
  /**
   * Local-auth invite state. Optional so a backend (or mock) that does not send
   * it still parses; the UI then falls back to `isActive`.
   */
  status: z.enum(['INVITED', 'ACTIVE', 'DEACTIVATED']).optional(),
  inviteExpiresAt: isoDateTimeSchema.nullable().optional(),
  inviteEmailStatus: z.enum(['SENT', 'FAILED']).nullable().optional(),
});
export type User = z.infer<typeof userSchema>;

/** The authenticated principal. Phase 1 mocks this; Phase 2 fills it from OIDC. */
export const currentUserSchema = userSchema.extend({
  /** Initials rendered in the header avatar chip. */
  initials: z.string().min(1).max(2),
});
export type CurrentUser = z.infer<typeof currentUserSchema>;

/** RFC 5321's limit on a forward path; anything longer cannot receive mail. */
export const MAX_EMAIL_LENGTH = 254;
const EMAIL_MESSAGE = 'Enter a valid email address, for example name@company.com';

/**
 * A work email as an admin types it: trimmed and lowercased, then checked for a
 * local part of letters, digits and `. _ ' + -`, one `@`, and a dotted domain
 * ending in a 2+ letter TLD (zod's email pattern). Lowercasing here means two
 * spellings of one address can never become two accounts.
 */
export const emailAddressSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(MAX_EMAIL_LENGTH, EMAIL_MESSAGE)
  .email(EMAIL_MESSAGE);

/** Admin "Add User" modal — screen 02. Creating a user also sends their invite. */
export const createUserInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  email: emailAddressSchema,
  roles: userRolesSchema,
  /** Required by policy when this request changes privileged access. */
  reason: z.string().trim().optional(),
});
export type CreateUserInput = z.infer<typeof createUserInputSchema>;

export const updateUserInputSchema = createUserInputSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserInputSchema>;

/* -------------------------------------------------------------------------- */
/* Customer                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * `code` is the short badge shown in grids and is the
 * prefix of every Task ID for that customer — see `taskCode` in task.ts.
 */
export const customerSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  code: z.string().min(1),
  description: z.string(),
  /** Hex colour chosen in the Add Customer modal (screen 03), used for the badge. */
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Colour must be a 6-digit hex value'),
  isActive: z.boolean(),
});
export type Customer = z.infer<typeof customerSchema>;

export const nextTaskIdSchema = z.object({
  taskCode: z.string().min(1),
  sequence: z.number().int().positive(),
});
export type NextTaskId = z.infer<typeof nextTaskIdSchema>;

export const createCustomerInputSchema = z.object({
  name: z.string().trim().min(1, 'Customer name is required'),
  description: z.string().trim().default(''),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Select a colour'),
});
export type CreateCustomerInput = z.infer<typeof createCustomerInputSchema>;

export const updateCustomerInputSchema = createCustomerInputSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateCustomerInput = z.infer<typeof updateCustomerInputSchema>;

/* -------------------------------------------------------------------------- */
/* Reviewer workload                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Why a reviewer cannot be deactivated, deleted or lose the Reviewer role yet.
 * Sent as `details` on a 409 `REVIEWER_HAS_PENDING_TASKS`; see
 * docs/25-review-assignment-rules.md.
 */
export const PENDING_REVIEW_KINDS = ['InReview', 'AwaitingResubmission', 'Handover'] as const;
export const pendingReviewTaskSchema = z.object({
  id: z.string().min(1),
  taskCode: z.string(),
  title: z.string(),
  status: z.string(),
  kind: z.enum(PENDING_REVIEW_KINDS),
});
export type PendingReviewTask = z.infer<typeof pendingReviewTaskSchema>;

export const reviewerPendingTasksDetailsSchema = z.object({
  tasks: z.array(pendingReviewTaskSchema),
});
