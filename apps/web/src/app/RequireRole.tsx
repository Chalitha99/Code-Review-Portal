import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import type { Role } from '@sdp/contracts';
import { ROUTES } from '@/config/routes.ts';
import { useSessionUser } from './session.ts';

export function RequireRole({
  requiredRole,
  redirectTo = ROUTES.home,
  children,
}: {
  requiredRole: Role;
  redirectTo?: string;
  children: ReactNode;
}) {
  const user = useSessionUser();

  return user.roles.includes(requiredRole) ? <>{children}</> : <Navigate to={redirectTo} replace />;
}
