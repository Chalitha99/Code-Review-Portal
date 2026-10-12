/**
 * Shorthands that register `apiStub` answers from a fixture dataset.
 *
 * Every helper serves EXACTLY the rows it is given: there is no scope logic,
 * no visibility rule and no state machine here — those are NestJS's job and are
 * tested in apps/api. A test that renders "Available Tasks" passes the rows the
 * server would send for that scope, so the expectation is visible in the test.
 */
import { checklistDraftSchema, type Task, type TaskListItem } from '@sdp/contracts';
import { useSession } from '@/hooks/useSession.ts';
import { apiError, apiStub, reply } from './apiStub.ts';
import {
  buildDataset,
  checklistSubmissionsFor,
  eventsFor,
  notificationsFor,
  reviewsFor,
  toListItem,
  type Dataset,
} from './fixtures/dataset.ts';

export type TaskScope = 'mine' | 'all' | 'available' | 'assigned' | 'history';

export function page<T>(items: readonly T[]) {
  return { items, pagination: { page: 1, pageSize: items.length || 1, total: items.length } };
}

/** Customers, task types, the published checklist, General Check and the user directory. */
export function serveReferenceData(data: Dataset = buildDataset()): Dataset {
  apiStub.get('/customers', () => data.customers);
  apiStub.get('/task-types', ({ query }) =>
    query.get('scope') === 'all' ? data.taskTypes : data.taskTypes.filter((type) => type.isActive),
  );
  apiStub.get('/checklist-template', ({ query }) =>
    query.get('scope') === 'all'
      ? data.checklistTemplate
      : data.checklistTemplate
          .filter((category) => category.isActive)
          .map((category) => ({
            ...category,
            questions: category.questions.filter((question) => question.isActive),
          }))
          .filter((category) => category.questions.length > 0),
  );
  apiStub.get('/general-check', () => data.generalCheck);
  apiStub.get('/users', () => data.users);
  return data;
}

/**
 * The notification bell, read-only. Without `userId` it answers for whoever is
 * signed in at the time of the request (the cookie-backed identity).
 */
export function serveNotifications(data: Dataset, userId?: string): void {
  const owner = () => userId ?? useSession.getState().userId ?? '';
  apiStub.get('/notifications', () => notificationsFor(data, owner()));
  apiStub.post('/notifications/read-all', () => reply(204));
  apiStub.post('/notifications/:id/read', ({ params }) => {
    const found = notificationsFor(data, owner()).find((entry) => entry.id === params['id']);
    return found ? { ...found, isRead: true } : reply(404);
  });
}

/**
 * POST /auth/login as NestJS answers it: the account for `password`, else the
 * one generic 401. A successful sign-in also makes GET /auth/me answer with that
 * user, as the session cookie NestJS sets would.
 */
export function serveSignIn(data: Dataset, password: string): void {
  apiStub.post('/auth/login', ({ body }) => {
    const input = body as { email?: string; password?: string };
    const account = data.users.find((user) => user.email === input.email);
    if (!account || input.password !== password) {
      return apiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
    }
    apiStub.get('/auth/me', () => account);
    return account;
  });
}

/** What GET /tasks?scope=<scope> answers, per scope the screen asks for. */
export function serveTaskLists(lists: Partial<Record<TaskScope, readonly TaskListItem[]>>): void {
  apiStub.get('/tasks', ({ query }) => {
    const scope = (query.get('scope') ?? 'mine') as TaskScope;
    return page(lists[scope] ?? []);
  });
}

export function serveTaskSummary(total: number): void {
  apiStub.get('/tasks/summary', () => ({ total }));
}

/**
 * The detail endpoints of one task, from the dataset: the task itself, its
 * events, checklist, submissions, attachments, review rounds, the open review
 * and the developer's responses.
 *
 * Given a dataset `Task`, every endpoint reads the dataset at request time, so a
 * write the test modelled shows on the next fetch, as it would from NestJS.
 * Given a `TaskListItem`, that exact object is served as the task — for a test
 * that wants to state the server's answer outright.
 */
