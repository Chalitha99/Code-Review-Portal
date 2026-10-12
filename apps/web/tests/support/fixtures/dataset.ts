import { z } from 'zod';
import {
  checklistCategorySchema,
  customerSchema,
  notificationSchema,
  taskChecklistSchema,
  taskTypeRecordSchema,
  generalCheckQuestionSchema,
  taskEventSchema,
  taskSchema,
  userSchema,
  type ChecklistCategory,
  type GeneralCheckQuestion,
  type Handover,
  type IssueResponseRecord,
  type TaskAttachment,
  type Review,
  type TaskTypeRecord,
  type Customer,
  type Notification,
  type Task,
  type TaskChecklist,
  type ChecklistSubmission,
  type TaskEvent,
  type TaskListItem,
  type User,
} from '@sdp/contracts';
import rawUsers from './data/users.json';
import rawCustomers from './data/customers.json';
import rawTasks from './data/tasks.json';
import rawNotifications from './data/notifications.json';
import rawChecklistTemplate from './data/checklistTemplate.json';
import rawTaskTypes from './data/taskTypes.json';
import rawGeneralCheck from './data/generalCheck.json';
import { getQaResponseScenarios } from './qaScenarios.ts';

/**
 * The component-test DATASET: realistic, contract-validated records that tests
 * hand to `apiStub` as the server's answers. Pure data — there is no request
 * handling, no business rule and no persistence here; NestJS owns those and is
 * tested in apps/api.
 *
 * `buildDataset()` returns a fresh, independent copy every call, so a test can
 * edit what it serves without leaking into the next test.
 *
 * The seed JSON is validated against the shared contract schemas on load: if a
 * fixture drifts from the shape NestJS sends, it fails loudly here with a Zod
 * path instead of producing `undefined` three components deep.
 */

function seed<TSchema extends z.ZodTypeAny>(
  label: string,
  raw: unknown,
  schema: TSchema,
): z.infer<TSchema> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new Error(
      `Mock seed data for "${label}" does not match its schema:\n` +
        JSON.stringify(result.error.issues, null, 2),
    );
  }
  return result.data;
}

/** A notification carries the owning user, which the wire format does not. */
const storedNotificationSchema = notificationSchema.extend({
  userId: z.string().min(1),
});
type StoredNotification = Notification & { userId: string };

export interface Dataset {
  users: User[];
  deletedUserIds: Set<string>;
  /** Admin-chosen follow-up reviewer per ChangesRequested task (docs/25). */
  resubmissionReviewerIds: Map<string, string>;
  customers: Customer[];
  tasks: Task[];
  notifications: StoredNotification[];
  taskTypes: TaskTypeRecord[];
  checklistTemplate: ChecklistCategory[];
  generalCheck: GeneralCheckQuestion[];
  handovers: Handover[];
  reviews: Review[];
  issueResponses: IssueResponseRecord[];
  attachments: TaskAttachment[];
  checklists: TaskChecklist[];
  checklistSubmissions: ChecklistSubmission[];
  events: TaskEvent[];
}

/**
 * Customers are validated once, up front, rather than cast at each use — the
 * title derivation below depends on them, so a malformed customer fixture
 * should fail here with a Zod path rather than silently produce
 * "Unknown - 4.44" titles across the whole app.
 */
const seededCustomers: Customer[] = seed('customers', rawCustomers, customerSchema.array());

/** Validated once, and read by `seedReviews` to resolve reviewer names. */
const seededUsers: User[] = seed('users', rawUsers, userSchema.array());

/**
 * Title generation, spec FL 2.5-01: `Customer - CRIM ID[ Version]`.
 *
 * Derived here rather than written into the fixtures, so the seed data cannot
 * disagree with the rule the application enforces at create time.
 */
function withDerivedFields(task: Record<string, unknown>): Record<string, unknown> {
  const customer = seededCustomers.find((c) => c.id === task['customerId']);
  const version = task['version'] as string | null;
  const base = `${customer?.name ?? 'Unknown'} - ${String(task['crimId'])}`;
  const reviewRound =
    (task['reviewRound'] as number) ??
    (task['historicalCycle'] as number) ??
    (task['reviewCycle'] as number) ??
    1;
  const countedCycle = (task['countedCycle'] as number) ?? (task['reviewCycle'] as number) ?? 1;

  return {
    ...task,
    reviewRound,
    countedCycle,
    title: version === null ? base : `${base} ${version}`,
    updatedAt: task['submittedAt'] ?? task['createdAt'],
  };
}

