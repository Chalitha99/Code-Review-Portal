import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './common.js';
import { prioritySchema, taskStatusSchema, taskTypeIdSchema, MAX_VERSION_CHARS } from './enums.js';

/* -------------------------------------------------------------------------- */
/* Task                                                                        */
/* -------------------------------------------------------------------------- */

const taskShape = {
  id: idSchema,

  /**
   * Human-facing identifier, e.g. "CUSTOMER-01". Format is
   * `<normalized customer name>-<zero-padded per-customer sequence>`.
   * Generated server-side inside the create transaction — never by the client,
   * because the sequence is a shared counter (plan risk R2).
   */
  taskCode: z.string().min(1),

  /** Derived: `Customer – CRIM ID – Version` (FL 2.5-01). Never user-editable. */
  title: z.string().min(1),

  crimId: z.string().min(1),
  version: z.string().max(MAX_VERSION_CHARS).nullable(),

  customerId: idSchema,
  priority: prioritySchema,
  status: taskStatusSchema,

  /** Number of persisted business cycles whose `counted` flag is true. */
  reviewCycle: z.number().int().min(0).optional(),

  /** Monotonic immutable review round (zero until a reviewer starts reviewing). */
  historicalCycle: z.number().int().min(0).optional(),

  /** The actual chronological / historical review attempt sequence (monotonic, never decrements). Zero until a reviewer starts reviewing. */
  reviewRound: z.number().int().min(0).default(0),

  /** Presentation alias for `reviewCycle`; kept synchronized at the contract boundary. */
  countedCycle: z.number().int().min(0).default(0),

  /** Tracks which historical review rounds have received an accepted-rejection decrement (idempotency). */
  adjustedCycles: z.array(z.number().int()).default([]),

  developerId: idSchema,
  /** Null until a reviewer picks the task from the Available queue. */
  reviewerId: idSchema.nullable(),
  /** The currently active review ownership session ID (null when handed over / open). */
  currentReviewSessionId: idSchema.optional().nullable(),

  /** Task type IDS selected on the checklist screen; drive which questions render. */
  taskTypeIds: z.array(taskTypeIdSchema),

  /** Gates the Submit for Review action (FL 2.2-03). */
  isChecklistComplete: z.boolean(),

  /** Set when a reviewer hands the task back to the admin pool (spec p.12). */
  isHandedOver: z.boolean(),

  /**
   * Optional free text the developer writes for the reviewer on submission
   * (screen 24, "Note to Reviewer").
   *
   * Distinct from the checklist's Additional Remarks: remarks explain the
   * answers, this explains the submission. Untrusted text — rendered escaped,
   * never as HTML.
   */
  noteToReviewer: z.string().nullable(),

  createdAt: isoDateTimeSchema,
  submittedAt: isoDateTimeSchema.nullable(),
  updatedAt: isoDateTimeSchema,
} as const;

function normalizeTaskCycles(input: unknown): unknown {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return input;

  const task = input as Record<string, unknown>;
  const reviewCycle = task['countedCycle'] ?? task['reviewCycle'] ?? 0;
  const historicalCycle = task['reviewRound'] ?? task['historicalCycle'] ?? reviewCycle;
  return {
    ...task,
    reviewCycle,
    historicalCycle,
    reviewRound: historicalCycle,
    countedCycle: reviewCycle,
  };
}

export const taskSchema = z.preprocess(normalizeTaskCycles, z.object(taskShape));
export type Task = z.infer<typeof taskSchema>;

/**
 * A task joined with the display fields every grid needs. Returned by list
 * endpoints so the frontend never has to fan out N+1 lookups to render a row.
 */
export const taskListItemSchema = z.preprocess(
  normalizeTaskCycles,
  z.object({
    ...taskShape,
    /** Previous reviewer shown beside tasks that have been handed over. */
    handedOverByName: z.string().nullable().optional(),
    customerName: z.string(),
    customerCode: z.string(),
    customerColor: z.string(),
    developerName: z.string(),
    reviewerName: z.string().nullable(),
  }),
);
export type TaskListItem = z.infer<typeof taskListItemSchema>;

export const nextTaskVersionSchema = z.object({
  version: z.number().int().min(0),
  title: z.string().min(1),
});
export type NextTaskVersion = z.infer<typeof nextTaskVersionSchema>;

export function deriveTaskTitle(
  customerCode: string,
  crimId: string,
  version?: string | number | null,
): string {
  const parts = [customerCode.trim(), crimId.trim()];
  const normalizedVersion = version === null || version === undefined ? '' : String(version).trim();
  if (normalizedVersion !== '') parts.push(normalizedVersion);
  return parts.join('-');
}

/* -------------------------------------------------------------------------- */
/* Create / update input                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The ONE schema both New Review Task flows validate against — the single-page
 * form (screen 15) and the 3-step wizard (screens 22–25). Plan §4.3: keeping
 * this shared is what stops the two flows drifting apart (risk R1).
 *
 * Note `title` and `taskCode` are absent: both are derived, not entered.
 */
