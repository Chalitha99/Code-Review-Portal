import { useEffect } from 'react';
import { ArrowLeft, CheckCircle2, Eye, FilePlus2, GitPullRequest } from 'lucide-react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { StatusBadge, Tag } from '@/portals/code-review/components/badges.tsx';
import { Button } from '@/components/ui/Button.tsx';
import { Card, CardBody, CardHeader } from '@/components/ui/Card.tsx';
import { buttonVariants } from '@/components/ui/buttonVariants.ts';
import { ROUTES } from '@/config/routes.ts';
import { interpolate } from '@/lib/formatters.ts';
import tasks from '@/content/tasks.json';
import { useTaskDraft } from '../hooks/useTaskDraft.ts';
import { PageContainer } from '@/components/common/PageContainer.tsx';

/**
 * Submission Confirmed (screen 25).
 *
 * Reached only by submitting: the details it shows come from the navigation
 * state, so landing here directly — a refresh, a bookmark — redirects to My
 * Tasks rather than rendering a confirmation for a submission that did not
 * happen on this visit.
 */

interface ConfirmationState {
  taskId: string;
  taskCode: string;
  title: string;
  reviewRound?: number | undefined;
  reviewCycle?: number | undefined;
}

function isConfirmationState(value: unknown): value is ConfirmationState {
  if (typeof value !== 'object' || value === null) return false;
  const state = value as Record<string, unknown>;
  return typeof state['taskId'] === 'string' && typeof state['taskCode'] === 'string';
}

export function SubmissionConfirmedPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const resetDraft = useTaskDraft((s) => s.reset);

  // The wizard has unmounted by now, so the submitted task can be cleared from the
  // persisted draft without re-rendering it against an empty store.
  useEffect(() => {
    useTaskDraft.getState().reset();
  }, []);

  if (!isConfirmationState(location.state)) {
    return <Navigate to={ROUTES.developer.root} replace />;
  }

  const { taskId, taskCode, title, reviewRound, reviewCycle } = location.state;
  const roundNumber = reviewRound ?? reviewCycle ?? 0;

  return (
    <PageContainer className="max-w-3xl space-y-4">
      <Card>
        <CardBody className="flex flex-col items-center gap-4 py-12 text-center">
          <span
            className="grid size-20 place-items-center rounded-full bg-success-surface"
            aria-hidden="true"
          >
            <CheckCircle2 className="size-10 text-success" />
          </span>

          <h1 className="font-display text-2xl font-bold text-ink-900">
            {tasks.wizard.confirmed.title}
          </h1>

          <p className="text-sm text-ink-500">
            {interpolate(tasks.wizard.confirmed.body, { taskCode, title })}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <StatusBadge status="Submitted" />
            <Tag className="bg-violet-100 text-violet-700">
              {interpolate(tasks.wizard.confirmed.cycle, {
                round: roundNumber,
                cycle: roundNumber,
              })}
            </Tag>
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
            <Link
              to={ROUTES.developer.task(taskId)}
              className={buttonVariants({ variant: 'secondary' })}
            >
              <Eye className="size-4" aria-hidden="true" />
              {tasks.wizard.confirmed.viewTask}
            </Link>

            {/*
              Starting another task must clear the draft first — without it the
              wizard would reopen holding the submission that was just sent.
            */}
            <Button
              variant="secondary"
              onClick={() => {
                resetDraft();
                void navigate(ROUTES.developer.newTaskStep('details'));
              }}
            >
              <FilePlus2 className="size-4" aria-hidden="true" />
              {tasks.wizard.confirmed.createAnother}
            </Button>

            <Link to={ROUTES.developer.root} className={buttonVariants()}>
              <ArrowLeft className="size-4" aria-hidden="true" />
              {tasks.wizard.confirmed.backToTasks}
            </Link>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={tasks.wizard.review.nextTitle}
          icon={<GitPullRequest className="size-4" />}
        />
        <CardBody className="pt-4">
          <ol className="space-y-3">
            {tasks.wizard.confirmed.nextSteps.map((step, index) => (
              <li key={step} className="flex gap-3 text-sm text-ink-700">
                <span className="shrink-0 text-xs text-ink-400">{index + 1}.</span>
                {step}
              </li>
            ))}
          </ol>
        </CardBody>
      </Card>
    </PageContainer>
  );
}
