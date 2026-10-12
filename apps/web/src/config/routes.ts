import type { Role } from '@sdp/contracts';
import { routePaths } from '@/constants/routePaths';

/**
 * Compatibility facade for the migrated portal features.
 * All addresses originate in constants/routePaths.
 */
export const ROUTES = {
  home: routePaths.crp.home,
  login: routePaths.login,
  developer: {
    root: routePaths.crp.developer.dashboard,
    analytics: routePaths.crp.developer.analytics,
    newTask: routePaths.crp.developer.newTask,
    newTaskStep: routePaths.crp.developer.newTaskStep,
    task: routePaths.crp.developer.task,
    editTask: routePaths.crp.developer.editTask,
    editTaskStep: routePaths.crp.developer.editTaskStep,
  },
  reviewer: {
    root: routePaths.crp.reviewer.dashboard,
    myTasks: routePaths.crp.reviewer.myTasks,
    history: routePaths.crp.reviewer.history,
    analytics: routePaths.crp.reviewer.analytics,
    task: routePaths.crp.reviewer.task,
  },
  admin: {
    root: routePaths.crp.admin.dashboard,
    task: routePaths.crp.admin.task,
    users: routePaths.crp.admin.users,
    customers: routePaths.crp.admin.customers,
    checklist: routePaths.crp.admin.checklist,
    handovers: routePaths.crp.admin.handovers,
    handover: routePaths.crp.admin.handover,
    handoverTask: routePaths.crp.admin.handoverTask,
    reports: routePaths.crp.admin.reports,
    activity: routePaths.crp.admin.activity,
  },
} as const;

/**
 * Which roles may enter each workspace. Admin-only users do not implicitly gain
 * the Developer or Reviewer workspaces; each requires its own role.
 */
export const WORKSPACE_ACCESS = {
  developer: ['Developer'],
  reviewer: ['Reviewer'],
  admin: ['Admin', 'SuperAdmin'],
} as const satisfies Record<string, readonly Role[]>;

export type WorkspaceKey = keyof typeof WORKSPACE_ACCESS;
export const WORKSPACE_ORDER = ['developer', 'reviewer', 'admin'] as const;
export const WORKSPACE_ROOT: Record<WorkspaceKey, string> = {
  developer: ROUTES.developer.root,
  reviewer: ROUTES.reviewer.root,
  admin: ROUTES.admin.root,
};
