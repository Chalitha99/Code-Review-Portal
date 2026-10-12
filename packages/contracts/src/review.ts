import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './common.js';
import {
  generalCheckAnswerSchema,
  issueResponseSchema,
  rejectionVerdictSchema,
  reviewDecisionSchema,
  reviewRankSchema,
  MAX_FEEDBACK_SUMMARY_CHARS,
} from './enums.js';

/* -------------------------------------------------------------------------- */
/* General Check — spec §3.1, 13 fixed questions                               */
/* -------------------------------------------------------------------------- */

export const generalCheckQuestionSchema = z.object({
  id: idSchema,
  text: z.string().min(1),
  order: z.number().int().min(0),
});
export type GeneralCheckQuestion = z.infer<typeof generalCheckQuestionSchema>;

export const generalCheckEntrySchema = z.object({
  questionId: idSchema,
  answer: generalCheckAnswerSchema,
});
export type GeneralCheckEntry = z.infer<typeof generalCheckEntrySchema>;

/* -------------------------------------------------------------------------- */
/* Screenshots — spec §2.9.2.6                                                 */
/* -------------------------------------------------------------------------- */

export const reviewScreenshotSchema = z.object({
  id: idSchema,
  fileName: z.string().min(1),
  sizeBytes: z.number().int().min(0),
  mimeType: z.string().min(1),
  /**
   * Opaque handle. In Phase 2 this is the Microsoft Graph item ID; the browser
   * never receives a raw SharePoint URL (plan §2.8). Phase 1 uses a blob URL.
   */
  storageRef: z.string().min(1),
  /** Per-image annotation from the reviewer. */
  comment: z.string(),
  uploadedAt: isoDateTimeSchema,
});
export type ReviewScreenshot = z.infer<typeof reviewScreenshotSchema>;

/* -------------------------------------------------------------------------- */
/* Review Comment — unified reviewer feedback entity                         */
/* -------------------------------------------------------------------------- */

function normalizeReviewRound(input: unknown): unknown {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return input;
  const value = input as Record<string, unknown>;
  return { ...value, reviewRound: value['reviewRound'] ?? value['reviewCycle'] ?? 1 };
}

const reviewCommentShape = {
  id: idSchema,
  reviewId: idSchema.optional(),
  reviewRound: z.number().int().min(1),
  reviewerId: idSchema.optional(),
  reviewerName: z.string().optional(),
  reviewSessionId: idSchema.optional(),
  text: z.string().min(1, 'Enter feedback for this review comment.'),
  screenshots: z.array(reviewScreenshotSchema).default([]),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema.optional(),
} as const;
export const reviewCommentObjectSchema = z.object(reviewCommentShape);
export const reviewCommentSchema = z.preprocess(normalizeReviewRound, reviewCommentObjectSchema);
export type ReviewComment = z.infer<typeof reviewCommentSchema>;

/* -------------------------------------------------------------------------- */
/* Review — one row per round                                                  */
/* -------------------------------------------------------------------------- */

/** Legacy Detailed Review Findings text areas (preserved for historical compatibility). */
export const reviewFindingsSchema = z.object({
  incorrectCode: z.string(),
  incompleteImplementation: z.string(),
  sourceFormatting: z.string(),
});
export type ReviewFindings = z.infer<typeof reviewFindingsSchema>;

