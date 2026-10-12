/**
 * Reviewer-side `apiStub` answers over a fixture dataset.
 *
 * Writes are ECHOED the way NestJS stores them — the draft a reviewer saves is
 * the draft they get back; a verdict or a developer response is recorded as
 * sent — so autosave, reload and refetch behave as they do against the real
 * API. Workflow OUTCOMES (a decision, a handover) are modelled by small,
 * explicit helpers the test opts into, and none of NestJS's validation rules
 * are repeated here: those are tested in apps/api.
 */
import {
  reviewDraftSchema,
  type IssueResponseRecord,
  type Review,
  type Task,
  type TaskEvent,
} from '@sdp/contracts';
import { useSession } from '@/hooks/useSession.ts';
import { apiError, apiStub, reply } from './apiStub.ts';
import { toListItem, type Dataset } from './fixtures/dataset.ts';
import { page, serveNotifications, serveReferenceData, serveTaskDetail } from './serve.ts';

function taskOf(data: Dataset, taskId: string): Task | undefined {
  return data.tasks.find((entry) => entry.id === taskId);
}

function actor(data: Dataset) {
  const id = useSession.getState().userId ?? '';
  return { id, name: data.users.find((user) => user.id === id)?.name ?? 'Unknown' };
}

export function recordEvent(
  data: Dataset,
  event: Omit<TaskEvent, 'id' | 'actorName' | 'occurredAt'> & { occurredAt?: string },
): void {
  data.events.push({
    ...event,
    id: `ev-${event.taskId}-${event.kind}-${String(data.events.length + 1)}`,
    actorName: data.users.find((user) => user.id === event.actorId)?.name ?? 'Unknown',
    occurredAt: event.occurredAt ?? new Date().toISOString(),
  });
}

/**
 * The reviewer workspace for whoever is signed in: reference data, the bell,
 * the three queues as the test states them, and the detail endpoints of every
 * fixture task. An unknown task id answers 404 like NestJS.
 */
export function serveReviewerWorkspace(
  data: Dataset,
  queues: { available?: Task[]; assigned?: Task[]; history?: Task[] } = {},
): void {
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
  apiStub.get('/tasks', ({ query }) => {
    const scope = (query.get('scope') ?? 'available') as keyof typeof queues;
    return page((queues[scope] ?? []).map((task) => toListItem(data, task)));
  });
  apiStub.get('/reviews', () => data.reviews);
  apiStub.get('/handovers', () => data.handovers);
  for (const task of data.tasks) serveTaskDetail(data, task);
}

/**
 * PUT /tasks/:id/review — stores the reviewer's draft for the task's current
 * round and returns it, as NestJS does. `?source=manual` (an explicit Save as
 * Draft) also records the ReviewDraftSaved history event NestJS writes; an
 * autosave records nothing.
 */
export function serveReviewDraftWrites(data: Dataset): void {
  apiStub.put('/tasks/:taskId/review', ({ params, body, query }) => {
    const task = taskOf(data, String(params['taskId']));
    if (!task) return apiError(404, 'TASK_NOT_FOUND', 'Task not found.');
    const draft = reviewDraftSchema.parse(body);
    const me = actor(data);
    const session = task.currentReviewSessionId ?? `rs-${task.id}-${String(task.reviewRound)}`;
    task.currentReviewSessionId = session;
    const now = new Date().toISOString();
    let review = data.reviews.find(
      (entry) => entry.taskId === task.id && entry.reviewRound === task.reviewRound,
    );
    if (!review) {
      review = {
        id: `rev-${task.id}-${String(task.reviewRound)}`,
        taskId: task.id,
        reviewRound: task.reviewRound,
        reviewerId: me.id,
        reviewerName: me.name,
        currentReviewSessionId: session,
        comments: [],
        generalCheck: [],
        findings: { incorrectCode: '', incompleteImplementation: '', sourceFormatting: '' },
        otherRemarks: '',
        feedbackSummary: '',
        screenshots: [],
        rank: null,
        previousFeedbackReviewNote: null,
        previousFeedbackAcknowledged: null,
        decision: null,
        decidedAt: null,
        createdAt: now,
        updatedAt: now,
      } satisfies Review;
      data.reviews.push(review);
    }
    const existing = review.comments;
    Object.assign(review, {
      reviewerId: me.id,
      reviewerName: me.name,
      currentReviewSessionId: session,
      rank: draft.rank,
      generalCheck: draft.generalCheck,
      findings: draft.findings,
      otherRemarks: draft.otherRemarks,
      feedbackSummary: draft.feedbackSummary,
      previousFeedbackReviewNote: draft.previousFeedbackReviewNote ?? null,
      previousFeedbackAcknowledged: draft.previousFeedbackAcknowledged ?? null,
      // Comments the caller did not write keep their stored author and session.
      comments: draft.comments.map((comment) => {
        const stored = existing.find((entry) => entry.id === comment.id);
        const othersComment =
          stored !== undefined &&
          ((stored.reviewerId !== undefined && stored.reviewerId !== me.id) ||
            (stored.reviewSessionId !== undefined && stored.reviewSessionId !== session));
        if (stored && othersComment) return stored;
        return { ...comment, reviewerId: me.id, reviewerName: me.name, reviewSessionId: session };
      }),
      updatedAt: now,
    });
    if (query.get('source') === 'manual') {
      recordEvent(data, {
        taskId: task.id,
        kind: 'ReviewDraftSaved',
        reviewRound: task.reviewRound,
        actorId: me.id,
        note: null,
      });
    }
    return review;
  });
}

