import type { ReactNode } from 'react';
import type { TaskEvent } from '@sdp/contracts';
import { cn } from '@/components/ui';
import { History, SlidersHorizontal } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card.tsx';
import { formatCompactDateTime, textOr } from '@/lib/formatters.ts';
import tasksContent from '@/content/tasks.json';

const EVENT_MARKER_CLASSES: Record<string, { dot: string; ring: string }> = {
  Created: {
    dot: 'bg-violet-600',
    ring: 'ring-violet-100',
  },
  Submitted: {
    dot: 'bg-blue-600',
    ring: 'ring-blue-100',
  },
  Resubmitted: {
    dot: 'bg-blue-600',
    ring: 'ring-blue-100',
  },
  Picked: {
    dot: 'bg-violet-600',
    ring: 'ring-violet-100',
  },
  ReviewerAssigned: {
    dot: 'bg-violet-600',
    ring: 'ring-violet-100',
  },
  ReviewDraftSaved: {
    dot: 'bg-indigo-500',
    ring: 'ring-indigo-100',
  },
  ChangesRequested: {
    dot: 'bg-amber-500',
    ring: 'ring-amber-100',
  },
  Approved: {
    dot: 'bg-emerald-500',
    ring: 'ring-emerald-100',
  },
  HandedOver: {
    dot: 'bg-amber-600',
    ring: 'ring-amber-100',
  },
  Reassigned: {
    dot: 'bg-violet-600',
    ring: 'ring-violet-100',
  },
  ReturnedToQueue: {
    dot: 'bg-slate-500',
    ring: 'ring-slate-100',
  },
  Cancelled: {
    dot: 'bg-rose-500',
    ring: 'ring-rose-100',
  },
  CountedCycleAdjusted: {
    dot: 'bg-indigo-600',
    ring: 'ring-indigo-100',
  },
};

export interface TaskActivityTimelineProps {
  title?: ReactNode | undefined;
  subtitle?: ReactNode | undefined;
  events: readonly TaskEvent[];
  showActor?: boolean | undefined;
  showReviewRound?: boolean | undefined;
  /** Legacy alias for showReviewRound */
  showReviewCycle?: boolean | undefined;
  emptyStateText?: string | undefined;
  order?: 'asc' | 'desc' | undefined;
  maxEvents?: number | undefined;
  highlightLatestEventKind?: string | undefined;
  className?: string | undefined;
}

/**
 * Shared Read-Only Task Activity / History Timeline card.
 *
 * Used across Developer Task Overview (`TaskDetailPage`) and Reviewer Review Task (`ReviewSidebar`)
 * to present a chronological timeline of important task lifecycle events with status-aware
 * markers, actor identification, timestamps, and optional review round badges.
 */
