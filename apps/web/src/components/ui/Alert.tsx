import type { ReactNode } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { cn } from './lib/cn.ts';

/**
 * Inline message block from Components sheet "10 · Detail, Feedback & Rows" —
 * the "Approve is blocked at Rank 2" notice, the "Before you can continue"
 * panel, the resubmission banner.
 *
 * Distinct from a toast: a toast is transient and reports what just happened;
 * an alert is persistent and explains the state the user is looking at.
 */

const TONES = {
  info: {
    box: 'border-info/30 bg-info-surface',
    icon: 'text-info',
    Icon: Info,
  },
  success: {
    box: 'border-success/30 bg-success-surface',
    icon: 'text-success',
    Icon: CheckCircle2,
  },
  warning: {
    box: 'border-warning/30 bg-warning-surface',
    icon: 'text-warning',
    Icon: AlertTriangle,
  },
  danger: {
    box: 'border-danger/30 bg-danger-surface',
    icon: 'text-danger',
    Icon: AlertCircle,
  },
} as const;

export function Alert({
  tone = 'info',
  title,
  children,
  action,
  className,
}: {
  tone?: keyof typeof TONES | undefined;
  title?: string | undefined;
  children?: ReactNode | undefined;
  action?: ReactNode | undefined;
  className?: string | undefined;
}) {
  const { box, icon, Icon } = TONES[tone];

  return (
    <div
      // Only the two blocking tones interrupt a screen reader. An informational
      // panel that announces itself over whatever the user was reading is worse
      // than one they find in reading order.
      role={tone === 'danger' || tone === 'warning' ? 'alert' : undefined}
      className={cn('flex items-start gap-3 rounded-card border p-4', box, className)}
    >
      <Icon className={cn('mt-0.5 size-4 shrink-0', icon)} aria-hidden="true" />
      <div className="min-w-0 flex-1 text-sm">
        {title ? <p className="font-semibold text-ink-900">{title}</p> : null}
        {children ? <div className={cn('text-ink-700', title && 'mt-1')}>{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