export function buildDataset(): Dataset {
  const tasks = seed(
    'tasks',
    (rawTasks as Record<string, unknown>[]).map(withDerivedFields),
    taskSchema.array(),
  );

  const template = seed('checklistTemplate', rawChecklistTemplate, checklistCategorySchema.array());
  const reviews = seedReviews(tasks);
  const qaData = getQaResponseScenarios();
  const allTasks = [...tasks, ...qaData.tasks];
  const allReviews = [...reviews, ...qaData.reviews];
  const taskTypes = seed('taskTypes', rawTaskTypes, taskTypeRecordSchema.array());
  const checklists = seedChecklists(allTasks, template);

  // Requirement 40: Normalize legacy active workflow fields
  for (const task of allTasks) {
    if (task.status === 'Cancelled') {
      task.reviewerId = null;
      task.currentReviewSessionId = null;
      task.isHandedOver = false;
    } else if (task.status === 'ChangesRequested' || task.status === 'Approved') {
      task.currentReviewSessionId = null;
    }
  }

  const allHandovers = [...(qaData.handovers ?? [])];
  for (const handover of allHandovers) {
    const task = allTasks.find((t) => t.id === handover.taskId);
    if (task?.status === 'Cancelled' && handover.status === 'Pending') {
      handover.status = 'Cancelled';
      handover.resolvedAt = handover.resolvedAt ?? task.updatedAt;
    }
  }

  return {
    users: seededUsers.map((u) => ({ ...u })),
    deletedUserIds: new Set<string>(),
    resubmissionReviewerIds: new Map<string, string>(),
    // Cloned so runtime mutations cannot write back into the module-level copy
    // that `withDerivedFields` reads, which would break `resetDb()`.
    customers: seededCustomers.map((c) => ({ ...c })),
    tasks: allTasks,
    notifications: [
      ...seed('notifications', rawNotifications, storedNotificationSchema.array()),
      ...(qaData.notifications ?? []),
    ],
    taskTypes,
    checklistTemplate: template,
    generalCheck: seed('generalCheck', rawGeneralCheck, generalCheckQuestionSchema.array()),
    handovers: allHandovers,
    reviews: allReviews,
    issueResponses: [...qaData.issueResponses],
    attachments: [],
    checklists,
    checklistSubmissions: seedChecklistSubmissions(allTasks, taskTypes, template, checklists),
    events: [...seedEvents(tasks, reviews), ...qaData.events],
  };
}

/**
 * Decided reviews for the cycles a task has already been through.
 *
 * Without these the Reports tab renders every metric as zero — approval rate,
 * average rank, cycle distribution all read from decided reviews — which would
 * make the whole screen untestable and unreviewable.
 *
 * Derived from the task's own `reviewCycle` rather than fixtured, so the seed
 * cannot contradict the cycle rule: a cycle increments only on Request Changes,
 * so cycles 1…n-1 were all Request Changes, and only an Approved task has a
 * decided review at its CURRENT cycle. Every other status leaves the current
 * cycle undecided, which is what lets a reviewer still open and submit it.
 */
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Days between one cycle's decision and the next. */
const CYCLE_GAP_DAYS = 3;

/**
 * A stable number in `[min, max)` derived from a string.
 *
 * Deterministic on purpose. `Math.random()` here would give every test run a
 * different average turnaround, and the metrics tests assert on figures the seed
 * produces — a fixture that changes between runs is a flake generator, not a
 * fixture.
 */
function hashedRange(seed: string, min: number, max: number): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) | 0;
  }
  return min + (Math.abs(hash) % (max - min));
}

