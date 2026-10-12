import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { EmptyState } from '@/components/common/states.tsx';
import { ROUTES, type WorkspaceKey } from '@/config/routes.ts';
import { canAccessWorkspace } from '@/lib/permissions.ts';
import common from '@/content/common.json';
import { useSessionUser } from './session.ts';

/**
 * Route guard for a workspace.
 *
 * This stops a user landing on a workspace by typing its URL, but it is a
 * usability control, not a security boundary — the browser can always be lied
 * to. The real enforcement is server-side: NestJS's role guard and each
 * service's policy checks (apps/api).
 */
export function RequireWorkspace({
  workspace,
  children,
}: {
  workspace: WorkspaceKey;
  children: ReactNode;
}) {
  const user = useSessionUser();

  if (canAccessWorkspace(user.roles, workspace)) {
    return <>{children}</>;
  }

  // A user with SOME workspace took a wrong turn — send them home rather than
  // stranding them on an error page.
  if (user.roles.length > 0) {
    return <Navigate to={ROUTES.home} replace />;
  }

  return <EmptyState icon={<ShieldAlert className="size-6" />} title={common.errors.forbidden} />;
}
