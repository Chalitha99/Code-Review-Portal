import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './common.js';
import { checklistAnswerSchema, taskTypeIdSchema } from './enums.js';

/* -------------------------------------------------------------------------- */
/* Task type — an administered record                                          */
/* -------------------------------------------------------------------------- */

/**
 * One of Customization, Configuration, Lobby, Quick Report, Upgrade Service —
 * but as data, because an admin maintains the list.
 *
 * `isActive` rather than deletion for anything already used: a retired task type
 * must still resolve for the tasks that carry it, or their history stops
 * rendering.
 */
export const taskTypeRecordSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  order: z.number().int().min(0),
  isActive: z.boolean(),
});
export type TaskTypeRecord = z.infer<typeof taskTypeRecordSchema>;

/* -------------------------------------------------------------------------- */
/* Checklist template — the question bank                                      */
/* -------------------------------------------------------------------------- */

/** A question belongs to exactly one category. Its category owns applicability. */
export const checklistQuestionSchema = z.object({
  id: idSchema,
  categoryId: idSchema,
  text: z.string().min(1),
  order: z.number().int().min(0),
  isActive: z.boolean(),
});
export type ChecklistQuestion = z.infer<typeof checklistQuestionSchema>;

/**
 * A grouping label with an order — "Reservation", "Code", "Unit Testing".
 *
 * A category applies to one or more task types. Every active question in it
 * inherits that applicability.
 *
 * The specification calls this a "section"; the business calls it a Category and
 * administers it. Same concept, and the wizard keeps the wireframe's
 * "Section progress" heading.
 */
export const checklistCategorySchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  order: z.number().int().min(0),
  isActive: z.boolean(),
  applicableTaskTypeIds: z.array(taskTypeIdSchema).min(1),
  questions: z.array(checklistQuestionSchema),
});
export type ChecklistCategory = z.infer<typeof checklistCategorySchema>;

/* -------------------------------------------------------------------------- */
/* Administering the template — the Admin ▸ Quality Checklist tab              */
/* -------------------------------------------------------------------------- */

/**
 * Inputs for the admin CRUD over task types, categories and questions.
 *
 * Not in SPL-OPS-FO-001: the specification has no admin screen for the
 * checklist, and the only mention of configurability is the *other* document's
 * §10 Future Roadmap — "allow checklist questions/sections to be configured per
 * customer without code changes". The business pulled that item into scope, so
 * it is built. Worth stating plainly because it turns a compile-time constant
 * into runtime data, which is a larger change than it looks.
 *
 * Categories and questions may be appended by their creation endpoints. Task
 * type order is deliberately excluded: it is managed only by the full-list
 * reorder endpoint, which keeps the sequence dense and unique.
 */

export const createTaskTypeInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
});
export type CreateTaskTypeInput = z.infer<typeof createTaskTypeInputSchema>;

export const updateTaskTypeInputSchema = createTaskTypeInputSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateTaskTypeInput = z.infer<typeof updateTaskTypeInputSchema>;

export const createChecklistCategoryInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  applicableTaskTypeIds: z.array(taskTypeIdSchema).min(1, 'Select at least one task type'),
  order: z.number().int().min(0).optional(),
});
export type CreateChecklistCategoryInput = z.infer<typeof createChecklistCategoryInputSchema>;

export const updateChecklistCategoryInputSchema = createChecklistCategoryInputSchema
  .partial()
  .extend({ isActive: z.boolean().optional() });
export type UpdateChecklistCategoryInput = z.infer<typeof updateChecklistCategoryInputSchema>;

/**
 * What to do when the requested `order` is already taken in the category.
 *
 * `order` is unique only by convention, and only within a category. Before this
 * existed a second question could silently claim an occupied slot, leaving two
 * rows with the same number and an admin grid whose sort order depended on
 * insertion order.
 *
 * Absent means "the caller did not know there was a collision" — the server
 * answers 409 rather than guessing, and the client asks. That is the same
 * gate-in-two-places rule the status machine follows: the UI can check first,
 * but the server decides.
 */
export const DUPLICATE_ORDER_STRATEGIES = ['replace', 'shift'] as const;
export const duplicateOrderStrategySchema = z.enum(DUPLICATE_ORDER_STRATEGIES);
export type DuplicateOrderStrategy = z.infer<typeof duplicateOrderStrategySchema>;

export const createChecklistQuestionInputSchema = z.object({
  categoryId: idSchema.min(1, 'Select a category'),
  text: z.string().trim().min(1, 'Enter the question'),
  order: z.number().int().min(0).optional(),
  /** Only meaningful alongside an explicit `order`. See the enum above. */
  onDuplicateOrder: duplicateOrderStrategySchema.optional(),
});
export type CreateChecklistQuestionInput = z.infer<typeof createChecklistQuestionInputSchema>;

export const updateChecklistQuestionInputSchema = createChecklistQuestionInputSchema
  .partial()
  .extend({ isActive: z.boolean().optional() });
export type UpdateChecklistQuestionInput = z.infer<typeof updateChecklistQuestionInputSchema>;

