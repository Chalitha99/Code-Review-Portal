import type { Notification } from '@prisma/client';

export interface RecipientContext {
  id: string;
  isAdmin: boolean;
  isReviewer: boolean;
}

/** Where a notification takes this recipient: the screen for their part in the task. */
export function notificationHref(
  row: Pick<Notification, 'taskId' | 'notificationType'> & { task: { developerId: string } | null },
  recipient: RecipientContext,
): string {
  if (row.taskId === null) return '/crp';
  const taskId = encodeURIComponent(row.taskId);
  if (row.task?.developerId === recipient.id) return `/crp/developer/tasks/${taskId}`;
  if (row.notificationType === 'TASK_HANDOVER' && recipient.isAdmin) return '/crp/admin/handovers';
  if (recipient.isReviewer) return `/crp/reviewer/tasks/${taskId}`;
  if (recipient.isAdmin) return `/crp/admin/tasks/${taskId}`;
  return '/crp';
}
