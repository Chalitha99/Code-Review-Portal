import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { EmailBody } from '../../integrations/mail/templates/layout.js';

export const TASK_EMAIL_EVENTS = [
  'TASK_PICKED',
  'CHANGES_REQUESTED',
  'TASK_APPROVED',
  'TASK_RESUBMITTED',
  'RESUBMISSION_UNASSIGNED',
  'TASK_HANDED_OVER',
  'HANDOVER_REASSIGNED',
  'REVIEWER_ASSIGNED',
  'FOLLOW_UP_REVIEWER_CHANGED',
  'TASK_CANCELLED',
] as const;

export const taskEmailPayloadSchema = z.object({
  event: z.enum(TASK_EMAIL_EVENTS),
  actorName: z.string(),
  occurredAt: z.iso.datetime(),
  reviewerId: z.string().optional(),
  reviewerName: z.string().optional(),
  previousReviewerName: z.string().optional(),
  developerName: z.string().optional(),
  reason: z.string().optional(),
  round: z.number().int().optional(),
  findings: z.number().int().optional(),
});
export type TaskEmailPayload = z.infer<typeof taskEmailPayloadSchema>;

export function taskEmail(
  event: TaskEmailPayload['event'],
  actorName: string,
  facts: Omit<TaskEmailPayload, 'event' | 'actorName' | 'occurredAt'> = {},
  occurredAt: Date = new Date(),
): TaskEmailPayload {
  const clean = Object.fromEntries(
    Object.entries(facts).filter(
      ([, value]) => value !== undefined && value !== null && value !== '',
    ),
  );
  return { event, actorName, occurredAt: occurredAt.toISOString(), ...clean };
}

/** Columns that queue a notification row for email. */
export function pendingEmailColumns(payload: TaskEmailPayload) {
  return {
    emailStatus: 'PENDING' as const,
    emailAttempts: 0,
    emailNextAttemptAt: new Date(),
    payload: payload as unknown as Prisma.InputJsonObject,
  };
}

export type RecipientRelation = 'developer' | 'reviewer' | 'admin';

export interface TaskEmailContext {
  recipientName: string;
  relation: RecipientRelation;
  task: { code: string; title: string; customer: string };
  link: string;
  when: string;
}

interface Copy {
  subject: string;
  heading: string;
  paragraph: string;
  action?: string;
}

function copyFor(p: TaskEmailPayload, c: TaskEmailContext): Copy {
  const ref = `${c.task.code} (${c.task.customer})`;
  const reviewer = p.reviewerName ?? 'A reviewer';
  switch (p.event) {
    case 'TASK_PICKED':
      return {
        subject: `${c.task.code}: picked up for review by ${reviewer}`,
        heading: 'Your task is being reviewed',
        paragraph: `Reviewer ${reviewer} picked up your task ${ref} for review.`,
        action: 'Open task',
      };
    case 'CHANGES_REQUESTED':
      return {
        subject: `${c.task.code}: changes requested`,
        heading: 'Changes requested',
        paragraph: `${reviewer} reviewed your task ${ref} and requested changes. Respond to each finding, fix the code and resubmit.`,
        action: 'View findings',
      };
    case 'TASK_APPROVED':
      return {
        subject: `${c.task.code}: approved`,
        heading: 'Your task was approved',
        paragraph: `${reviewer} approved your task ${ref}.`,
        action: 'Open task',
      };
    case 'TASK_RESUBMITTED':
      return {
        subject: `${c.task.code}: resubmitted for your review`,
        heading: 'A task is back for your review',
        paragraph: `${p.developerName ?? p.actorName} addressed the changes you requested on ${ref} and resubmitted it. It is assigned to you.`,
        action: 'Review task',
      };
    case 'RESUBMISSION_UNASSIGNED':
      return {
        subject: `${c.task.code}: resubmitted and needs a reviewer`,
        heading: 'A resubmitted task needs a reviewer',
        paragraph: `${p.developerName ?? p.actorName} resubmitted ${ref}, but ${p.previousReviewerName ?? 'the previous reviewer'} is no longer available. It is back in the review pool; assign a reviewer if needed.`,
        action: 'Open task',
      };
    case 'TASK_HANDED_OVER':
      return c.relation === 'developer'
        ? {
            subject: `${c.task.code}: your reviewer handed the task over`,
            heading: 'Your task is waiting for a new reviewer',
            paragraph: `${p.actorName} handed over the review of your task ${ref}. An administrator or another reviewer will pick it up.`,
            action: 'Open task',
          }
        : {
            subject: `${c.task.code}: handed over by ${p.actorName}`,
            heading: 'A review was handed over',
            paragraph: `Reviewer ${p.actorName} handed over ${ref}. It needs a new reviewer.`,
            action: 'Open handovers',
          };
    case 'HANDOVER_REASSIGNED':
    case 'REVIEWER_ASSIGNED':
      return c.relation === 'reviewer'
        ? {
            subject: `${c.task.code}: assigned to you for review`,
            heading: 'A review was assigned to you',
            paragraph: `${p.actorName} assigned ${ref} to you for review.`,
            action: 'Review task',
          }
        : {
            subject: `${c.task.code}: ${reviewer} is now your reviewer`,
            heading: 'Your task has a new reviewer',
            paragraph: `${p.actorName} assigned ${reviewer} to review your task ${ref}.`,
            action: 'Open task',
          };
    case 'FOLLOW_UP_REVIEWER_CHANGED':
      return c.relation === 'reviewer'
        ? {
            subject: `${c.task.code}: you are the follow-up reviewer`,
            heading: 'You will review the resubmission',
            paragraph: `${p.actorName} made you the follow-up reviewer for ${ref}. It comes to you when the developer resubmits.`,
            action: 'Open task',
          }
        : {
            subject: `${c.task.code}: ${reviewer} will review your resubmission`,
            heading: 'Your follow-up reviewer changed',
            paragraph: `${p.actorName} changed who reviews your resubmission of ${ref}. It will go to ${reviewer}.`,
            action: 'Open task',
          };
    case 'TASK_CANCELLED':
      return {
        subject: `${c.task.code}: cancelled`,
        heading: 'A task was cancelled',
        paragraph: `${p.actorName} cancelled ${ref}. No further review is needed.`,
      };
  }
}

export function buildTaskEmail(
  payload: TaskEmailPayload,
  context: TaskEmailContext,
): { subject: string; body: EmailBody } {
  const copy = copyFor(payload, context);
  const details: (readonly [string, string])[] = [
    ['Task', `${context.task.code} — ${context.task.title}`],
    ['Customer', context.task.customer],
  ];
  if (payload.reviewerName && payload.event !== 'TASK_RESUBMITTED') {
    details.push(['Reviewer', payload.reviewerName]);
  }
  if (payload.previousReviewerName)
    details.push(['Previous reviewer', payload.previousReviewerName]);
  if (payload.round !== undefined) details.push(['Review round', String(payload.round)]);
  if (payload.findings !== undefined) details.push(['Findings', String(payload.findings)]);
  if (payload.reason) details.push(['Reason', payload.reason]);
  details.push(['By', payload.actorName], ['When', context.when]);

  return {
    subject: copy.subject,
    body: {
      heading: copy.heading,
      greeting: `Hello ${context.recipientName},`,
      paragraphs: [copy.paragraph],
      details,
      ...(copy.action ? { action: { label: copy.action, url: context.link } } : {}),
      notes: ['You receive this because you are involved in this task.'],
    },
  };
}
