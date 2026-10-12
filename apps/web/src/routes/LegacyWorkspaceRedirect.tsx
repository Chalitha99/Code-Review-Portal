import { Navigate, useLocation } from 'react-router-dom';

/** Redirects pre-migration workspace links to their canonical /crp address. */
export function LegacyWorkspaceRedirect() {
  const location = useLocation();
  return <Navigate replace to={`/crp${location.pathname}${location.search}${location.hash}`} />;
}
