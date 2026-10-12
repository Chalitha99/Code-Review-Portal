import type { ReactNode } from 'react';
import type { Priority, ReviewRank, Role, TaskStatus } from '@sdp/contracts';
import { cn } from '@/components/ui';
import common from '@/content/common.json';

/**
 * The badge family, from Components sheet "03 · Badges & Tags".
 *
 * Every class here resolves to a semantic token in `tailwind.tokens.css` — no
 * literal colours. That is what lets a status recolour once and change
 * everywhere, and it is why these are components rather than repeated class
 * strings in each table.
 */

const BADGE_BASE =
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap border';

/* -------------------------------------------------------------------------- */
/* Task status                                                                 */
/* -------------------------------------------------------------------------- */

const STATUS_CLASSES: Record<TaskStatus, string> = {
  Draft: 'bg-status-draft-surface text-status-draft border-amber-200/50',
  Submitted: 'bg-status-submitted-surface text-status-submitted border-blue-200/50',
  InReview: 'bg-status-in-review-surface text-status-in-review border-indigo-200/50',
  ChangesRequested:
    'bg-status-changes-requested-surface text-status-changes-requested border-amber-200/50',
  ReSubmitted: 'bg-status-re-submitted-surface text-status-re-submitted border-indigo-200/50',
  Approved: 'bg-status-approved-surface text-status-approved border-emerald-200/50',
  Cancelled: 'bg-status-cancelled-surface text-status-cancelled border-rose-200/50',
};