/**
 * Decided reviews for the cycles a task has already been through.
 *
 * Without these the Reports tab renders every metric as zero — approval rate,
 * average rank, cycle distribution all read from decided reviews — which would
 * make the whole screen untestable and unreviewable.
 *
 * Derived from the task's own `reviewCycle` rather than fixtured, so the seed
 * cannot contradict the cycle rule: a cycle increments only on Request Changes,
 * so cycles 1…n-1 were all Request Changes, and only an Approved task has a
 * decided review at its CURRENT cycle. Every other status leaves the current
 * cycle undecided, which is what lets a reviewer still open and submit it.
 *
 * TIME IS DERIVED TOO, and it used not to be. Every review once carried one
 * value in `createdAt`, `decidedAt` and `updatedAt` — `task.submittedAt` — which
 * made three separate things wrong at once: turnaround was zero for every review
 * in the product, all six cycles of a long-running task landed on a single
 * instant so any activity-over-time series was a spike rather than a trend, and
 * `decidedAt` claimed a decision happened at the moment of submission. Cycles
 * are now walked backwards from the latest submission and each review opens
 * before it is decided.
 */
function seedReviews(tasks: Task[]): Review[] {
  const reviews: Review[] = [];

  for (const task of tasks) {
    if (task.reviewerId === null) continue;

    const isApproved = task.status === 'Approved';
    const decidedRounds = isApproved ? task.reviewRound : task.reviewRound - 1;
    const latest = Date.parse(task.submittedAt ?? task.createdAt);

    for (let round = 1; round <= decidedRounds; round += 1) {
      const isFinalApproval = isApproved && round === task.reviewRound;
      const id = `rev-${task.id}-${String(round)}`;

      /*
       * Walk backwards from the most recent submission: the LAST decided round
       * sits at `submittedAt` and each earlier one is three days before it. That
       * keeps the rounds in the order they actually happened, which is what
       * gives an activity chart a real x-axis.
       */
      const decidedMs = latest - (decidedRounds - round) * CYCLE_GAP_DAYS * DAY_MS;
      // 2–72 hours from opening the review to deciding it. Wide enough that the
      // turnaround buckets on the reviewer's Analytics tab all have occupants.
      const turnaroundHours = hashedRange(id, 2, 72);

      const decidedAt = new Date(decidedMs).toISOString();
      const createdAt = new Date(decidedMs - turnaroundHours * HOUR_MS).toISOString();

      reviews.push({
        id,
        taskId: task.id,
        reviewRound: round,
        reviewerId: task.reviewerId,
        reviewerName: seededUsers.find((u) => u.id === task.reviewerId)?.name ?? 'Unknown',
        currentReviewSessionId: task.id === 't-semco-017' ? `rs-${task.id}-1` : null,
        comments:
          task.id === 't-semco-017'
            ? [
                {
                  id: `cm-${id}-1`,
                  reviewRound: round,
                  text: 'The batch transaction does not properly handle the retry cancellation path when database timeouts occur.',
                  createdAt,
                  reviewerId: task.reviewerId,
                  reviewerName:
                    seededUsers.find((u) => u.id === task.reviewerId)?.name ?? 'Hiruni Wijethilaka',
                  reviewSessionId: `rs-${task.id}-1`,
                  screenshots: [],
                },
                {
                  id: `cm-${id}-2`,
                  reviewRound: round,
                  text: 'Please add unit tests covering the error rollback scenario in the worker pool.',
                  createdAt,
                  reviewerId: task.reviewerId,
                  reviewerName:
                    seededUsers.find((u) => u.id === task.reviewerId)?.name ?? 'Hiruni Wijethilaka',
                  reviewSessionId: `rs-${task.id}-1`,
                  screenshots: [],
                },
              ]
            : [],
        generalCheck: [],
        findings: isFinalApproval
          ? { incorrectCode: '', incompleteImplementation: '', sourceFormatting: '' }
          : {
              incorrectCode: 'Logic does not cover the cancellation path.',
              incompleteImplementation: 'Missing test coverage for rollback handler.',
              sourceFormatting: '',
            },
        otherRemarks: '',
        feedbackSummary: isFinalApproval
          ? 'Looks good. Approved.'
          : 'Please address the findings above and resubmit.',
        // Rank 1 permits approval; 2 and 3 force the Request Changes path
        // (FL 2.9.2.5-01), so a Request Changes round can never carry rank 1.
        rank: isFinalApproval ? 1 : round % 2 === 0 ? 3 : 2,
        previousFeedbackReviewNote: null,
        screenshots: [],
        decision: isFinalApproval ? 'Approved' : 'ChangesRequested',
        decidedAt,
        createdAt,
        updatedAt: decidedAt,
      });
    }
  }

  return reviews;
}

