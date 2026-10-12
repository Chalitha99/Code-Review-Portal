import { Award, Calendar, History, MessageSquare, User } from 'lucide-react';
import type { Review, ReviewHistoryEntry } from '@sdp/contracts';
import { cn } from '@/components/ui';
import { RankBadge, StatusBadge, Tag } from '@/portals/code-review/components/badges.tsx';
import { Card, CardBody, CardHeader } from '@/components/ui/Card.tsx';
import { formatDateTime, textOr } from '@/lib/formatters.ts';
import { getRankLabel } from '../domain/reviewRules.ts';

export interface PreviousReviewSummaryCardProps {
  previousReview: Review | ReviewHistoryEntry;
  className?: string;
}

/**
 * Concise summary card of the preceding review round.
 * Displayed at the top of the active re-review flow (Mode D) to provide
 * immediate context on why changes were requested and what issues were flagged.
 */
export function PreviousReviewSummaryCard({
  previousReview,
  className,
}: PreviousReviewSummaryCardProps) {
  const commentsCount = previousReview.comments?.length ?? 0;
  const rankLabel = getRankLabel(previousReview.rank);

  return (
    <Card
      collapsible
      defaultExpanded={false}
      resetKey={previousReview.taskId}
      summary={`${commentsCount} ${commentsCount === 1 ? 'finding' : 'findings'}`}
      className={cn(
        'overflow-hidden border-violet-200/80 bg-violet-50/20 shadow-2xs transition-all',
        className,
      )}
    >
      <CardHeader
        title={
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-ink-900 sm:text-base">
              Preceding Review Summary
            </span>
            <Tag className="bg-violet-100 text-xs font-bold text-violet-700">
              Round {previousReview.reviewRound}
            </Tag>
            {previousReview.decision && (
              <StatusBadge
                status={previousReview.decision === 'Approved' ? 'Approved' : 'ChangesRequested'}
              />
            )}
            {previousReview.rank !== null && <RankBadge rank={previousReview.rank} />}
          </div>
        }
        description={`Summary of findings and decision from Round ${previousReview.reviewRound}`}
        icon={<History className="size-4 text-violet-600" />}
      />

      <CardBody className="space-y-4 pt-2">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <div className="space-y-0.5 rounded-lg border border-line/70 bg-surface/80 p-2.5">
            <span className="text-2xs flex items-center gap-1 font-medium text-ink-500">
              <User className="size-3 text-ink-400" />
              Reviewed by
            </span>
            <p className="truncate text-xs font-semibold text-ink-900">
              {textOr(previousReview.reviewerName, 'Reviewer')}
            </p>
          </div>

          <div className="space-y-0.5 rounded-lg border border-line/70 bg-surface/80 p-2.5">
            <span className="text-2xs flex items-center gap-1 font-medium text-ink-500">
              <Calendar className="size-3 text-ink-400" />
              Decided At
            </span>
            <p className="truncate text-xs font-semibold text-ink-900">
              {previousReview.decidedAt ? formatDateTime(previousReview.decidedAt) : '—'}
            </p>
          </div>

          <div className="space-y-0.5 rounded-lg border border-line/70 bg-surface/80 p-2.5">
            <span className="text-2xs flex items-center gap-1 font-medium text-ink-500">
              <Award className="size-3 text-ink-400" />
              Preceding Rank
            </span>
            <p className="truncate text-xs font-semibold text-ink-900" title={rankLabel}>
              {rankLabel}
            </p>
          </div>

          <div className="space-y-0.5 rounded-lg border border-line/70 bg-surface/80 p-2.5">
            <span className="text-2xs flex items-center gap-1 font-medium text-ink-500">
              <MessageSquare className="size-3 text-ink-400" />
              Issues Registered
            </span>
            <p className="text-xs font-semibold text-ink-900">{commentsCount}</p>
          </div>
        </div>

        <p className="text-ink-600 rounded-lg border border-line/50 bg-surface/50 p-2.5 text-xs leading-relaxed">
          The developer has submitted responses to issues from Round {previousReview.reviewRound}.
          Review their responses and rejections above, then record your new re-review assessment
          below.
        </p>
      </CardBody>
    </Card>
  );
}
