import {
  AlertCircle,
  Building2,
  CalendarDays,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  FileText,
  Flag,
  GitPullRequest,
  Hash,
  Layers,
  MessageSquare,
  Pencil,
  RefreshCw,
  User as UserIcon,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { cn } from '@/components/ui';
import { StatusBadge } from '@/portals/code-review/components/badges.tsx';
import {
  ChecklistSection,
  ReadOnlyQuestionRow,
} from '@/portals/code-review/components/checklist.tsx';
import { Button } from '@/components/ui/Button.tsx';
import { Card, CardBody, CardHeader } from '@/components/ui/Card.tsx';
import { ROUTES } from '@/config/routes.ts';
import { formatDate, interpolate } from '@/lib/formatters.ts';
import { useCurrentUser } from '@/hooks/useCurrentUser.ts';
import common from '@/content/common.json';
import tasks from '@/content/tasks.json';
import { checklistProgress, visibleCategories } from '../domain/checklistRules.ts';
import { useChecklistTemplate, useCustomers, useTask, useTaskTypes } from '../api/queries.ts';
import { deriveTitle } from '../domain/taskRules.ts';
import { findAnswer, useTaskDraft } from '../hooks/useTaskDraft.ts';

/**
 * Wizard step 3 (screen 24) — Review & Submit.
 *
 * Everything the reviewer will see before submission is presented cleanly and
 * structured for quick visual verification.
 */
export function WizardReviewStep() {
  const navigate = useNavigate();
  const { taskId: paramTaskId } = useParams<{ taskId?: string }>();
  const draft = useTaskDraft();
  const { data: customers } = useCustomers();
  const { data: template } = useChecklistTemplate();
  const { data: user } = useCurrentUser();
  const { data: taskTypes } = useTaskTypes();
  const { data: persistedTask } = useTask(paramTaskId ?? draft.taskId ?? undefined);

  const customer = customers?.find((c) => c.id === draft.customerId);
  const categories = visibleCategories(template ?? [], draft.taskTypeIds);
  const derivedTitle =
    persistedTask?.title ?? deriveTitle(customer?.code ?? '', draft.crimId, draft.version);

  const taskDetailRows = [
    {
      id: 'taskId',
      icon: <Hash className="size-4 text-violet-600" />,
      label: tasks.detail.fields.taskId,
      value:
        draft.taskCode === null ? (
          <span className="text-xs font-medium text-ink-400">
            {tasks.wizard.details.taskIdPending}
          </span>
        ) : (
          <span className="text-ink-800 rounded-md border border-line bg-canvas px-2 py-0.5 font-mono text-xs font-semibold">
            {draft.taskCode ?? draft.taskId}
          </span>
        ),
    },
    {
      id: 'title',
      icon: <FileText className="size-4 text-violet-600" />,
      label: tasks.detail.fields.title,
      value: derivedTitle ? (
        <span
          className="max-w-[280px] truncate text-right text-xs font-semibold text-ink-900"
          title={derivedTitle}
        >
          {derivedTitle}
        </span>
      ) : (
        <span className="text-xs font-medium text-ink-400">—</span>
      ),
    },
    {
      id: 'crimId',
      icon: <Layers className="size-4 text-violet-600" />,
      label: tasks.detail.fields.crimId,
      value: <span className="font-semibold text-ink-900">{draft.crimId || '—'}</span>,
    },
    {
      id: 'customer',
      icon: <Building2 className="size-4 text-violet-600" />,
      label: tasks.detail.fields.customer,
      value: customer ? (
        <span className="inline-flex items-center gap-1.5 font-semibold text-ink-900">
          <span
            className="size-2 rounded-full"
            style={{ backgroundColor: customer.color }}
            aria-hidden="true"
          />
          {customer.name}
        </span>
      ) : (
        <span className="text-ink-400">—</span>
      ),
    },
    {
      id: 'version',
      icon: <FileText className="size-4 text-violet-600" />,
      label: tasks.detail.fields.version,
      value:
        draft.version.trim() === '' ? (
          <span className="text-ink-400">—</span>
        ) : (
          <span className="font-semibold text-ink-900">{draft.version}</span>
        ),
    },
    {
      id: 'priority',
      icon: <Flag className="size-4 text-violet-600" />,
      label: tasks.detail.fields.priority,
      value: (
        <span className="inline-flex items-center gap-1.5 font-semibold text-ink-900">
          <span
            className={cn(
              'size-2 rounded-full',
              draft.priority === 'High'
                ? 'bg-danger'
                : draft.priority === 'Medium'
                  ? 'bg-status-draft'
                  : 'bg-priority-low',
            )}
            aria-hidden="true"
          />
          {common.priority[draft.priority]}
        </span>
      ),
    },
    {
      id: 'status',
      icon: <CheckCircle2 className="size-4 text-violet-600" />,
      label: tasks.detail.fields.status,
      value: <StatusBadge status="Draft" />,
    },
    {
      id: 'cycle',
      icon: <RefreshCw className="size-4 text-violet-600" />,
      label: tasks.detail.fields.cycle,
      value: (
        <span className="text-ink-800 rounded-md border border-line bg-canvas px-2 py-0.5 font-mono text-xs font-semibold">
          0
        </span>
      ),
    },
    {
      id: 'developer',
      icon: <UserIcon className="size-4 text-violet-600" />,
      label: tasks.detail.fields.developer,
      value: <span className="font-semibold text-ink-900">{user?.name ?? '—'}</span>,
    },
    {
      id: 'created',
      icon: <CalendarDays className="size-4 text-violet-600" />,
      label: tasks.detail.fields.created,
      value: (
        <span className="text-ink-800 text-xs font-semibold">
          {draft.createdAt ? formatDate(draft.createdAt) : formatDate(new Date().toISOString())}
        </span>
      ),
    },
    {
      id: 'submitted',
      icon: <CalendarDays className="size-4 text-violet-600" />,
      label: tasks.detail.fields.submitted,
      value: draft.submittedAt ? (
        <span className="text-ink-800 text-xs font-semibold">{formatDate(draft.submittedAt)}</span>
      ) : (
        <span className="text-xs font-medium text-ink-400">—</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Card 1: Task Details Card */}
      <Card>
        <CardHeader
          title={tasks.wizard.review.taskDetails}
          description="Summary of task identity and customer details"
          icon={<FileText className="size-4 text-violet-600" />}
          action={
            <Button
              variant="ghost"
              size="sm"
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold text-violet-600 transition-colors hover:bg-violet-50 hover:text-violet-700"
              onClick={() => {
                void navigate(
                  paramTaskId
                    ? ROUTES.developer.editTaskStep(paramTaskId, 'details')
                    : ROUTES.developer.newTaskStep('details'),
                );
              }}
            >
              <Pencil className="size-3.5" aria-hidden="true" />
              {common.actions.edit}
            </Button>
          }
        />
        <CardBody className="pt-2">
          <dl className="divide-y divide-line/70">
            {taskDetailRows.map((row) => (
              <div
                key={row.id}
                className="flex items-center justify-between gap-4 py-2.5 first:pt-1 last:pb-1"
              >
                <dt className="flex items-center gap-2 text-sm font-medium text-ink-500">
                  <span aria-hidden="true">{row.icon}</span>
                  {row.label}
                </dt>
                <dd className="flex items-center justify-end text-sm">{row.value}</dd>
              </div>
            ))}
          </dl>
        </CardBody>
      </Card>

      {/* Card 2: Checklist Summary Card */}
      <Card>
        <CardHeader
          title={tasks.wizard.review.checklistSummary}
          description="Review answered checklist items and developer remarks"
          icon={<ClipboardCheck className="size-4 text-violet-600" />}
          action={
            <Button
              variant="ghost"
              size="sm"
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold text-violet-600 transition-colors hover:bg-violet-50 hover:text-violet-700"
              onClick={() => {
                void navigate(
                  paramTaskId
                    ? ROUTES.developer.editTaskStep(paramTaskId, 'checklist')
                    : ROUTES.developer.newTaskStep('checklist'),
                );
              }}
            >
              <Pencil className="size-3.5" aria-hidden="true" />
              {common.actions.edit}
            </Button>
          }
        />
        <CardBody className="space-y-6 pt-3">
          {/* 1. Task Types */}
          <div>
            <h3 className="mb-2.5 flex items-center gap-2 text-xs font-bold tracking-wide text-ink-500 uppercase">
              <Layers className="size-3.5 text-violet-600" aria-hidden="true" />
              {tasks.wizard.checklist.taskType}
            </h3>
            <div className="flex flex-wrap gap-2">
              {draft.taskTypeIds.length === 0 ? (
                <span className="text-sm text-ink-400">—</span>
              ) : (
                draft.taskTypeIds.map((id) => {
                  const name = taskTypes?.find((tt) => tt.id === id)?.name ?? id;
                  return (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50/80 px-3 py-1 text-xs font-semibold text-violet-700 shadow-2xs"
                    >
                      <CheckCircle2 className="size-3 text-violet-600" aria-hidden="true" />
                      {name}
                    </span>
                  );
                })
              )}
            </div>
          </div>

          {/* 2. Quality Checklist Questions */}
          <div className="space-y-4">
            <h3 className="flex items-center gap-2 text-xs font-bold tracking-wide text-ink-500 uppercase">
              <CheckCircle2 className="size-3.5 text-violet-600" aria-hidden="true" />
              {tasks.wizard.checklist.questionsTitle}
            </h3>

            {categories.length === 0 ? (
              <p className="text-sm text-ink-400">—</p>
            ) : (
              categories.map((category) => {
                const issues = category.questions.filter(
                  (question) => findAnswer(draft.answers, question.id) === 'No',
                ).length;
                return (
                  <ChecklistSection
                    key={category.id}
                    name={category.name}
                    questionCount={category.questions.length}
                    issueCount={issues}
                  >
                    {category.questions.map((question, idx) => {
                      const answer = findAnswer(draft.answers, question.id);
                      return (
                        <ReadOnlyQuestionRow
                          key={question.id}
                          index={idx + 1}
                          text={question.text}
                          answer={answer}
                          flagged={answer === 'No'}
                        />
                      );
                    })}
                  </ChecklistSection>
                );
              })
            )}
          </div>

          {/* 3. Additional Remarks */}
          <div className="border-t border-line/60 pt-3">
            <div className="mb-2">
              <h3 className="flex items-center gap-2 text-xs font-bold tracking-wide text-ink-500 uppercase">
                <MessageSquare className="size-3.5 text-violet-600" aria-hidden="true" />
                {tasks.wizard.checklist.remarksTitle}
              </h3>
              <p className="mt-0.5 text-xs text-ink-400">
                Notes for the reviewer from the checklist.
              </p>
            </div>
            {draft.remarks.trim() !== '' ? (
              <div className="text-ink-800 rounded-xl border border-violet-200/70 bg-violet-50/20 p-3.5 text-sm leading-relaxed font-medium whitespace-pre-wrap shadow-2xs">
                {draft.remarks}
              </div>
            ) : (
              <div className="rounded-xl border border-line/60 bg-canvas/40 p-3 text-sm text-ink-400 italic">
                No additional remarks
              </div>
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

/** Shared 2-column status row with fixed-width icon area and centered alignment. */
function StatusRow({
  icon,
  text,
  textColor = 'text-ink-800',
}: {
  icon: React.ReactNode;
  text: React.ReactNode;
  textColor?: string;
}) {
  return (
    <li className="grid grid-cols-[20px_1fr] items-center gap-3 text-xs">
      <div className="flex h-5 w-5 shrink-0 items-center justify-center">{icon}</div>
      <div className={cn('leading-snug font-medium', textColor)}>{text}</div>
    </li>
  );
}

/** Shared 2-column numbered step row with identical fixed badge size and centered alignment. */
function NextStepRow({ stepNumber, description }: { stepNumber: number; description: string }) {
  return (
    <li className="text-ink-800 grid grid-cols-[20px_1fr] items-center gap-3 text-xs">
      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-violet-200 bg-violet-50 text-[11px] font-bold text-violet-700 shadow-2xs">
        {stepNumber}
      </div>
      <div className="leading-snug font-medium">{description}</div>
    </li>
  );
}

/** "Ready to submit" and "What happens next" — the step 3 right column. */
export function ReviewSidePanels() {
  const draft = useTaskDraft();
  const { data: template } = useChecklistTemplate();
  const progress = checklistProgress(template ?? [], draft.taskTypeIds, draft.answers);

  const detailsComplete = draft.customerId !== '' && draft.crimId.trim() !== '';
  const isReady = detailsComplete && progress.isComplete;

  return (
    <div className="space-y-5">
      {/* Card 1: Ready to Submit */}
      <Card>
        <CardHeader
          title={tasks.wizard.review.readyTitle}
          icon={<CheckCircle2 className="size-4 text-violet-600" />}
        />
        <CardBody className="space-y-4 pt-3">
          {/* Readiness Banner - visually separated from the checklist below */}
          <div
            className={cn(
              'flex items-center gap-2.5 rounded-xl border p-3 text-xs font-semibold shadow-2xs',
              isReady
                ? 'border-emerald-200 bg-emerald-50/90 text-emerald-800'
                : 'border-amber-200 bg-amber-50/90 text-amber-800',
            )}
          >
            {isReady ? (
              <>
                <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />
                <span className="leading-snug">
                  Ready for submission. All requirements satisfied.
                </span>
              </>
            ) : (
              <>
                <AlertCircle className="size-4 shrink-0 text-amber-600" aria-hidden="true" />
                <span className="leading-snug">Action required before submission can proceed.</span>
              </>
            )}
          </div>

          {/* Verification Items List with uniform 2-column layout */}
          <ul className="space-y-3 pt-0.5">
            {/* 1. Task Details Complete */}
            <StatusRow
              icon={
                detailsComplete ? (
                  <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />
                ) : (
                  <AlertCircle className="size-4 text-amber-600" aria-hidden="true" />
                )
              }
              text={tasks.wizard.review.ready.details}
              textColor={detailsComplete ? 'text-ink-800' : 'text-amber-800'}
            />

            {/* 2. Checklist Answered */}
            <StatusRow
              icon={
                progress.isComplete ? (
                  <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />
                ) : (
                  <AlertCircle className="size-4 text-amber-600" aria-hidden="true" />
                )
              }
              text={interpolate(tasks.wizard.review.ready.checklist, {
                answered: progress.answered,
                total: progress.total,
              })}
              textColor={progress.isComplete ? 'text-ink-800' : 'text-amber-800'}
            />

            {/* 3. Answers Requiring Attention */}
            <StatusRow
              icon={
                progress.issueCount > 0 ? (
                  <AlertCircle className="size-4 text-amber-600" aria-hidden="true" />
                ) : (
                  <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />
                )
              }
              text={
                progress.issueCount > 0
                  ? interpolate(
                      progress.issueCount === 1
                        ? tasks.wizard.review.ready.flagged
                        : tasks.wizard.review.ready.flaggedPlural,
                      { count: progress.issueCount },
                    )
                  : '0 flagged answers (all checks addressed)'
              }
              textColor={progress.issueCount > 0 ? 'text-amber-800 font-semibold' : 'text-ink-700'}
            />

            {/* 4. Sent to Reviewer Notice */}
            <StatusRow
              icon={<Circle className="text-ink-300 size-4" aria-hidden="true" />}
              text={tasks.wizard.review.ready.queue}
              textColor="text-ink-500"
            />
          </ul>
        </CardBody>
      </Card>

      {/* Card 2: What Happens Next */}
      <Card>
        <CardHeader
          title={tasks.wizard.review.nextTitle}
          icon={<GitPullRequest className="size-4 text-violet-600" />}
        />
        <CardBody className="pt-3">
          <ol className="space-y-3">
            {tasks.wizard.review.nextSteps.map((step, index) => (
              <NextStepRow key={step} stepNumber={index + 1} description={step} />
            ))}
          </ol>
        </CardBody>
      </Card>
    </div>
  );
}
