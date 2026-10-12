import * as Popover from '@radix-ui/react-popover';
import { Bell, BellOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Notification, NotificationKind } from '@sdp/contracts';
import { cn } from '@/components/ui';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/states.tsx';
import { formatBadgeCount, formatRelative, interpolate } from '@/lib/formatters.ts';
import content from '@/content/notifications.json';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from '../api/queries.ts';

/** Each notification kind carries the colour of the workflow event it reports. */
const KIND_CLASSES: Record<NotificationKind, string> = {
  TaskApproved: 'bg-status-approved-surface text-status-approved',
  ChangesRequested: 'bg-status-changes-requested-surface text-status-changes-requested',
  TaskResubmitted: 'bg-status-re-submitted-surface text-status-re-submitted',
  TaskSubmitted: 'bg-status-re-submitted-surface text-status-re-submitted',
  TaskAssigned: 'bg-status-in-review-surface text-status-in-review',
  TaskReassigned: 'bg-status-in-review-surface text-status-in-review',
  TaskHandedOver: 'bg-status-handover-surface text-status-handover',
  TaskCancelled: 'bg-status-cancelled-surface text-status-cancelled',
};

function NotificationRow({
  notification,
  onOpen,
}: {
  notification: Notification;
  onOpen: (id: string) => void;
}) {
  return (
    <Link
      to={notification.href}
      onClick={() => onOpen(notification.id)}
      className={cn(
        'block rounded-lg px-3 py-2.5 transition-colors hover:bg-canvas',
        !notification.isRead && 'bg-brand-blue-50/60',
      )}
    >
      <div className="flex items-start gap-2">
        {/* Unread marker. The colour is reinforced by the bold title below, so
            it is not the only signal — decorative to assistive tech. */}
        <span
          className={cn(
            'mt-1.5 size-1.5 shrink-0 rounded-full',
            notification.isRead ? 'bg-transparent' : 'bg-brand-blue-600',
          )}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span
              className={cn(
                'rounded-badge px-1.5 py-0.5 text-[0.6rem] font-semibold',
                KIND_CLASSES[notification.kind],
              )}
            >
              {content.kind[notification.kind]}
            </span>
            <span className="text-[0.65rem] text-ink-400">
              {formatRelative(notification.createdAt)}
            </span>
          </span>
          <span
            className={cn(
              'mt-1 block truncate text-xs text-ink-900',
              notification.isRead ? 'font-medium' : 'font-semibold',
            )}
          >
            {notification.title}
          </span>
          <span className="mt-0.5 block text-[0.7rem] text-ink-500">{notification.body}</span>
        </span>
      </div>
    </Link>
  );
}

/**
 * Header notification bell and panel.
 *
 * Surfaces the same four workflow events the spec sends email for (approval,
 * changes requested, resubmission, handover), so a user who missed the email
 * still finds the task.
 */
export function NotificationBell() {
  const notifications = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const items = notifications.data ?? [];
  const unread = items.filter((n) => !n.isRead).length;

  return (
    <Popover.Root>
      <Popover.Trigger
        className="relative grid size-10 place-items-center rounded-full transition-colors hover:bg-canvas"
        aria-label={
          unread > 0
            ? interpolate(content.trigger.labelWithCount, { count: unread })
            : content.trigger.label
        }
      >
        <Bell className="size-5 text-ink-700" aria-hidden="true" />
        {unread > 0 ? (
          <span
            className="absolute top-0.5 right-0.5 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[0.6rem] font-bold text-white"
            aria-hidden="true"
          >
            {formatBadgeCount(unread)}
          </span>
        ) : null}
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-50 w-88 rounded-card border border-line bg-surface p-2 shadow-popover"
        >
          <div className="flex items-center justify-between px-2 py-1.5">
            <p className="text-sm font-semibold text-ink-900">{content.panel.title}</p>
            {unread > 0 ? (
              <button
                type="button"
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending}
                className="text-xs font-semibold text-brand-blue-600 hover:text-brand-blue-500 disabled:opacity-50"
              >
                {content.panel.markAllRead}
              </button>
            ) : null}
          </div>

          <div className="mt-1 max-h-96 space-y-0.5 overflow-y-auto">
            {notifications.isPending ? <LoadingState className="py-8" /> : null}

            {notifications.isError ? (
              <ErrorState className="py-8" onRetry={() => void notifications.refetch()} />
            ) : null}

            {notifications.isSuccess && items.length === 0 ? (
              <EmptyState
                className="py-8"
                icon={<BellOff className="size-5" />}
                title={content.panel.empty}
                hint={content.panel.emptyHint}
              />
            ) : null}

            {items.map((notification) => (
              <NotificationRow
                key={notification.id}
                notification={notification}
                onOpen={(id) => {
                  if (!notification.isRead) markRead.mutate(id);
                }}
              />
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