export function serveTaskDetail(data: Dataset, task: Task | TaskListItem): TaskListItem {
  const id = task.id;
  const fixed = 'customerName' in task ? task : null;
  const current = (): TaskListItem => {
    if (fixed) return fixed;
    const live = data.tasks.find((entry) => entry.id === id) ?? task;
    return toListItem(data, live);
  };
  apiStub.get(`/tasks/${id}`, () => current());
  apiStub.get(`/tasks/${id}/events`, () => eventsFor(data, id));
  apiStub.get(`/tasks/${id}/checklist`, () => {
    const checklist = data.checklists.find((entry) => entry.taskId === id);
    return checklist ?? reply(204);
  });
  apiStub.get(`/tasks/${id}/checklist-submissions`, () => checklistSubmissionsFor(data, id));
  apiStub.get(`/tasks/${id}/attachments`, () =>
    data.attachments.filter((entry) => entry.taskId === id),
  );
  apiStub.get(`/tasks/${id}/reviews`, () =>
    reviewsFor(data, id).map((review) => ({
      ...review,
      responses: data.issueResponses.filter(
        (response) => response.taskId === id && response.reviewRound === review.reviewRound,
      ),
    })),
  );
  apiStub.get(`/tasks/${id}/review`, () => {
    const round = current().reviewRound;
    const open = reviewsFor(data, id).find((review) => review.reviewRound === round);
    return open ?? reply(204);
  });
  apiStub.get(`/tasks/${id}/responses`, () =>
    data.issueResponses.filter((response) => response.taskId === id),
  );
  return current();
}

export { toListItem };

/**
 * For tests about NAVIGATION and SESSION handling only (not about what a list
 * shows): every task list answers with every fixture task, whatever the scope,
 * plus the admin and reviewer side lists. Screens then have something to render
 * while the test watches the router and the session store.
 */
export function serveWorkspacesForNavigation(data: Dataset): void {
  const items = data.tasks.map((task) => toListItem(data, task));
  serveTaskLists({ mine: items, all: items, available: items, assigned: items, history: items });
  serveTaskSummary(items.length);
  apiStub.get('/handovers', () => data.handovers);
  apiStub.get('/reviews', () => data.reviews);
}

/**
 * Echoes a developer's DRAFT writes back, the way NestJS stores them, so the
 * wizard can save, reopen and keep going:
 *
 *   POST  /tasks                 creates a Draft (code and version are issued
 *                                here only so the reply is contract-shaped)
 *   PATCH /tasks/:id             merges the fields sent
 *   PUT   /tasks/:id/checklist   replaces the checklist
 *
 * Nothing here decides a workflow outcome. Submit, pick, review and the rest
 * are declared by each test with the answer it expects from the server.
 */