/**
 * POST /tasks/:id/review — the outcome NestJS records for an ACCEPTED decision:
 * Approved closes the task; Request Changes returns it to the developer with
 * the reviewer cleared. The answer is the updated task.
 */
export function serveReviewDecisions(data: Dataset): void {
  apiStub.post('/tasks/:taskId/review', ({ params, body }) => {
    const task = taskOf(data, String(params['taskId']));
    if (!task) return apiError(404, 'TASK_NOT_FOUND', 'Task not found.');
    const input = body as { decision: 'Approved' | 'ChangesRequested'; draft: unknown };
    const draft = reviewDraftSchema.parse(input.draft);
    const me = actor(data);
    const now = new Date().toISOString();
    const review =
      data.reviews.find(
        (entry) => entry.taskId === task.id && entry.reviewRound === task.reviewRound,
      ) ??
      ({
        id: `rev-${task.id}-${String(task.reviewRound)}`,
        taskId: task.id,
        reviewRound: task.reviewRound,
        reviewerId: me.id,
        reviewerName: me.name,
        currentReviewSessionId: task.currentReviewSessionId ?? null,
        comments: [],
        generalCheck: [],
        findings: { incorrectCode: '', incompleteImplementation: '', sourceFormatting: '' },
        otherRemarks: '',
        feedbackSummary: '',
        screenshots: [],
        rank: null,
        decision: null,
        decidedAt: null,
        createdAt: now,
        updatedAt: now,
      } satisfies Review);
    if (!data.reviews.includes(review)) data.reviews.push(review);
    Object.assign(review, {
      rank: draft.rank,
      comments: draft.comments,
      generalCheck: draft.generalCheck,
      feedbackSummary: draft.feedbackSummary,
      otherRemarks: draft.otherRemarks,
      decision: input.decision,
      decidedAt: now,
      updatedAt: now,
    });
    if (input.decision === 'Approved') {
      Object.assign(task, { status: 'Approved', updatedAt: now, currentReviewSessionId: null });
    } else {
      Object.assign(task, {
        status: 'ChangesRequested',
        reviewerId: null,
        currentReviewSessionId: null,
        countedCycle: (task.countedCycle ?? 0) + 1,
        updatedAt: now,
      });
    }
    recordEvent(data, {
      taskId: task.id,
      kind: input.decision,
      reviewRound: task.reviewRound,
      actorId: me.id,
      note: null,
    });
    return toListItem(data, task);
  });
}

/**
 * The developer's responses and the reviewer's verdicts, recorded as sent:
 *   POST   /tasks/:id/responses                      one response per finding per round
 *   DELETE /tasks/:id/responses/:responseId
 *   PATCH  /tasks/:id/responses/:responseId/verdict  Pending clears the adjudication
 */
export function serveResponseWrites(data: Dataset): void {
  apiStub.post('/tasks/:taskId/responses', ({ params, body }) => {
    const task = taskOf(data, String(params['taskId']));
    if (!task) return apiError(404, 'TASK_NOT_FOUND', 'Task not found.');
    const input = body as {
      commentId?: string | null;
      screenshotId?: string | null;
      kind: IssueResponseRecord['kind'];
      rejectionReason?: string;
    };
    const key = input.commentId ?? input.screenshotId ?? 'overall';
    const record: IssueResponseRecord = {
      id: `resp-${task.id}-${String(task.reviewRound)}-${key}`,
      taskId: task.id,
      reviewRound: task.reviewRound,
      commentId: input.commentId ?? null,
      screenshotId: input.screenshotId ?? null,
      kind: input.kind,
      rejectionReason: input.rejectionReason?.trim() ? input.rejectionReason.trim() : null,
      verdict: 'Pending',
      respondedAt: new Date().toISOString(),
    };
    data.issueResponses = [
      ...data.issueResponses.filter((entry) => entry.id !== record.id),
      record,
    ];
    return data.issueResponses.filter((entry) => entry.taskId === task.id);
  });
  apiStub.delete('/tasks/:taskId/responses/:responseId', ({ params }) => {
    data.issueResponses = data.issueResponses.filter((entry) => entry.id !== params['responseId']);
    return data.issueResponses.filter((entry) => entry.taskId === params['taskId']);
  });
  apiStub.patch('/tasks/:taskId/responses/:responseId/verdict', ({ params, body }) => {
    const record = data.issueResponses.find((entry) => entry.id === params['responseId']);
    if (!record) return apiError(404, 'NOT_FOUND', 'Response record not found.');
    const input = body as {
      verdict: IssueResponseRecord['verdict'];
      reviewerComment?: string | null;
    };
    record.verdict = input.verdict;
    record.reviewerComment = input.verdict === 'Overruled' ? (input.reviewerComment ?? null) : null;
    record.adjudicatedAt = input.verdict === 'Pending' ? null : new Date().toISOString();
    return record;
  });
}

