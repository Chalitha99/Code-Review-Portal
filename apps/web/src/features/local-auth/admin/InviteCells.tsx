import { cn } from '@/components/ui';
import type { User } from '@sdp/contracts';
import { invite as copy } from '../content.ts';
import { describeInvite, userStatus, type UserStatus } from './inviteDisplay.ts';

const PILL_BASE =
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap';

const STATUS_TONE: Record<UserStatus, string> = {
  INVITED: 'border-info/30 bg-info-surface text-info',
  ACTIVE: 'bg-status-approved-surface text-status-approved',
  DEACTIVATED: 'bg-priority-low-surface text-priority-low',
};

/**
 * Invited / Active / Deactivated. An invited user's pill carries the invite
 * detail ("Expires in 23 h", "Expired", "Email failed") as a hover tooltip,
 * since the table has no separate Invite column.
 */
export function StatusPill({ user }: { user: User }) {
  const status = userStatus(user);
  const detail = status === 'INVITED' ? describeInvite(user)?.text : undefined;
  return (
    <span className={cn(PILL_BASE, STATUS_TONE[status])} title={detail}>
      {copy.status[status]}
    </span>
  );
}
