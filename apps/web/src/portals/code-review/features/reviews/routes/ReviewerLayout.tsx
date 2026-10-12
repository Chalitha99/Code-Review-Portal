import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  History,
  Inbox,
  LineChart,
  ListChecks,
  ScanSearch,
} from 'lucide-react';
import { StatCard } from '@/components/common/KpiCard.tsx';
import { StatCardSkeleton } from '@/components/common/Skeleton.tsx';
import { PageHeader } from '@/components/common/PageHeader.tsx';
import { RouteTabs } from '@/components/ui/Tabs.tsx';
import { ROUTES } from '@/config/routes.ts';
import { interpolate } from '@/lib/formatters.ts';
import { useCurrentUser } from '@/hooks/useCurrentUser.ts';
import { useBucketSelection } from '@/portals/code-review/hooks/useKpiBucket.ts';
import reviews from '@/content/reviews.json';
import { useTasks } from '@/portals/code-review/hooks/useTasks.ts';
import { PageContainer } from '@/components/common/PageContainer.tsx';
import { Reveal } from '@/components/common/Reveal.tsx';
import { WorkspaceOutlet } from '@/components/common/WorkspaceOutlet.tsx';

/**
 * Reviewer workspace chrome (screen 07): header, four counters, tab strip.
 *
 * Each counter is a separate scoped query rather than one list filtered four
 * ways, because the scopes mean different things server-side — "available"
 * excludes the caller's own submissions, "assigned" is theirs alone. Deriving
 * them client-side from one list would require the client to hold rows it is not
 * supposed to receive.
 *
 * THE ROW MIXES TWO KINDS OF CARD, deliberately.
 *
 * The first two are QUEUE DEPTHS — how many task rows are waiting — so they are
 * controls that open their own tab (spec §2.7 makes Available Tasks and My
 * Review Tasks separate tabs, so a card that merely set a filter would do
 * nothing: the rows it counts are not in the grid on screen).
 *
 * The last two are WORK DONE, and they count decided REVIEWS rather than tasks.
 * They used to count tasks in the History list, which was wrong twice over: the
 * Reviewer Analytics tab reported the same two figures off reviews, so the
 * header and the analytics screen disagreed by a wide margin (18 reviews across
 * 11 tasks, on the seed), and the underlying filter keyed off `task.reviewerId`,
 * which a Request Changes decision clears — so the counter decayed to zero in
 * normal use. Counting reviews fixes both, and it is the same source
 * `reviewerMetrics` reads, so the two screens now agree by construction.
 *
 * The consequence is that these two are STATIC counters, not filters: one task
 * can carry several reviews, so a review count can never equal a row count in
 * the History grid, and wiring them to filter it would put "15" above a grid of
 * four. The Analytics tab immediately below is the drill-down.
 */
export function ReviewerLayout() {
  const { data: user } = useCurrentUser();
  const { data: available, isPending: availablePending } = useTasks('available');
  const { data: assigned, isPending: assignedPending } = useTasks('assigned');
  const { data: history, isPending: historyPending } = useTasks('history');
  const bucket = useBucketSelection();

  const isPending = availablePending || assignedPending || historyPending;

  const changesRequestedCount =
    history?.filter((task) => task.status === 'ChangesRequested').length ?? 0;
  const approvedCount = history?.filter((task) => task.status === 'Approved').length ?? 0;

  return (
    <PageContainer className="space-y-6">
      <PageHeader
        title={reviews.workspace.title}
        subtitle={interpolate(reviews.workspace.subtitle, { name: user?.name ?? '' })}
        icon={<ClipboardCheck className="size-5" />}
        tone="reviewer"
      />

      {/* One `Reveal` around the row — see `DeveloperLayout` for why not per card. */}
      <Reveal className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {isPending ? (
          Array.from({ length: 4 }, (_, index) => <StatCardSkeleton key={index} />)
        ) : (
          <>
            <StatCard
              label={reviews.kpis.available}
              value={available?.length ?? 0}
              tone="blue"
              icon={<Inbox className="size-4" />}
              subtitle={reviews.kpis.availableSubtitle}
              // The Available queue is a scope, not a status slice, so this card
              // only opens its tab — there is no bucket to apply.
              isActive={bucket.isUnfiltered(ROUTES.reviewer.root)}
              onSelect={() => {
                bucket.clear(ROUTES.reviewer.root);
              }}
            />
            <StatCard
              label={reviews.kpis.inReview}
              value={assigned?.length ?? 0}
              tone="violet"
              icon={<ScanSearch className="size-4" />}
              subtitle={reviews.kpis.inReviewSubtitle}
              isActive={bucket.isUnfiltered(ROUTES.reviewer.myTasks)}
              onSelect={() => {
                bucket.clear(ROUTES.reviewer.myTasks);
              }}
            />
            <StatCard
              label={reviews.kpis.changesRequested}
              value={changesRequestedCount}
              tone="amber"
              icon={<AlertCircle className="size-4" />}
              subtitle={reviews.kpis.changesRequestedSubtitle}
              isActive={bucket.isActive('changesRequested', ROUTES.reviewer.history)}
              onSelect={() => {
                bucket.select('changesRequested', ROUTES.reviewer.history);
              }}
            />
            <StatCard
              label={reviews.kpis.approved}
              value={approvedCount}
              tone="green"
              icon={<CheckCircle2 className="size-4" />}
              subtitle={reviews.kpis.approvedSubtitle}
              isActive={bucket.isActive('approved', ROUTES.reviewer.history)}
              onSelect={() => {
                bucket.select('approved', ROUTES.reviewer.history);
              }}
            />
          </>
        )}
      </Reveal>

      <RouteTabs
        label={reviews.workspace.title}
        tabs={[
          {
            to: ROUTES.reviewer.root,
            label: reviews.workspace.tabs.available,
            icon: <Inbox className="size-4" />,
            end: true,
          },
          {
            to: ROUTES.reviewer.myTasks,
            label: reviews.workspace.tabs.assigned,
            icon: <ListChecks className="size-4" />,
          },
          {
            to: ROUTES.reviewer.history,
            label: reviews.workspace.tabs.history,
            icon: <History className="size-4" />,
          },
          {
            // Last, and with the same icon the developer's Analytics tab uses.
            // The three queues in front of it are the daily work; this is the
            // step back from it, and a reviewer looking for their queue should
            // never have to read past a chart to find it.
            to: ROUTES.reviewer.analytics,
            label: reviews.workspace.tabs.analytics,
            icon: <LineChart className="size-4" />,
          },
        ]}
      />

      <WorkspaceOutlet />
    </PageContainer>
  );
}
