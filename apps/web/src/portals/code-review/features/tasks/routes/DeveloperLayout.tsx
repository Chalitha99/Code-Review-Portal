import {
  CheckCircle2,
  Code2,
  FileText,
  LineChart,
  ListChecks,
  MessageSquare,
  Plus,
  Send,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type { TaskListItem, TaskStatus } from '@sdp/contracts';
import { cn } from '@/components/ui';
import { StatCard } from '@/components/common/KpiCard.tsx';
import { StatCardSkeleton } from '@/components/common/Skeleton.tsx';
import { PageHeader } from '@/components/common/PageHeader.tsx';
import { RouteTabs } from '@/components/ui/Tabs.tsx';
import { buttonVariants } from '@/components/ui/buttonVariants.ts';
import { ROUTES } from '@/config/routes.ts';
import { interpolate } from '@/lib/formatters.ts';
import { useCurrentUser } from '@/hooks/useCurrentUser.ts';
import { useBucketSelection } from '@/portals/code-review/hooks/useKpiBucket.ts';
import tasks from '@/content/tasks.json';
import { useTasks } from '../api/queries.ts';
import { PageContainer } from '@/components/common/PageContainer.tsx';
import { Reveal } from '@/components/common/Reveal.tsx';
import { WorkspaceOutlet } from '@/components/common/WorkspaceOutlet.tsx';

/**
 * Developer workspace chrome (screen 16): header, the four counters, and the
 * My Tasks / Analytics tab strip.
 */

function countByStatus(items: readonly TaskListItem[] | undefined, status: TaskStatus): number {
  return (items ?? []).filter((task) => task.status === status).length;
}

export function DeveloperLayout() {
  const { data: user } = useCurrentUser();
  const { data: items, isPending } = useTasks('mine');
  const bucket = useBucketSelection();
  const grid = ROUTES.developer.root;

  const draftCount = countByStatus(items, 'Draft');
  const submittedCount =
    countByStatus(items, 'Submitted') +
    countByStatus(items, 'ReSubmitted') +
    countByStatus(items, 'InReview');
  const changesCount = countByStatus(items, 'ChangesRequested');
  const approvedCount = countByStatus(items, 'Approved');

  return (
    <div className="relative min-w-0">
      {/*
        Wrapper clips the decorative glow so its -right-10 offset doesn't add to
        document scrollWidth (caused a 40px horizontal overflow on this route).
        Don't put overflow-hidden on the outer .relative div instead: it would
        also become the containing scroll box for any sticky descendant added
        later (e.g. Card's sticky CardFooter, TaskDetailPage's lg:sticky) and
        silently break it. Clipping only the glow's own container is safe.
      */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-10 -right-10 size-96 rounded-full bg-gradient-to-bl from-blue-200/20 via-violet-100/15 to-transparent blur-3xl" />
      </div>

      <PageContainer className="relative space-y-6">
        <PageHeader
          title={tasks.workspace.title}
          subtitle={interpolate(tasks.workspace.subtitle, { name: user?.name ?? '' })}
          icon={<Code2 className="size-6 text-white" />}
          tone="developer"
          actions={
            <Link
              to={ROUTES.developer.newTask}
              className={cn(
                buttonVariants({ variant: 'primary' }),
                'gap-2 rounded-xl bg-brand-blue-600 px-4 py-2.5 font-semibold text-white shadow-sm hover:bg-brand-blue-700',
              )}
            >
              <Plus className="size-4 stroke-[2.5]" aria-hidden="true" />
              {tasks.workspace.newTask}
            </Link>
          }
        />

        <Reveal className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {isPending ? (
            Array.from({ length: 4 }, (_, index) => <StatCardSkeleton key={index} />)
          ) : (
            <>
              <StatCard
                label={tasks.kpis.draft}
                value={draftCount}
                tone="neutral"
                icon={<FileText className="size-4" />}
                subtitle={tasks.kpis.draftSubtitle}
                isActive={bucket.isActive('draft', grid)}
                onSelect={() => {
                  bucket.select('draft', grid);
                }}
              />
              <StatCard
                label={tasks.kpis.submitted}
                value={submittedCount}
                tone="blue"
                icon={<Send className="size-4" />}
                subtitle={tasks.kpis.submittedSubtitle}
                isActive={bucket.isActive('awaitingReview', grid)}
                onSelect={() => {
                  bucket.select('awaitingReview', grid);
                }}
              />
              <StatCard
                label={tasks.kpis.changesRequested}
                value={changesCount}
                tone="amber"
                icon={<MessageSquare className="size-4" />}
                subtitle={tasks.kpis.changesRequestedSubtitle}
                isActive={bucket.isActive('changesRequested', grid)}
                onSelect={() => {
                  bucket.select('changesRequested', grid);
                }}
              />
              <StatCard
                label={tasks.kpis.approved}
                value={approvedCount}
                tone="green"
                icon={<CheckCircle2 className="size-4" />}
                subtitle={tasks.kpis.approvedSubtitle}
                isActive={bucket.isActive('approved', grid)}
                onSelect={() => {
                  bucket.select('approved', grid);
                }}
              />
            </>
          )}
        </Reveal>

        <RouteTabs
          label={tasks.workspace.title}
          tabs={[
            {
              to: ROUTES.developer.root,
              label: tasks.workspace.tabs.myTasks,
              icon: <ListChecks className="size-4" />,
              end: true,
            },
            {
              to: ROUTES.developer.analytics,
              label: tasks.workspace.tabs.analytics,
              icon: <LineChart className="size-4" />,
            },
          ]}
        />

        <WorkspaceOutlet />
      </PageContainer>
    </div>
  );
}
