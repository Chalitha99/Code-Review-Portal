import { z } from 'zod';

/**
 * Domain vocabulary for the Code Review Portal.
 *
 * These are string-literal unions rather than TypeScript `enum`s: `enum` emits a
 * runtime object that does not tree-shake and is disallowed under
 * `isolatedModules` + `verbatimModuleSyntax`. The `const` arrays below give us
 * both a runtime value list (for dropdowns and MSW seeding) and a static type.
 */

/* -------------------------------------------------------------------------- */
/* Roles — additive. A user holds a SET of these, never a single value.        */
/* Wireframes show one user as "Developer • Reviewer • Admin" simultaneously.  */
/* -------------------------------------------------------------------------- */
export const ROLES = ['Developer', 'Reviewer', 'Admin', 'SuperAdmin'] as const;
export type Role = (typeof ROLES)[number];

/** Role codes as NestJS stores and accepts them (apps/api auth.constants.ts). */
export const ROLE_CODE_BY_ROLE = {
  Developer: 'DEVELOPER',
  Reviewer: 'REVIEWER',
  Admin: 'ADMIN',
  SuperAdmin: 'SUPER_ADMIN',
} as const satisfies Record<Role, string>;
export type RoleCode = (typeof ROLE_CODE_BY_ROLE)[Role];

/**
 * NestJS serialises roles as display labels (`SUPER_ADMIN` → 'Super Admin')
 * and accepts codes on writes. The client keeps identifier-style keys, so both
 * spellings are normalised here, once, at the parse boundary.
 */
const ROLE_ALIASES: Readonly<Record<string, Role>> = {
  'Super Admin': 'SuperAdmin',
  ...Object.fromEntries(
    (Object.entries(ROLE_CODE_BY_ROLE) as [Role, RoleCode][]).map(([role, code]) => [code, role]),
  ),
};

export const roleSchema = z.preprocess(
  (value) => (typeof value === 'string' ? (ROLE_ALIASES[value] ?? value) : value),
  z.enum(ROLES),
);

export const PORTAL_IDS = ['code-review', 'delivery', 'wiki'] as const;
export const portalIdSchema = z.enum(PORTAL_IDS);
export type PortalId = z.infer<typeof portalIdSchema>;

/* -------------------------------------------------------------------------- */
/* Task status — spec §1.5 (Admin/Task Tab, p.13).                            */
/* -------------------------------------------------------------------------- */
export const TASK_STATUSES = [
  'Draft',
  'Submitted',
  'InReview',
  'ChangesRequested',
  'ReSubmitted',
  'Approved',
  'Cancelled',
] as const;
export const taskStatusSchema = z.enum(TASK_STATUSES);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

/**
 * Legal status transitions. The reviewer/admin action that causes each edge is
 * named in `docs/` and enforced by the domain layer — never by a component.
 *
 * Note `Cancelled` is reachable from every non-terminal state (admin may cancel
 * "at any time", spec p.13) and is expanded below rather than special-cased.
 */
export const TASK_STATUS_TRANSITIONS: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  Draft: ['Submitted', 'Cancelled'],
  Submitted: ['InReview', 'Cancelled'],
  InReview: ['Approved', 'ChangesRequested', 'Cancelled'],
  ChangesRequested: ['ReSubmitted', 'Cancelled'],
  ReSubmitted: ['InReview', 'Cancelled'],
  Approved: [],
  Cancelled: [],
} as const;

/** Statuses in which no further workflow action is possible. */
export const TERMINAL_TASK_STATUSES = ['Approved', 'Cancelled'] as const;

/* -------------------------------------------------------------------------- */
/* Priority — spec §2.2.3 seq 6.                                              */
/* -------------------------------------------------------------------------- */
export const PRIORITIES = ['Low', 'Medium', 'High'] as const;
export const prioritySchema = z.enum(PRIORITIES);
export type Priority = z.infer<typeof prioritySchema>;

/* -------------------------------------------------------------------------- */
/* Task type — drives which checklist questions render (spec FL 2.6-01).       */
/* Multi-select: a task may carry several types.                               */
/*                                                                             */
/* NOT an enum. Task types are administered — an admin adds, renames and        */
/* retires them at runtime — so they are rows with ids, and a task stores ids.  */
/* A `z.enum` here would have made "add a task type" a code change and a        */
/* redeploy, and would have put the display names in `content/*.json` where an  */
/* admin cannot reach them.                                                     */
/*                                                                             */
/* Consequence worth knowing: nothing downstream can switch exhaustively on a   */
/* task type any more. That is correct — the set is open.                       */
/* -------------------------------------------------------------------------- */
export const taskTypeIdSchema = z.string().min(1);
export type TaskTypeId = z.infer<typeof taskTypeIdSchema>;

