import type { ComponentType } from 'react';
import type { RouteObject } from 'react-router-dom';
import { HomeRoute } from '@/app/routeAdapters';
import { NewTaskEntry } from '@/portals/code-review/features/tasks/routes/NewTaskEntry.tsx';
import { RequireWorkspace } from '@/app/RequireWorkspace';
import { relativePaths, SEGMENTS } from '@/constants/routePaths';

const guarded = (workspace: 'developer' | 'reviewer' | 'admin', Component: ComponentType) =>
  function GuardedRoute() {
    return (
      <RequireWorkspace workspace={workspace}>
        <Component />
      </RequireWorkspace>
    );
  };

/**
 * Code Review Portal routes.
 *
 * Every page is a React Router 7 lazy route module — the module exports
 * `Component`, and the whole module (page, and later its loader) is code-split
 * as one chunk. No path literals appear here; they come from
 * `constants/routePaths`, so an address is declared in exactly one place.
 */
export const codeReviewRoutes: RouteObject[] = [
  { index: true, element: <HomeRoute /> },
  {
    path: relativePaths.crp.developer,
    handle: { title: 'Developer Dashboard' },
    lazy: async () => {
      const module = await import('@/portals/code-review/features/tasks/routes/DeveloperLayout');
      return { Component: guarded('developer', module.DeveloperLayout) };
    },
    children: [
      {
        index: true,
        lazy: async () => {
          const module = await import('@/portals/code-review/features/tasks/routes/MyTasksPage');
          return { Component: module.MyTasksPage };
        },
      },
      {
        path: SEGMENTS.analytics,
        lazy: async () => {
          const module = await import('@/portals/code-review/features/tasks/routes/AnalyticsPage');
          return { Component: module.AnalyticsPage };
        },
      },
    ],
  },
  {
    path: `${relativePaths.crp.developer}/${SEGMENTS.tasks}/${SEGMENTS.new}`,
    handle: { title: 'New Review Task' },
    element: (
      <RequireWorkspace workspace="developer">
        <NewTaskEntry />
      </RequireWorkspace>
    ),
  },
  {
    path: `${relativePaths.crp.developer}/${SEGMENTS.tasks}/${SEGMENTS.new}/${SEGMENTS.confirmed}`,
    handle: { title: 'New Review Task' },
    lazy: async () => {
      const module =
        await import('@/portals/code-review/features/tasks/routes/SubmissionConfirmedPage');
      return {
        Component: guarded('developer', module.SubmissionConfirmedPage),
      };
    },
  },
  {
    path: `${relativePaths.crp.developer}/${SEGMENTS.tasks}/${SEGMENTS.new}/:step`,
    handle: { title: 'New Review Task' },
    lazy: async () => {
      const module = await import('@/portals/code-review/features/tasks/routes/NewTaskWizard');
      return {
        Component: guarded('developer', () => <module.NewTaskWizard mode="create" />),
      };
    },
  },
  {
    path: `${relativePaths.crp.developer}/${SEGMENTS.tasks}/:taskId/${SEGMENTS.edit}`,
    handle: { title: 'Edit Review Task' },
    lazy: async () => {
      const module = await import('@/portals/code-review/features/tasks/routes/EditTaskRedirect');
      return { Component: guarded('developer', module.EditTaskRedirect) };
    },
  },
  {
    path: `${relativePaths.crp.developer}/${SEGMENTS.tasks}/:taskId/${SEGMENTS.edit}/:step`,
    handle: { title: 'Edit Review Task' },
    lazy: async () => {
      const module = await import('@/portals/code-review/features/tasks/routes/NewTaskWizard');
      return {
        Component: guarded('developer', () => <module.NewTaskWizard mode="edit" />),
      };
    },
  },
  {
    path: `${relativePaths.crp.developer}/${SEGMENTS.tasks}/:taskId`,
    handle: { title: 'Task Details' },
    lazy: async () => {
      const module = await import('@/portals/code-review/features/tasks/routes/TaskDetailPage');
      return { Component: guarded('developer', module.TaskDetailPage) };
    },
  },
  {
    path: relativePaths.crp.reviewer,
    handle: { title: 'Reviewer Dashboard' },
    lazy: async () => {
      const module = await import('@/portals/code-review/features/reviews/routes/ReviewerLayout');
      return { Component: guarded('reviewer', module.ReviewerLayout) };
    },
    children: [
      {
        index: true,
        lazy: async () => {
          const module =
            await import('@/portals/code-review/features/reviews/routes/ReviewQueuePage');
          return { Component: module.AvailableTasksPage };
        },
      },
      {
        path: SEGMENTS.myTasks,
        lazy: async () => {
          const module =
            await import('@/portals/code-review/features/reviews/routes/ReviewQueuePage');
          return { Component: module.MyReviewTasksPage };
        },
      },
      {
        path: SEGMENTS.history,
        lazy: async () => {
          const module =
            await import('@/portals/code-review/features/reviews/routes/ReviewQueuePage');
          return { Component: module.ReviewHistoryPage };
        },
      },
      {
        path: SEGMENTS.analytics,
        lazy: async () => {
          const module =
            await import('@/portals/code-review/features/reviews/routes/ReviewerAnalyticsPage');
          return { Component: module.ReviewerAnalyticsPage };
        },
      },
    ],
  },
  {
    path: `${relativePaths.crp.reviewer}/${SEGMENTS.tasks}/:taskId`,
    handle: { title: 'Review Task' },
    lazy: async () => {
      const module = await import('@/portals/code-review/features/reviews/routes/ReviewTaskPage');
      return { Component: guarded('reviewer', module.ReviewTaskPage) };
    },
  },
  {
    path: relativePaths.crp.admin,
    handle: { title: 'Admin Dashboard' },
    lazy: async () => {
      const module = await import('@/portals/code-review/features/admin/routes/AdminLayout');
      return { Component: guarded('admin', module.AdminLayout) };
    },
    children: [
      {
        index: true,
        lazy: async () => {
          const module = await import('@/portals/code-review/features/admin/routes/AdminTasksPage');
          return { Component: module.AdminTasksPage };
        },
      },
      {
        path: SEGMENTS.users,
        lazy: async () => {
          const module = await import('@/portals/code-review/features/admin/routes/AdminUsersPage');
          return { Component: module.AdminUsersPage };
        },
      },
      {
        path: SEGMENTS.customers,
        lazy: async () => {
          const module =
            await import('@/portals/code-review/features/admin/routes/AdminCustomersPage');
          return { Component: module.AdminCustomersPage };
        },
      },
      {
        path: SEGMENTS.checklist,
        lazy: async () => {
          const module =
            await import('@/portals/code-review/features/admin/routes/AdminChecklistPage');
          return { Component: module.AdminChecklistPage };
        },
      },
      {
        path: SEGMENTS.handovers,
        lazy: async () => {
          const module =
            await import('@/portals/code-review/features/admin/routes/AdminHandoversPage');
          return { Component: module.AdminHandoversPage };
        },
      },
      {
        path: SEGMENTS.reports,
        lazy: async () => {
          const module =
            await import('@/portals/code-review/features/reports/routes/AdminReportsPage');
          return { Component: module.AdminReportsPage };
        },
      },
      {
        path: SEGMENTS.activity,
        lazy: async () => {
          const module =
            await import('@/portals/code-review/features/admin/routes/AdminActivityLogPage');
          return { Component: module.AdminActivityLogPage };
        },
      },
    ],
  },
  {
    path: `${relativePaths.crp.admin}/${SEGMENTS.handovers}/:handoverId`,
    handle: { title: 'Handover Task Overview' },
    lazy: async () => {
      const module =
        await import('@/portals/code-review/features/admin/routes/AdminHandoverTaskPage');
      return { Component: guarded('admin', module.AdminHandoverTaskPage) };
    },
  },
  {
    path: `${relativePaths.crp.admin}/${SEGMENTS.tasks}/:taskId/${SEGMENTS.handover}`,
    handle: { title: 'Handover Task Overview' },
    lazy: async () => {
      const module =
        await import('@/portals/code-review/features/admin/routes/AdminHandoverTaskPage');
      return { Component: guarded('admin', module.AdminHandoverTaskPage) };
    },
  },
  {
    path: `${relativePaths.crp.admin}/${SEGMENTS.tasks}/:taskId`,
    handle: { title: 'Task Details' },
    lazy: async () => {
      const module = await import('@/portals/code-review/features/tasks/routes/TaskDetailPage');
      return {
        Component: guarded('admin', () => <module.TaskDetailPage mode="admin" />),
      };
    },
  },
];
