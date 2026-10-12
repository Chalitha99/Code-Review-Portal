import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Every public error code and its fixed HTTP status.
 *
 * Statuses follow standard HTTP semantics (RFC 9110):
 *  - 400 the request itself is malformed (DTO/Zod failure, bad id, unknown enum);
 *  - 401 not authenticated; 403 authenticated but not allowed; 404 missing or hidden;
 *  - 409 the request clashes with the resource's CURRENT STATE (wrong status,
 *    already picked/resolved, duplicate name, still in use) — retrying after the
 *    state changes can succeed;
 *  - 413 / 415 body too large / unsupported upload type;
 *  - 422 well-formed, but it breaks a business rule (reason missing, checklist
 *    incomplete, reviewer not eligible) — the caller must change the request;
 *  - 429 rate limited.
 */
export const ERROR_HTTP_STATUS = {
  VALIDATION_FAILED: HttpStatus.BAD_REQUEST,
  AUTH_REQUIRED: HttpStatus.UNAUTHORIZED,
  INVALID_CREDENTIALS: HttpStatus.UNAUTHORIZED,
  RESOURCE_FORBIDDEN: HttpStatus.FORBIDDEN,
  FORBIDDEN: HttpStatus.FORBIDDEN,
  ACCOUNT_INACTIVE: HttpStatus.FORBIDDEN,
  PRIVILEGED_ROLE_REQUIRED: HttpStatus.FORBIDDEN,
  ORIGIN_REJECTED: HttpStatus.FORBIDDEN,
  NOT_FOUND: HttpStatus.NOT_FOUND,
  TASK_NOT_FOUND: HttpStatus.NOT_FOUND,
  TASK_ALREADY_CLAIMED: HttpStatus.CONFLICT,
  ALREADY_PICKED: HttpStatus.CONFLICT,
  ALREADY_HANDED_OVER: HttpStatus.CONFLICT,
  ALREADY_RESOLVED: HttpStatus.CONFLICT,
  HANDOVER_PENDING: HttpStatus.CONFLICT,
  INVALID_STATE: HttpStatus.CONFLICT,
  CHANGES_REQUESTED_ACTIVE: HttpStatus.CONFLICT,
  VERSION_CONFLICT: HttpStatus.CONFLICT,
  IMMUTABLE_TASK_IDENTITY: HttpStatus.CONFLICT,
  INVALID_STATE_TRANSITION: HttpStatus.CONFLICT,
  NAME_TAKEN: HttpStatus.CONFLICT,
  EMAIL_TAKEN: HttpStatus.CONFLICT,
  ORDER_TAKEN: HttpStatus.CONFLICT,
  CUSTOMER_IN_USE: HttpStatus.CONFLICT,
  TASK_TYPE_IN_USE: HttpStatus.CONFLICT,
  QUESTION_IN_USE: HttpStatus.CONFLICT,
  CATEGORY_NOT_EMPTY: HttpStatus.CONFLICT,
  TASK_HAS_WORKFLOW_EVIDENCE: HttpStatus.CONFLICT,
  DRAFT_HAS_SUBMITTED_EVIDENCE: HttpStatus.CONFLICT,
  INVITE_PENDING: HttpStatus.CONFLICT,
  NOT_INVITED: HttpStatus.CONFLICT,
  NOT_ACTIVE: HttpStatus.CONFLICT,
  REVIEWER_HAS_PENDING_TASKS: HttpStatus.CONFLICT,
  REVIEW_EVIDENCE_REQUIRED: HttpStatus.CONFLICT,
  CHECKLIST_INCOMPLETE: HttpStatus.UNPROCESSABLE_ENTITY,
  RESPONSES_INCOMPLETE: HttpStatus.UNPROCESSABLE_ENTITY,
  REVIEW_INCOMPLETE: HttpStatus.UNPROCESSABLE_ENTITY,
  APPROVE_BLOCKED: HttpStatus.UNPROCESSABLE_ENTITY,
  UNRESOLVED_RESPONSES: HttpStatus.UNPROCESSABLE_ENTITY,
  REASON_REQUIRED: HttpStatus.UNPROCESSABLE_ENTITY,
  EXPLANATION_REQUIRED: HttpStatus.UNPROCESSABLE_ENTITY,
  REJECTION_REASON_REQUIRED: HttpStatus.UNPROCESSABLE_ENTITY,
  ATTACHMENT_REJECTED: HttpStatus.UNPROCESSABLE_ENTITY,
  SCREENSHOT_REJECTED: HttpStatus.UNPROCESSABLE_ENTITY,
  RULE_VIOLATION: HttpStatus.UNPROCESSABLE_ENTITY,
  PAYLOAD_TOO_LARGE: HttpStatus.PAYLOAD_TOO_LARGE,
  UNSUPPORTED_MEDIA_TYPE: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
  INVALID_REVIEWER: HttpStatus.UNPROCESSABLE_ENTITY,
  SAME_REVIEWER: HttpStatus.UNPROCESSABLE_ENTITY,
  SELF_REVIEW: HttpStatus.UNPROCESSABLE_ENTITY,
  SELF_LOCKOUT: HttpStatus.UNPROCESSABLE_ENTITY,
  ORDER_INCOMPLETE: HttpStatus.UNPROCESSABLE_ENTITY,
  INVALID_TASK_TYPE: HttpStatus.UNPROCESSABLE_ENTITY,
  INVALID_CATEGORY: HttpStatus.UNPROCESSABLE_ENTITY,
  TOKEN_INVALID: HttpStatus.BAD_REQUEST,
  TOKEN_EXPIRED: HttpStatus.GONE,
  PASSWORD_POLICY: HttpStatus.UNPROCESSABLE_ENTITY,
  PASSWORD_PERSONAL: HttpStatus.UNPROCESSABLE_ENTITY,
  RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,
  GRAPH_THROTTLED: HttpStatus.SERVICE_UNAVAILABLE,
  INTERNAL_ERROR: HttpStatus.INTERNAL_SERVER_ERROR,
} as const;

export type ApiErrorCode = keyof typeof ERROR_HTTP_STATUS;

/**
 * The public error envelope. `statusCode`, `code` and `message` are what the
 * web client's `apiErrorSchema` (packages/contracts common.ts) requires;
 * `details` carries code-specific context (validation messages, the tasks that
 * block a deactivation, the password rules that failed).
 */
export interface ApiErrorResponse {
  [extra: string]: unknown;
  statusCode: number;
  code: string;
  message: string;
  details: unknown;
  timestamp: string;
}

/**
 * A public, domain-safe error whose HTTP status is fixed by its error code.
 *
 * `extra` adds top-level fields to the envelope for clients that read them
 * there — the public password endpoints' `failedRules` (apps/web
 * features/local-auth/api/http.ts).
 */
export class ApiException extends HttpException {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly details: unknown = [],
    readonly extra: Readonly<Record<string, unknown>> = {},
  ) {
    super(message, ERROR_HTTP_STATUS[code]);
  }
}