/**
 * Every task that claims a complete checklist gets one, fully answered.
 *
 * Derived rather than fixtured because the answer set depends on the task's
 * types and on the template — a hand-written fixture would silently disagree
 * with `checklistRules.answersComplete()` the first time a question is added.
 */
function seedChecklists(tasks: Task[], template: ChecklistCategory[]): TaskChecklist[] {
  return tasks
    .filter((task) => task.isChecklistComplete && task.taskTypeIds.length > 0)
    .map((task) => {
      // Same filter the domain layer applies: a question renders when it is
      // active and covers one of the task's types.
      const questions = template
        .filter(
          (category) =>
            category.isActive &&
            category.applicableTaskTypeIds.some((id) => task.taskTypeIds.includes(id)),
        )
        .sort((a, b) => a.order - b.order)
        .flatMap((category) =>
          category.questions
            .filter((question) => question.isActive)
            .sort((a, b) => a.order - b.order)
            .map((question) => ({ question, categoryName: category.name })),
        );

      return taskChecklistSchema.parse({
        id: `cl-${task.id}`,
        taskId: task.id,
        taskTypeIds: task.taskTypeIds,
        // A deterministic sprinkle of "No" so the issue count is non-zero on
        // some tasks — an all-Yes seed would never exercise the issue badge.
        answers: questions.map(({ question, categoryName }, index) => ({
          questionId: question.id,
          answer: index % 7 === 3 ? 'No' : 'Yes',
          // The wording is snapshotted here exactly as the handler does it, so
          // seeded history behaves identically to history created at runtime.
          questionText: question.text,
          categoryName,
          order: index,
        })),
        remarks: '',
        isComplete: true,
        checkedDate: task.submittedAt ?? task.createdAt,
        developerId: task.developerId,
      });
    });
}

/** A minimal audit trail so the detail screens have real history to render. */
function seedEvents(tasks: Task[], reviews: Review[]): TaskEvent[] {
  const events: TaskEvent[] = [];

  for (const task of tasks) {
    events.push({
      id: `ev-${task.id}-created`,
      taskId: task.id,
      kind: 'Created',
      reviewRound: 1,
      actorId: task.developerId,
      actorName: '',
      note: null,
      occurredAt: task.createdAt,
    });

    if (task.submittedAt !== null) {
      events.push({
        id: `ev-${task.id}-submitted`,
        taskId: task.id,
        kind: 'Submitted',
        reviewRound: 1,
        actorId: task.developerId,
        actorName: '',
        note: null,
        occurredAt: task.submittedAt,
      });
    }

    if (task.reviewerId !== null) {
      events.push({
        id: `ev-${task.id}-picked`,
        taskId: task.id,
        kind: 'Picked',
        reviewRound: task.reviewRound,
        actorId: task.reviewerId,
        actorName: '',
        note: null,
        occurredAt: task.updatedAt,
      });
    }
  }

  for (const review of reviews) {
    if (review.reviewerId === null) continue;
    if (review.decision === 'ChangesRequested') {
      events.push({
        id: `ev-${review.taskId}-changes-requested-${String(review.reviewRound)}`,
        taskId: review.taskId,
        kind: 'ChangesRequested',
        reviewRound: review.reviewRound,
        actorId: review.reviewerId,
        actorName: '',
        note: review.feedbackSummary === '' ? null : review.feedbackSummary,
        occurredAt: review.decidedAt ?? review.updatedAt,
      });
    } else if (review.decision === 'Approved') {
      events.push({
        id: `ev-${review.taskId}-approved-${String(review.reviewRound)}`,
        taskId: review.taskId,
        kind: 'Approved',
        reviewRound: review.reviewRound,
        actorId: review.reviewerId,
        actorName: '',
        note: review.feedbackSummary === '' ? null : review.feedbackSummary,
        occurredAt: review.decidedAt ?? review.updatedAt,
      });
    }
  }

  return events.map((event) => taskEventSchema.parse(event));
}