export function StatusBadge({ status, className }: { status: TaskStatus; className?: string }) {
  return (
    <span className={cn(BADGE_BASE, STATUS_CLASSES[status], className)}>
      {common.status[status]}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Priority                                                                    */
/* -------------------------------------------------------------------------- */

const PRIORITY_CLASSES: Record<Priority, string> = {
  Low: 'bg-priority-low-surface text-priority-low border-slate-200/50',
  Medium: 'bg-priority-medium-surface text-priority-medium border-amber-200/50',
  High: 'bg-priority-high-surface text-priority-high border-rose-200/50',
};

export function PriorityPill({ priority, className }: { priority: Priority; className?: string }) {
  return (
    <span className={cn(BADGE_BASE, PRIORITY_CLASSES[priority], className)}>
      {common.priority[priority]}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Customer                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Customer identity, in the two forms the sheet shows: a filled pill and a bare
 * dot + label.
 *
 * The colour is per-customer data, not a token, so it is applied inline — this
 * is the one deliberate exception to the no-literal-colours rule, because the
 * value comes from the database and an admin picks it.
 */
export function CustomerChip({
  name,
  color,
  variant = 'pill',
  className,
}: {
  name: string;
  color: string;
  variant?: 'pill' | 'inline';
  className?: string;
}) {
  const dot = (
    <span
      className="size-1.5 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
      aria-hidden="true"
    />
  );

  if (variant === 'inline') {
    return (
      <span className={cn('inline-flex items-center gap-1.5 text-sm text-ink-700', className)}>
        {dot}
        {name}
      </span>
    );
  }

  return (
    <span
      className={cn(BADGE_BASE, className)}
      // 14% tint of the customer colour keeps the label legible while still
      // reading as that customer's colour.
      style={{ backgroundColor: `${color}24`, color }}
    >
      {dot}
      {name}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Roles                                                                       */
/* -------------------------------------------------------------------------- */

const ROLE_CLASSES: Record<Role, string> = {
  Developer: 'bg-brand-blue-100 text-brand-blue-700 border-brand-blue-700',
  Reviewer: 'bg-emerald-100 text-emerald-700 border-emerald-700',
  Admin: 'bg-violet-100 text-violet-700 border-violet-700',
  SuperAdmin: 'bg-purple-100 text-purple-800 border-purple-800',
};

const ROLE_BADGE_BASE =
  'inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap border leading-tight';

export interface RoleBadgeProps {
  role: Role;
  className?: string;
  size?: 'sm' | 'md';
}

/**
 * A single role badge (Developer, Reviewer, Admin, Super Admin).
 * Shared uniform geometry across all roles; only semantic color tokens differ.
 */
export function RoleBadge({ role, size = 'sm', className }: RoleBadgeProps) {
  return (
    <span
      className={cn(
        ROLE_BADGE_BASE,
        size === 'md' && 'px-2.5 py-0.5 text-xs',
        ROLE_CLASSES[role],
        className,
      )}
    >
      {common.role[role]}
    </span>
  );
}

/** The role set as rendered in the Users table — one badge per role. */
export function RoleBadges({
  roles,
  size = 'sm',
  className,
}: {
  roles: readonly Role[];
  size?: 'sm' | 'md';
  className?: string;
}) {
  if (roles.length === 0) {
    return <span className={cn('text-xs text-ink-400', className)}>No role</span>;
  }
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1', className)}>
      {[...new Set(roles)].map((role) => (
        <RoleBadge key={role} role={role} size={size} />
      ))}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Cycle, version, active state                                                */
/* -------------------------------------------------------------------------- */

/**
 * Secondary badge shown beside the status once a task has entered Round 2+.
 * Round 1 is the norm and carries no badge — showing it on every row would make
 * the meaningful cases harder to spot.
 */
export function CycleBadge({ cycle, className }: { cycle: number; className?: string }) {
  if (cycle <= 1) return null;
  return (
    <span
      className={cn(BADGE_BASE, 'border-violet-200/60 bg-violet-100/80 text-violet-700', className)}
      title={`Round: ${cycle}`}
    >
      Round {cycle}
    </span>
  );
}

/**
 * Badge representing the current sequential review round in the task lifecycle.
 */
export function ReviewRoundBadge({ round, className }: { round: number; className?: string }) {
  return (
    <span
      data-testid="version-tag"
      className={cn(
        BADGE_BASE,
        'border-violet-200/70 bg-violet-100/90 font-semibold text-violet-700',
        className,
      )}
      title="The actual chronological review attempt sequence."
    >
      Round {round}
    </span>
  );
}

/**
 * Badge representing the counted cycle used for business reporting.
 */
export function CountedCycleBadge({
  counted,
  adjustment = 0,
  className,
}: {
  counted: number;
  adjustment?: number;
  className?: string;
}) {
  const tooltip =
    adjustment > 0
      ? `The cycle count used for business reporting (${counted}). Reduced by ${adjustment} because all developer rejections were accepted.`
      : 'The cycle count used for business reporting. This may be lower if a review round was excluded after all rejected comments were accepted.';

  return (
    <span
      className={cn(
        BADGE_BASE,
        'border-sky-200/70 bg-sky-100/90 font-semibold text-sky-800',
        className,
      )}
      title={tooltip}
    >
      Cycle {counted}
    </span>
  );
}

/**
 * Two visually distinct compact badges rendering Review Round and Counted Cycle side-by-side.
 */
export function ReviewCycleBadges({
  round,
  counted,
  adjustedCycles = [],
  className,
}: {
  round: number;
  counted: number;
  /**
   * Rounds excluded from the counted total. Counted cycles start at 0, so
   * `round - counted` is not an adjustment — only an excluded round is.
   */
  adjustedCycles?: readonly number[];
  className?: string;
}) {
  const adjustment = adjustedCycles.length;
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <ReviewRoundBadge round={round} />
      <CountedCycleBadge counted={counted} adjustment={adjustment} />
      {adjustment > 0 ? (
        <span
          className="inline-flex items-center rounded-md border border-emerald-200/70 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 shadow-2xs"
          title={`A qualifying review round was excluded from the effective count (-${adjustment}). See Task History for cycle adjustment details.`}
        >
          Adjusted (-{adjustment})
        </span>
      ) : null}
    </span>
  );
}

/** Version tag beside a task title, e.g. `V1`. */
export function VersionTag({ version, className }: { version: string | null; className?: string }) {
  if (version === null || version === '') return null;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border border-violet-200/60 bg-violet-100/80 px-1.5 py-0.5 font-mono text-[0.65rem] font-bold text-violet-700',
        className,
      )}
    >
      {version}
    </span>
  );
}

export function ActiveBadge({ isActive, className }: { isActive: boolean; className?: string }) {
  return (
    <span
      className={cn(
        BADGE_BASE,
        isActive
          ? 'bg-status-approved-surface text-status-approved'
          : 'bg-priority-low-surface text-priority-low',
        className,
      )}
    >
      {isActive ? common.badges.active : common.badges.inactive}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Review rank                                                                 */
/* -------------------------------------------------------------------------- */

const RANK_CLASSES: Record<ReviewRank, string> = {
  1: 'bg-rank-1-surface text-rank-1',
  2: 'bg-rank-2-surface text-rank-2',
  3: 'bg-rank-3-surface text-rank-3',
};

export function RankBadge({ rank, className }: { rank: ReviewRank; className?: string }) {
  return (
    <span className={cn(BADGE_BASE, RANK_CLASSES[rank], className)}>
      {common.badges.rank} {rank}
    </span>
  );
}

/** Neutral badge for counts and labels with no semantic colour of their own. */
export function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn(BADGE_BASE, 'bg-canvas text-ink-700', className)}>{children}</span>;
}
