import type { Task, TaskListItem, User } from '@sdp/contracts';
import { ROUTES } from '@/config/routes.ts';
import type { Review } from '@sdp/contracts';

/**
 * Whitelist of canonical Reviewer list and dashboard destinations.
 *
 * Any return path must strictly have a pathname matching one of these four.
 * Detail pages (reviewer tasks), other workspaces (developer, admin),
 * external URLs, and protocol-relative URLs are explicitly excluded.
 */
export const CANONICAL_REVIEWER_PATHS = [
  ROUTES.reviewer.root,
  ROUTES.reviewer.myTasks,
  ROUTES.reviewer.history,
  ROUTES.reviewer.analytics,
] as const;

export type CanonicalReviewerPath = (typeof CANONICAL_REVIEWER_PATHS)[number];

/**
 * Strict validation of reviewer return destinations to prevent open redirects,
 * workspace leakage, and detail-to-detail redirect loops.
 */
export function isValidReviewerReturnPath(path: string | null | undefined): boolean {
  if (!path || typeof path !== 'string') return false;

  const trimmed = path.trim();
  if (!trimmed) return false;

  // Reject scheme/protocol, protocol-relative, backslash escapes, or data URLs
  if (
    trimmed.includes('://') ||
    trimmed.startsWith('//') ||
    trimmed.includes('\\') ||
    trimmed.toLowerCase().startsWith('javascript:') ||
    trimmed.toLowerCase().startsWith('data:')
  ) {
    return false;
  }

  // Must sit under the reviewer workspace root
  if (!trimmed.startsWith(ROUTES.reviewer.root)) {
    return false;
  }

  try {
    const parsed = new URL(trimmed, 'http://localhost');
    const pathname = parsed.pathname;

    // Must strictly match one of the four canonical reviewer list/dashboard paths
    const isWhitelisted = (CANONICAL_REVIEWER_PATHS as readonly string[]).includes(pathname);
    if (!isWhitelisted) {
      return false;
    }

    // Must not contain nested returnTo parameters that could chain redirects
    if (parsed.searchParams.has('returnTo')) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Returns an accessible, context-communicating label for a validated return path.
 */
export function getLabelForReviewerPath(path: string): string {
  try {
    const url = new URL(path, 'http://localhost');
    switch (url.pathname) {
      case ROUTES.reviewer.myTasks:
        return 'Back to My Review Tasks';
      case ROUTES.reviewer.history:
        return 'Back to Review History';
      case ROUTES.reviewer.analytics:
        return 'Back to Analytics';
      case ROUTES.reviewer.root:
        return 'Back to Available Tasks';
      default:
        return 'Back to Reviewer Dashboard';
    }
  } catch {
    return 'Back to Reviewer Dashboard';
  }
}

/**
 * Builds a durable Reviewer task URL with safe encoded returnTo query parameter.
 */
export function buildReviewerTaskUrl(taskId: string, returnPath?: string): string {
  const base = ROUTES.reviewer.task(taskId);
  if (!returnPath || !isValidReviewerReturnPath(returnPath)) {
    return base;
  }
  const encoded = encodeURIComponent(returnPath);
  return `${base}?returnTo=${encoded}`;
}

export interface ReviewerNavigationContext {
  /** Explicit returnTo passed via location.state */
  locationStateReturnTo?: string | null | undefined;
  /** URLSearchParams from current task-detail page to read ?returnTo= */
  searchParams?: URLSearchParams | null | undefined;
  /** The task being viewed, if loaded */
  task?: Task | TaskListItem | null | undefined;
  /** The signed-in user, if loaded */
  currentUser?: User | { id: string; roles: string[] } | null | undefined;
  /** The latest completed review for this task, if loaded */
  latestCompletedReview?: Review | null | undefined;
}

export interface ReturnDestination {
  to: string;
  label: string;
}

/**
 * Deterministic, context-aware resolver for Reviewer task-detail Back button.
 *
 * Priority order:
 * 1. Validated encoded `returnTo` query parameter or location.state.
 * 2. Deterministic task-relationship fallback:
 *    - Actively assigned to current reviewer -> My Review Tasks
 *    - Completed review performed by current reviewer -> Review History
 *    - Available unclaimed task -> Available Tasks
 *    - Fallback -> Available Tasks ("Back to Reviewer Dashboard")
 */
export function getReviewerReturnDestination(
  context: ReviewerNavigationContext,
): ReturnDestination {
  const { locationStateReturnTo, searchParams, task, currentUser, latestCompletedReview } = context;

  // 1. Check explicit returnTo from location.state or URL searchParams
  let candidateReturnTo: string | null | undefined = locationStateReturnTo;
  if (!candidateReturnTo && searchParams) {
    candidateReturnTo = searchParams.get('returnTo');
  }

  if (candidateReturnTo) {
    try {
      const decoded = decodeURIComponent(candidateReturnTo);
      if (isValidReviewerReturnPath(decoded)) {
        return {
          to: decoded,
          label: getLabelForReviewerPath(decoded),
        };
      }
    } catch {
      /* Fall through to deterministic fallback */
    }
  }

  // 2. Deterministic State-Based Fallback
  if (task) {
    // A. Actively assigned to current reviewer
    if (task.status === 'InReview' && currentUser?.id === task.reviewerId) {
      return {
        to: ROUTES.reviewer.myTasks,
        label: 'Back to My Review Tasks',
      };
    }

    // B. Completed review performed by CURRENT reviewer (strict ownership check)
    const isOwnerOfCompletedReview =
      Boolean(currentUser?.id) && latestCompletedReview?.reviewerId === currentUser?.id;

    if (isOwnerOfCompletedReview) {
      return {
        to: ROUTES.reviewer.history,
        label: 'Back to Review History',
      };
    }

    // C. Available unclaimed task
    if (
      task.reviewerId === null &&
      (task.status === 'Submitted' || task.status === 'ReSubmitted')
    ) {
      return {
        to: ROUTES.reviewer.root,
        label: 'Back to Available Tasks',
      };
    }
  }

  // Safe Reviewer Dashboard default
  return {
    to: ROUTES.reviewer.root,
    label: 'Back to Reviewer Dashboard',
  };
}