export function serveDraftWrites(data: Dataset): void {
  apiStub.post('/tasks', ({ body }) => {
    const input = body as {
      customerId: string;
      crimId: string;
      priority: Task['priority'];
      version?: string;
    };
    const customer = data.customers.find((entry) => entry.id === input.customerId);
    const now = new Date().toISOString();
    const sequence = data.tasks.filter((task) => task.customerId === input.customerId).length + 1;
    const task: Task = {
      id: `t-new-${String(data.tasks.length + 1)}`,
      taskCode: `${customer?.code ?? 'TASK'}-${String(sequence).padStart(3, '0')}`,
      title: `${customer?.name ?? 'Unknown'} - ${input.crimId}`,
      crimId: input.crimId,
      version: input.version ?? '0',
      customerId: input.customerId,
      priority: input.priority,
      status: 'Draft',
      reviewCycle: 0,
      historicalCycle: 0,
      reviewRound: 0,
      countedCycle: 0,
      adjustedCycles: [],
      developerId: useSession.getState().userId ?? '',
      reviewerId: null,
      currentReviewSessionId: null,
      taskTypeIds: [],
      isChecklistComplete: false,
      isHandedOver: false,
      noteToReviewer: null,
      createdAt: now,
      submittedAt: null,
      updatedAt: now,
    };
    data.tasks.push(task);
    serveTaskDetail(data, task);
    return reply(201, toListItem(data, task));
  });

  apiStub.patch('/tasks/:taskId', ({ params, body }) => {
    const task = data.tasks.find((entry) => entry.id === params['taskId']);
    if (!task) return apiError(404, 'TASK_NOT_FOUND', 'Task not found.');
    Object.assign(task, body, { updatedAt: new Date().toISOString() });
    return toListItem(data, task);
  });

  apiStub.put('/tasks/:taskId/checklist', ({ params, body }) => {
    const task = data.tasks.find((entry) => entry.id === params['taskId']);
    if (!task) return apiError(404, 'TASK_NOT_FOUND', 'Task not found.');
    // Stored as NestJS stores it: parsed by the shared contract (remarks
    // trimmed) and kept only for questions the selected task types render.
    const input = checklistDraftSchema.parse(body);
    const questions = data.checklistTemplate
      .filter((category) =>
        category.applicableTaskTypeIds.some((id) => input.taskTypeIds.includes(id)),
      )
      .flatMap((category) =>
        category.questions
          .filter((question) => question.isActive)
          .map((question) => ({ question, category })),
      );
    const applicable = input.answers.filter((entry) =>
      questions.some(({ question }) => question.id === entry.questionId),
    );
    const answered = new Set(applicable.map((entry) => entry.questionId));
    const checklist = {
      id: `cl-${task.id}`,
      taskId: task.id,
      taskTypeIds: input.taskTypeIds,
      answers: applicable.map((entry, order) => {
        const match = questions.find(({ question }) => question.id === entry.questionId);
        return {
          ...entry,
          questionText: match?.question.text ?? entry.questionId,
          categoryName: match?.category.name ?? '',
          order,
        };
      }),
      remarks: input.remarks,
      // The completeness flag NestJS stores: every applicable question answered.
      isComplete:
        questions.length > 0 && questions.every(({ question }) => answered.has(question.id)),
      checkedDate: new Date().toISOString(),
      developerId: task.developerId,
    };
    data.checklists = [...data.checklists.filter((entry) => entry.taskId !== task.id), checklist];
    task.taskTypeIds = input.taskTypeIds;
    task.isChecklistComplete = checklist.isComplete;
    return checklist;
  });
}

/**
 * The developer workspace for `developerId`: reference data, the bell, their
 * own tasks (`scope=mine`), the detail endpoints of every fixture task, draft
 * writes, and the step-1 Version and Task ID previews.
 *
 * Detail endpoints are served for every task because the screens under test
 * follow links freely; which tasks a user may READ is NestJS's rule (tested in
 * apps/api), so a test about refusal declares that 404 itself.
 */
export function serveDeveloperWorkspace(data: Dataset, developerId: string): void {
  // Registered first so every specific route below takes precedence: an id
  // with no fixture task is NestJS's 404.
  for (const suffix of [
    '',
    '/checklist',
    '/checklist-submissions',
    '/events',
    '/reviews',
    '/review',
    '/responses',
    '/attachments',
  ]) {
    apiStub.get(`/tasks/:taskId${suffix}`, () =>
      apiError(404, 'TASK_NOT_FOUND', 'Task not found.'),
    );
  }
  serveReferenceData(data);
  serveNotifications(data);
  serveDraftWrites(data);
  apiStub.get('/tasks', ({ query }) => {
    const scope = query.get('scope') ?? 'mine';
    const rows =
      scope === 'mine' ? data.tasks.filter((task) => task.developerId === developerId) : [];
    return page(rows.map((task) => toListItem(data, task)));
  });
  for (const task of data.tasks) serveTaskDetail(data, task);
  apiStub.get('/task-identities/next-version', ({ query }) => {
    const customer = data.customers.find((entry) => entry.id === query.get('customerId'));
    return { version: 0, title: `${customer?.code ?? ''}-${query.get('crimId') ?? ''}-0` };
  });
  apiStub.get('/customers/:customerId/next-task-id', ({ params }) => {
    const customer = data.customers.find((entry) => entry.id === params['customerId']);
    return { taskCode: `${customer?.code ?? 'TASK'}-01`, sequence: 1 };
  });
}