const reviewShape = {
  id: idSchema,
  taskId: idSchema,
  reviewRound: z.number().int().min(1),
  reviewerId: idSchema.nullable(),
  reviewerName: z.string().nullable(),
  currentReviewSessionId: idSchema.optional().nullable(),

  /** Active unified reviewer feedback items. */
  comments: z.array(reviewCommentSchema).default([]),

  /** Legacy fields (with defaults for backwards compatibility with historical fixtures). */
  generalCheck: z.array(generalCheckEntrySchema).default([]),
  findings: reviewFindingsSchema.default({
    incorrectCode: '',
    incompleteImplementation: '',
    sourceFormatting: '',
  }),
  otherRemarks: z.string().default(''),
  feedbackSummary: z.string().max(MAX_FEEDBACK_SUMMARY_CHARS).default(''),
  screenshots: z.array(reviewScreenshotSchema).default([]),

  rank: reviewRankSchema.nullable(),
  previousFeedbackReviewNote: z.string().optional().nullable(),
  previousFeedbackAcknowledged: z.boolean().optional().nullable(),

  /** Null while the review is still a draft (spec p.10: auto-saved draft). */
  decision: reviewDecisionSchema.nullable(),
  decidedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
} as const;
export const reviewSchema = z.preprocess(normalizeReviewRound, z.object(reviewShape));
export type Review = z.infer<typeof reviewSchema>;

/**
 * What the reviewer submits / autosaves.
 */
export const reviewDraftSchema = z.object({
  currentReviewSessionId: idSchema.optional().nullable(),
  rank: reviewRankSchema.nullable(),
  comments: z.array(reviewCommentSchema).default([]),
  previousFeedbackReviewNote: z.string().optional().nullable(),
  previousFeedbackAcknowledged: z.boolean().optional().nullable(),

  /** Legacy fields (with defaults for backwards compatibility). */
  generalCheck: z.array(generalCheckEntrySchema).default([]),
  findings: reviewFindingsSchema.default({
    incorrectCode: '',
    incompleteImplementation: '',
    sourceFormatting: '',
  }),
  otherRemarks: z.string().trim().default(''),
  feedbackSummary: z.string().trim().default(''),
});
export type ReviewDraft = z.infer<typeof reviewDraftSchema>;

/* -------------------------------------------------------------------------- */
/* Issue responses — the developer's reply to each comment (single source of truth) */
/* -------------------------------------------------------------------------- */

const issueResponseRecordShape = {
  id: idSchema,
  taskId: idSchema,
  /** The immutable historical review round whose feedback is being answered. */
  reviewRound: z.number().int().min(1),
  /** Foreign key linking to the ReviewComment. */
  commentId: idSchema.optional().nullable(),
  /** Null when responding to the review as a whole rather than one screenshot. */
  screenshotId: idSchema.nullable().optional(),
  kind: issueResponseSchema,
  /** Mandatory when `kind` is "Rejected" (FL 2.11.2.3-01). */
  rejectionReason: z.string().nullable(),
  /** The reviewer's ruling on a developer response (FL 2.11.2.3-02). */
  verdict: rejectionVerdictSchema,
  /** Reviewer follow-up explanation or note (mandatory for negative verdicts: Not Resolved / Do Not Accept). */
  reviewerComment: z.string().trim().nullable().optional(),
  respondedAt: isoDateTimeSchema,
  adjudicatedAt: isoDateTimeSchema.optional().nullable(),
} as const;
export const issueResponseRecordSchema = z.preprocess(
  normalizeReviewRound,
  z.object(issueResponseRecordShape),
);
export type IssueResponseRecord = z.infer<typeof issueResponseRecordSchema>;

export const issueResponseDraftSchema = z.object({
  commentId: idSchema.optional().nullable(),
  screenshotId: idSchema.nullable().optional(),
  kind: issueResponseSchema,
  rejectionReason: z.string().trim().optional(),
});
export type IssueResponseDraft = z.infer<typeof issueResponseDraftSchema>;

/* -------------------------------------------------------------------------- */
/* Cycle history — screen 14 and the developer's Review Feedback History       */
/* -------------------------------------------------------------------------- */

/** One past cycle, newest first (spec §1.5 p.11: descending order). */
export const reviewHistoryEntrySchema = z.preprocess(
  normalizeReviewRound,
  z.object({
    ...reviewShape,
    responses: z.array(issueResponseRecordSchema),
  }),
);
export type ReviewHistoryEntry = z.infer<typeof reviewHistoryEntrySchema>;