export function TaskActivityTimeline({
  title = tasksContent.detail.historyTitle,
  subtitle = tasksContent.detail.historySubtitle,
  events,
  showActor = true,
  showReviewRound,
  showReviewCycle = true,
  emptyStateText = 'No events recorded.',
  order = 'asc',
  maxEvents,
  highlightLatestEventKind,
  className,
}: TaskActivityTimelineProps) {
  const sortedEvents = [...events].sort((a, b) => {
    const timeA = new Date(a.occurredAt).getTime();
    const timeB = new Date(b.occurredAt).getTime();
    return order === 'desc' ? timeB - timeA : timeA - timeB;
  });

  const latestHighlightedId = highlightLatestEventKind
    ? [...events]
        .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
        .find((e) => e.kind === highlightLatestEventKind)?.id
    : undefined;

  const displayEvents = maxEvents ? sortedEvents.slice(0, maxEvents) : sortedEvents;

  return (
    <Card className={className}>
      <CardHeader
        title={title}
        description={subtitle}
        icon={<History className="size-4 text-violet-600" />}
      />
      <CardBody className="pt-2.5 pb-3">
        {displayEvents.length === 0 ? (
          <p className="py-1 text-xs text-ink-400">{emptyStateText}</p>
        ) : (
          <div className="space-y-0">
            {displayEvents.map((event, index) => {
              const marker = EVENT_MARKER_CLASSES[event.kind] ?? {
                dot: 'bg-violet-600',
                ring: 'ring-violet-100',
              };
              const isLast = index === displayEvents.length - 1;

              return (
                <div key={event.id} className="relative flex items-start gap-3">
                  {/* Continuous vertical connector line */}
                  {!isLast ? (
                    <span
                      className="absolute top-3 bottom-0 left-[5px] w-[1.5px] bg-line/80"
                      aria-hidden="true"
                    />
                  ) : null}

                  {/* Status-aware Timeline Marker */}
                  <span
                    className={cn(
                      'relative z-10 mt-1 size-3 shrink-0 rounded-full border border-surface shadow-2xs ring-2',
                      marker.dot,
                      marker.ring,
                    )}
                    aria-hidden="true"
                  />

                  {/* Event Details */}
                  <div className={cn('min-w-0 flex-1', !isLast ? 'pb-3.5' : 'pb-0.5')}>
                    {(() => {
                      const isAdjustment = event.kind === 'CountedCycleAdjusted';
                      return (
                        <>
                          <div className="flex flex-wrap items-center justify-between gap-1.5">
                            <div className="flex items-center gap-1.5">
                              <p className="text-xs leading-tight font-bold text-ink-900">
                                {tasksContent.detail.events[event.kind] ?? event.kind}
                              </p>
                              {isAdjustment &&
                              (event.previousCountedCycle || event.newCountedCycle) ? (
                                <span className="inline-flex items-center gap-1 rounded border border-indigo-200/70 bg-indigo-50 px-1.5 py-0.5 text-[11px] leading-none font-bold text-indigo-700">
                                  {event.previousCountedCycle} → {event.newCountedCycle}
                                </span>
                              ) : null}
                            </div>
                            {!isAdjustment && (showReviewRound ?? showReviewCycle) && (event.reviewRound ?? (event as Record<string, unknown>)['reviewCycle']) ? (
                              <span className="py-0.2 inline-flex items-center rounded border border-violet-200/60 bg-violet-50 px-1.5 text-[10px] leading-none font-semibold text-violet-700">
                                Round {String(event.reviewRound ?? (event as Record<string, unknown>)['reviewCycle'])}
                              </span>
                            ) : null}
                          </div>

                          <p className="mt-0.5 text-[11px] font-medium text-ink-500">
                            {formatCompactDateTime(event.occurredAt)}
                          </p>

                          {showActor && event.actorName ? (
                            <p
                              className="mt-0.5 truncate text-[11px] font-medium text-ink-700"
                              title={event.actorName}
                            >
                              {event.actorName}
                            </p>
                          ) : null}

                          {isAdjustment ? (
                            <div className="mt-1.5 space-y-1 rounded-lg border border-indigo-200/70 bg-indigo-50/40 p-2.5 text-[11px] leading-relaxed text-indigo-950">
                              <div className="flex items-center gap-1.5 font-semibold text-indigo-800">
                                <SlidersHorizontal
                                  className="size-3.5 shrink-0 text-indigo-600"
                                  aria-hidden="true"
                                />
                                <span>
                                  {event.previousCountedCycle ?? ''} → {event.newCountedCycle ?? ''}
                                </span>
                              </div>
                              <p className="text-ink-600">
                                {event.note ??
                                  `Review Round ${event.qualifyingReviewRound ?? ''} was excluded from the developer's effective cycle count because all rejected comments were accepted and no fixes were required.`}
                              </p>
                            </div>
                          ) : event.id === latestHighlightedId ? (
                            <div className="mt-1.5 space-y-1 rounded-lg border border-amber-300 bg-amber-50/80 p-2 text-xs text-amber-950">
                              <span className="block text-[11px] font-bold tracking-wider text-amber-900 uppercase">
                                Latest Handover Note
                              </span>
                              <p className="text-xs font-medium text-amber-900">
                                {textOr(event.note, 'No reason provided.')}
                              </p>
                            </div>
                          ) : event.note ? (
                            <p className="text-ink-600 mt-0.5 line-clamp-2 text-[11px]">
                              {event.note}
                            </p>
                          ) : null}
                        </>
                      );
                    })()}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