/**
 * The handover workflow's ACCEPTED outcomes, as NestJS records them:
 *   POST /tasks/:id/handover        the task goes back to the queue (Submitted, or
 *                                   ReSubmitted after a returned round), unassigned,
 *                                   flagged handed over; a Pending handover is opened
 *   POST /handovers/:id/reassign    the named reviewer holds it, InReview
 *   POST /handovers/:id/return      left in the open queue; handover resolved
 *   POST /tasks/:id/pick            the picker holds it; a pending handover resolves to them
 */
export function serveHandoverOutcomes(data: Dataset): void {
  apiStub.post('/tasks/:taskId/handover', ({ params, body }) => {
    const task = taskOf(data, String(params['taskId']));
    if (!task) return apiError(404, 'TASK_NOT_FOUND', 'Task not found.');
    const me = actor(data);
    const now = new Date().toISOString();
    const returnedBefore = data.reviews.some(
      (review) => review.taskId === task.id && review.decision === 'ChangesRequested',
    );
    Object.assign(task, {
      status: returnedBefore ? 'ReSubmitted' : 'Submitted',
      reviewerId: null,
      currentReviewSessionId: null,
      isHandedOver: true,
      updatedAt: now,
    });
    data.handovers.push({
      id: `HND-${now.slice(0, 10).replaceAll('-', '')}-${String(data.handovers.length + 1).padStart(4, '0')}`,
      taskId: task.id,
      fromReviewerId: me.id,
      fromReviewerName: me.name,
      reason: String((body as { reason: string }).reason).trim(),
      status: 'Pending',
      reassignedToId: null,
      reassignedToName: null,
      reassignedById: null,
      createdAt: now,
      resolvedAt: null,
    });
    recordEvent(data, {
      taskId: task.id,
      kind: 'HandedOver',
      reviewRound: task.reviewRound,
      actorId: me.id,
      note: null,
    });
    return toListItem(data, task);
  });
  apiStub.post('/handovers/:handoverId/reassign', ({ params, body }) => {
    const handover = data.handovers.find((entry) => entry.id === params['handoverId']);
    if (!handover) return apiError(404, 'NOT_FOUND', 'Handover not found.');
    const reviewerId = (body as { reviewerId: string }).reviewerId;
    const task = taskOf(data, handover.taskId)!;
    const now = new Date().toISOString();
    Object.assign(task, { status: 'InReview', reviewerId, isHandedOver: false, updatedAt: now });
    Object.assign(handover, {
      status: 'Reassigned',
      reassignedToId: reviewerId,
      reassignedToName: data.users.find((user) => user.id === reviewerId)?.name ?? null,
      reassignedById: actor(data).id,
      resolvedAt: now,
    });
    return handover;
  });
  apiStub.post('/handovers/:handoverId/return', ({ params }) => {
    const handover = data.handovers.find((entry) => entry.id === params['handoverId']);
    if (!handover) return apiError(404, 'NOT_FOUND', 'Handover not found.');
    Object.assign(handover, {
      status: 'ReturnedToQueue',
      reassignedById: actor(data).id,
      resolvedAt: new Date().toISOString(),
    });
    return handover;
  });
  apiStub.get('/handovers', () => data.handovers);
  apiStub.get('/handovers/:handoverId', ({ params }) => {
    const handover = data.handovers.find((entry) => entry.id === params['handoverId']);
    return handover ?? apiError(404, 'NOT_FOUND', 'Handover not found.');
  });
  apiStub.get('/handovers/:handoverId/draft', () => reply(204));
  apiStub.post('/tasks/:taskId/pick', ({ params }) => {
    const task = taskOf(data, String(params['taskId']));
    if (!task) return apiError(404, 'TASK_NOT_FOUND', 'Task not found.');
    const me = actor(data);
    const now = new Date().toISOString();
    Object.assign(task, {
      status: 'InReview',
      reviewerId: me.id,
      isHandedOver: false,
      updatedAt: now,
    });
    for (const handover of data.handovers) {
      if (handover.taskId === task.id && handover.status === 'Pending') {
        Object.assign(handover, {
          status: 'Reassigned',
          reassignedToId: me.id,
          reassignedToName: me.name,
          resolvedAt: now,
        });
      }
    }
    return toListItem(data, task);
  });
}

export { reply };
