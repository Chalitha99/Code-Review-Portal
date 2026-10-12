import type { PortalId, Role } from '@sdp/contracts';
import { routePaths } from './routePaths';

/**
 * The sub-applications the Service Delivery Portal hosts.
 *
 * This is metadata only — labels, addresses and who may enter. Route structure
 * lives in `src/routes/`. Keeping the two apart is what lets the home page and
 * any future global navigation describe the portals without importing the
 * router, and lets the router mount them without knowing how they are labelled.
 */

export interface PortalDescriptor {
  readonly id: PortalId;
  readonly label: string;
  readonly path: string;
  /** Lucide icon name, resolved by whatever renders it. */
  readonly icon: string;
  /** A user needs at least one of these roles to enter. */
  readonly requiredRoles: readonly Role[];
  /** Registered and routable, but not yet advertised on the home page. */
  readonly comingSoon: boolean;
}

export const PORTALS: readonly PortalDescriptor[] = [
  {
    id: 'code-review',
    label: 'Code Review Portal',
    path: routePaths.crp.root,
    icon: 'GitPullRequest',
    requiredRoles: ['Developer', 'Reviewer', 'Admin', 'SuperAdmin'],
    comingSoon: false,
  },
  {
    id: 'delivery',
    label: 'Delivery Portal',
    path: routePaths.delivery.root,
    icon: 'Truck',
    requiredRoles: ['Developer', 'Reviewer', 'Admin'],
    comingSoon: true,
  },
  {
    id: 'wiki',
    label: 'Wiki Portal',
    path: routePaths.wiki.root,
    icon: 'BookOpen',
    requiredRoles: ['Developer', 'Reviewer', 'Admin'],
    comingSoon: true,
  },
];

export function findPortal(id: PortalId): PortalDescriptor | undefined {
  return PORTALS.find((portal) => portal.id === id);
}