function seedChecklistSubmissions(
  tasks: readonly Task[],
  taskTypes: readonly TaskTypeRecord[],
  template: readonly ChecklistCategory[],
  checklists: readonly TaskChecklist[],
): ChecklistSubmission[] {
  return checklists.flatMap((checklist) => {
    const task = tasks.find((entry) => entry.id === checklist.taskId);
    if (task?.submittedAt === null || task === undefined) return [];
    const byCategory = new Map<string, ChecklistSubmission['categories'][number]>();
    for (const answer of checklist.answers) {
      const key = answer.categoryName;
      const source = template.find((category) => category.name === key);
      const category = byCategory.get(key) ?? {
        categoryId: source?.id ?? `snapshot-${key.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        categoryName: key,
        categoryOrder: source?.order ?? byCategory.size + 1,
        questions: [],
      };
      category.questions.push({
        questionId: answer.questionId,
        questionText: answer.questionText,
        questionOrder: answer.order,
        answer: answer.answer,
      });
      byCategory.set(key, category);
    }
    return [
      {
        id: `cls-${task.id}-1`,
        taskId: task.id,
        version: 1,
        submittedAt: task.submittedAt,
        developerId: checklist.developerId,
        taskTypes: checklist.taskTypeIds.map((id) => ({
          id,
          name: taskTypes.find((entry) => entry.id === id)?.name ?? id,
        })),
        categories: [...byCategory.values()]
          .map((category) => ({
            ...category,
            questions: [...category.questions].sort((a, b) => a.questionOrder - b.questionOrder),
          }))
          .sort((a, b) => a.categoryOrder - b.categoryOrder),
        remarks: checklist.remarks,
      },
    ];
  });
}

/* -------------------------------------------------------------------------- */
/* Read helpers over a dataset                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Joins a task with the display fields every grid needs — the shape NestJS
 * returns from its list and detail endpoints (`taskListItemSchema`).
 */
export function toListItem(data: Dataset, task: Task): TaskListItem {
  const customer = data.customers.find((c) => c.id === task.customerId);
  const developer = data.users.find((u) => u.id === task.developerId);
  const reviewer =
    task.reviewerId === null ? undefined : data.users.find((u) => u.id === task.reviewerId);
  const latestHandover = data.handovers
    .filter((handover) => handover.taskId === task.id)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];

  return {
    ...task,
    handedOverByName: latestHandover?.fromReviewerName ?? null,
    customerName: customer?.name ?? 'Unknown',
    customerCode: customer?.code ?? '??',
    customerColor: customer?.color ?? '#6b7591',
    developerName: developer?.name ?? 'Unknown',
    reviewerName: reviewer?.name ?? null,
  };
}

/** Events newest first with actor names resolved, as GET /tasks/:id/events. */
export function eventsFor(data: Dataset, taskId: string): TaskEvent[] {
  return data.events
    .filter((event) => event.taskId === taskId)
    .map((event) => ({
      ...event,
      actorName: data.users.find((u) => u.id === event.actorId)?.name ?? 'Unknown',
    }))
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

/** Every round of a task's reviews, newest first. */
export function reviewsFor(data: Dataset, taskId: string): Review[] {
  return data.reviews
    .filter((r) => r.taskId === taskId)
    .sort((a, b) => b.reviewRound - a.reviewRound);
}

/** Checklist submissions, newest version first (as NestJS returns them). */
export function checklistSubmissionsFor(data: Dataset, taskId: string): ChecklistSubmission[] {
  return data.checklistSubmissions
    .filter((entry) => entry.taskId === taskId)
    .sort((a, b) => b.version - a.version);
}

/** A notification as GET /notifications sends it (no owning user id). */
export function notificationsFor(data: Dataset, userId: string): Notification[] {
  return data.notifications
    .filter((entry) => entry.userId === userId)
    .map(({ userId: _owner, ...notification }) => notification)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
