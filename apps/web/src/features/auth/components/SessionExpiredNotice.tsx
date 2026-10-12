import auth from '@/content/auth.json';
import { Hourglass } from '@/components/common/Hourglass.tsx';

/**
 * Shown above the login form when the previous session timed out.
 *
 * The lighter half of a pair. `SessionExpiredScreen` explains the timeout the
 * moment it happens, inside the app, where the user is about to lose their place;
 * this is the reminder they meet on the form afterwards, so it is a notice rather
 * than a second full page. The deep-link resume is intact either way —
 * `RequireAuth` has already stored where they were going.
 *
 * The tone matters. Being timed out is not an error the user caused, so this is
 * amber and explanatory rather than red and alarming, and it says what the rule
 * is ("2 hours without activity") instead of "an error occurred".
 */
export function SessionExpiredNotice() {
  return (
    <div
      className="mb-6 flex items-start gap-4 rounded-card border border-warning/30 bg-warning-surface p-4"
      role="status"
    >
      <Hourglass />

      <div className="min-w-0">
        <p className="text-xs font-semibold tracking-wide text-warning uppercase">
          {auth.expired.badge}
        </p>
        <p className="mt-0.5 text-sm font-bold text-ink-900">{auth.expired.title}</p>
        <p className="mt-1 text-sm text-ink-700">{auth.expired.description}</p>
      </div>
    </div>
  );
}