/**
 * The final sequence of an administered list, after a drag reorder.
 *
 * ONE schema for all three lists — a category's questions, the categories, and
 * the task types. They differ only in which collection the ids belong to, which
 * is carried by the URL, so three near-identical schemas would be three places
 * for the same rule to drift.
 *
 * Ids only, in order — deliberately NOT `{ id, order }` pairs. The order values
 * are derived from the array position on the server, which makes a duplicate or
 * a negative `order` unrepresentable rather than something to validate and
 * reject. The remaining validation is a set comparison: the ids must be exactly
 * the collection's records, so a client that sent only the rows on its current
 * page renumbers nothing.
 *
 * One request for the whole list, not one per moved row. A drag session produces
 * many intermediate arrangements and only the last one is worth persisting;
 * sending each would multiply the writes, the failure modes and the chances of
 * two admins interleaving.
 */
export const reorderInputSchema = z.object({
  ids: z.array(idSchema).min(1, 'Send every record in its new order'),
});
export type ReorderInput = z.infer<typeof reorderInputSchema>;

/* -------------------------------------------------------------------------- */
/* Filled checklist — the developer's submission                               */
/* -------------------------------------------------------------------------- */

/**
 * One answer, carrying a snapshot of what was asked.
 *
 * `questionText` and `categoryName` are copied in at save time rather than
 * joined from the template at read time. Once an admin can reword or retire a
 * question, a reference-only record would silently rewrite what a past reviewer
 * appears to have approved, and a deleted question would make rows vanish from
 * a completed review. This checklist IS the quality gate, so the record has to
 * stay faithful to the moment it was signed off.
 *
 * It also means a stored checklist renders on its own, with no template lookup.
 */
export const checklistAnswerEntrySchema = z.object({
  questionId: idSchema,
  answer: checklistAnswerSchema,
  /** Wording as shown to the developer. Never re-read from the template. */
  questionText: z.string().min(1),
  categoryName: z.string().min(1),
  /** Preserves the order the questions were presented in. */
  order: z.number().int().min(0),
});
export type ChecklistAnswerEntry = z.infer<typeof checklistAnswerEntrySchema>;

const uniqueTaskTypeIdsSchema = z
  .array(taskTypeIdSchema)
  .refine((ids) => new Set(ids).size === ids.length, 'Task types must not be duplicated');

const checklistAnswerEntriesSchema = z
  .array(checklistAnswerEntrySchema)
  .refine(
    (answers) => new Set(answers.map((entry) => entry.questionId)).size === answers.length,
    'Questions must not be answered more than once',
  );

export const taskChecklistSchema = z.object({
  id: idSchema,
  taskId: idSchema,
  /*
   * An incomplete draft may intentionally have no task type yet. The submit
   * gate still requires at least one; the persisted draft shape must not, or
   * "Save Draft" would enforce a later-step completion rule.
   */
  taskTypeIds: uniqueTaskTypeIdsSchema,
  answers: checklistAnswerEntriesSchema,
  remarks: z.string(),
  isComplete: z.boolean(),
  checkedDate: isoDateTimeSchema,
  developerId: idSchema,
});
export type TaskChecklist = z.infer<typeof taskChecklistSchema>;

/** An immutable, self-contained checklist captured at submit time. */
export const checklistSubmissionSchema = z.object({
  id: idSchema,
  taskId: idSchema,
  version: z.number().int().min(1),
  submittedAt: isoDateTimeSchema,
  developerId: idSchema,
  taskTypes: z.array(z.object({ id: idSchema, name: z.string().min(1) })),
  categories: z.array(
    z.object({
      categoryId: idSchema,
      categoryName: z.string().min(1),
      categoryOrder: z.number().int().min(0),
      questions: z.array(
        z.object({
          questionId: idSchema,
          questionText: z.string().min(1),
          questionOrder: z.number().int().min(0),
          answer: checklistAnswerSchema,
        }),
      ),
    }),
  ),
  remarks: z.string(),
});
export type ChecklistSubmission = z.infer<typeof checklistSubmissionSchema>;

/**
 * What the developer submits from wizard step 2.
 *
 * The client sends only ids and answers; the server resolves the wording from
 * the template and writes the snapshot. Accepting `questionText` from the client
 * would let a developer store a different question from the one they answered.
 *
 * Completeness is NOT asserted here — "every rendered question answered" depends
 * on which questions the selected Task Types render, which this schema cannot
 * see. That rule lives in the domain layer (`answersComplete()`), so the error
 * message stays the one the spec mandates (FL 2.6-02).
 */
export const checklistDraftSchema = z.object({
  // Empty is valid for a draft. `isComplete` remains false until a type and all
  // of its applicable answers exist, and submission enforces that result.
  taskTypeIds: uniqueTaskTypeIdsSchema,
  answers: z
    .array(
      z.object({
        questionId: idSchema,
        answer: checklistAnswerSchema,
      }),
    )
    .refine(
      (answers) => new Set(answers.map((entry) => entry.questionId)).size === answers.length,
      'Questions must not be answered more than once',
    ),
  remarks: z.string().trim().default(''),
});
export type ChecklistDraft = z.infer<typeof checklistDraftSchema>;

/* -------------------------------------------------------------------------- */
/* Derived progress — powers the "Section progress" panel on screen 23         */
/* -------------------------------------------------------------------------- */

export interface ChecklistCategoryProgress {
  categoryId: string;
  categoryName: string;
  answered: number;
  total: number;
  isComplete: boolean;
}

export interface ChecklistProgress {
  categories: ChecklistCategoryProgress[];
  answered: number;
  total: number;
  isComplete: boolean;
  /** Count of "No" answers — surfaced as the "N Issue Found" badge on screen 24. */
  issueCount: number;
}