export const taskDraftSchema = z.object({
  customerId: idSchema.min(1, 'Select a customer'),
  crimId: z.string().trim().min(1, 'Enter the CRIM ID'),
  version: z
    .string()
    .trim()
    .max(MAX_VERSION_CHARS, `Version must be ${MAX_VERSION_CHARS} characters or fewer`)
    .optional(),
  priority: prioritySchema,
  /** Written on the review step; absent while the task is still being drafted. */
  noteToReviewer: z.string().trim().optional(),
});
export type TaskDraft = z.infer<typeof taskDraftSchema>;

export const updateTaskInputSchema = taskDraftSchema.partial();
export type UpdateTaskInput = z.infer<typeof updateTaskInputSchema>;

/* -------------------------------------------------------------------------- */
/* Query / filter input                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Backs the filter bars on My Tasks (16), Available Tasks (07), My Review Tasks
 * (08), Review History (09) and Admin Tasks (01). Each surface passes a subset;
 * unknown-to-that-surface keys are simply omitted.
 */
export const taskFilterSchema = z.object({
  /** Free-text across Task ID, Title and CRIM ID (spec §2.7.3). */
  search: z.string().trim().optional(),
  status: z.array(taskStatusSchema).optional(),
  priority: z.array(prioritySchema).optional(),
  customerId: z.array(idSchema).optional(),
  developerId: z.array(idSchema).optional(),
  reviewerId: z.array(idSchema).optional(),
  reviewRound: z.array(z.number().int()).optional(),
  countedCycle: z.array(z.number().int()).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(25),
  sortBy: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});
export type TaskFilter = z.infer<typeof taskFilterSchema>;

/* -------------------------------------------------------------------------- */
/* Task event — the append-only audit trail behind round history (screen 14)   */
/* and the "log of which reviewers worked on the task" the spec asks for (p.10)*/
/* -------------------------------------------------------------------------- */

export const TASK_EVENT_KINDS = [
  'Created',
  'Submitted',
  'Picked',
  'ReviewDraftSaved',
  'Approved',
  'ChangesRequested',
  'Resubmitted',
  'HandedOver',
  'Reassigned',
  'ReturnedToQueue',
  'Cancelled',
  'ReviewerAssigned',
  'CountedCycleAdjusted',
] as const;
export const taskEventKindSchema = z.enum(TASK_EVENT_KINDS);
export type TaskEventKind = z.infer<typeof taskEventKindSchema>;

function normalizeReviewRound(input: unknown): unknown {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return input;
  const value = input as Record<string, unknown>;
  return { ...value, reviewRound: value['reviewRound'] ?? value['reviewCycle'] ?? 1 };
}

export const taskEventSchema = z.preprocess(
  normalizeReviewRound,
  z.object({
    id: idSchema,
    taskId: idSchema,
    kind: taskEventKindSchema,
    /** Review round the event belongs to, so history can be grouped by round. */
    reviewRound: z.number().int().min(1),
    actorId: idSchema,
    actorName: z.string(),
    note: z.string().nullable(),
    occurredAt: isoDateTimeSchema,
    qualifyingReviewRound: z.number().int().min(1).optional(),
    previousCountedCycle: z.number().int().min(1).optional(),
    newCountedCycle: z.number().int().min(0).optional(),
    adjustmentAmount: z.number().int().min(1).optional(),
    reason: z.string().optional(),
  }),
);
export type TaskEvent = z.infer<typeof taskEventSchema>;

/* -------------------------------------------------------------------------- */
/* Attachments — supporting images the DEVELOPER adds to a submission          */
/* -------------------------------------------------------------------------- */

/**
 * An image the developer attaches when submitting.
 *
 * Distinct from `ReviewScreenshot`, which is the REVIEWER's evidence for a
 * finding. These are the developer's own supporting material — a screen showing
 * the feature working, a before/after — and are entirely optional: a submission
 * with none is perfectly valid, so nothing here gates the submit action.
 *
 * `storageRef` is opaque. Phase 1 holds a data URL in the mock store; Phase 2
 * uploads through NestJS to the customer's SharePoint document library and keeps
 * only the Graph item id, so the browser never handles a storage URL directly
 * (plan §2.8).
 */
export const taskAttachmentSchema = z.object({
  id: idSchema,
  taskId: idSchema,
  fileName: z.string().min(1),
  sizeBytes: z.number().int().min(0),
  mimeType: z.string().min(1),
  storageRef: z.string().min(1),
  /** Optional note explaining what the image shows. */
  caption: z.string(),
  uploadedById: idSchema,
  uploadedAt: isoDateTimeSchema,
});
export type TaskAttachment = z.infer<typeof taskAttachmentSchema>;