/* -------------------------------------------------------------------------- */
/* Developer checklist answers — spec FL 2.6-02, all questions mandatory.      */
/* -------------------------------------------------------------------------- */
export const CHECKLIST_ANSWERS = ['Yes', 'No', 'NA'] as const;
export const checklistAnswerSchema = z.enum(CHECKLIST_ANSWERS);
export type ChecklistAnswer = z.infer<typeof checklistAnswerSchema>;

/* -------------------------------------------------------------------------- */
/* Reviewer General Check answers — spec §2.9.2.4, distinct from the developer */
/* checklist scale. "PartiallyOk" or "NotOk" makes Detailed Findings mandatory */
/* (FL 2.9.2.4-02).                                                            */
/* -------------------------------------------------------------------------- */
export const GENERAL_CHECK_ANSWERS = ['Ok', 'PartiallyOk', 'NotOk', 'NA'] as const;
export const generalCheckAnswerSchema = z.enum(GENERAL_CHECK_ANSWERS);
export type GeneralCheckAnswer = z.infer<typeof generalCheckAnswerSchema>;

/** Answers that oblige the reviewer to write Detailed Review Findings. */
export const DEFECT_ANSWERS = [
  'PartiallyOk',
  'NotOk',
] as const satisfies readonly GeneralCheckAnswer[];

/* -------------------------------------------------------------------------- */
/* Review rank — spec §2.9.2.5. Rank 1 permits Approve; 2 and 3 force the     */
/* Request Changes path (FL 2.9.2.5-01).                                       */
/* -------------------------------------------------------------------------- */
export const REVIEW_RANKS = [1, 2, 3] as const;
export const reviewRankSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export type ReviewRank = z.infer<typeof reviewRankSchema>;

/** Ranks that block approval and require findings + at least one screenshot. */
export const DEFECT_RANKS = [2, 3] as const satisfies readonly ReviewRank[];

/* -------------------------------------------------------------------------- */
/* Reviewer decision on a completed review cycle.                              */
/* -------------------------------------------------------------------------- */
export const REVIEW_DECISIONS = ['Approved', 'ChangesRequested'] as const;
export const reviewDecisionSchema = z.enum(REVIEW_DECISIONS);
export type ReviewDecision = z.infer<typeof reviewDecisionSchema>;

/**
 * Who is asking for reviews, on `GET /reviews`.
 *
 * The two personal scopes point in OPPOSITE directions and the names are easy to
 * read the wrong way round:
 *
 * - `mine` — reviews **of my work**, matched on the task's `developerId`. What
 *   the developer's Analytics tab reads to draw its quality ranking.
 * - `reviewer` — reviews **I gave**, matched on the review's own `reviewerId`.
 *   What the reviewer's Analytics tab reads.
 *
 * `reviewer` keys off the REVIEW rather than the task on purpose. A Request
 * Changes decision clears `task.reviewerId`, so the task no longer remembers who
 * sent it back; `review.reviewerId` is the durable attribution, and anything
 * counting a reviewer's work off the task list under-reports by exactly the
 * reviews that found problems.
 */
export const REVIEW_SCOPES = ['mine', 'reviewer', 'all'] as const;
export const reviewScopeSchema = z.enum(REVIEW_SCOPES);
export type ReviewScope = z.infer<typeof reviewScopeSchema>;

/* -------------------------------------------------------------------------- */
/* Developer response to an individual review finding — spec §1.5 p.11.        */
/* Rejecting requires a written justification (FL 2.11.2.3-01).                */
/* -------------------------------------------------------------------------- */
export const ISSUE_RESPONSES = ['Resolved', 'Rejected'] as const;
export const issueResponseSchema = z.enum(ISSUE_RESPONSES);
export type IssueResponseKind = z.infer<typeof issueResponseSchema>;

/** Reviewer's verdict on a developer's rejection — spec FL 2.11.2.3-02. */
export const REJECTION_VERDICTS = ['Pending', 'Accepted', 'Overruled'] as const;
export const rejectionVerdictSchema = z.enum(REJECTION_VERDICTS);
export type RejectionVerdict = z.infer<typeof rejectionVerdictSchema>;

/* -------------------------------------------------------------------------- */
/* Handover — spec §1.5 p.12. No Figma screen exists; designed by us.          */
/* -------------------------------------------------------------------------- */
export const HANDOVER_STATUSES = ['Pending', 'Reassigned', 'Cancelled', 'ReturnedToQueue'] as const;
export const handoverStatusSchema = z.enum(HANDOVER_STATUSES);
export type HandoverStatus = z.infer<typeof handoverStatusSchema>;

/* -------------------------------------------------------------------------- */
/* Screenshot upload constraints — spec FL 2.9.2.6-01.                         */
/* -------------------------------------------------------------------------- */
export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
] as const;
export const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;
export const MAX_SCREENSHOTS_PER_REVIEW = 10;

/** Feedback Summary cap, per the "0 / 10,000 characters" counter in screen 12. */
export const MAX_FEEDBACK_SUMMARY_CHARS = 10_000;

/** Version field cap, per the helper text in screens 15 and 22. */
export const MAX_VERSION_CHARS = 50;
