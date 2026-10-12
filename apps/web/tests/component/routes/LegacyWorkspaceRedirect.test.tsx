import { render, waitFor } from '@testing-library/react';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { LegacyWorkspaceRedirect } from '@/routes/LegacyWorkspaceRedirect';

const legacyPaths = [
  '/developer',
  '/developer/analytics',
  '/developer/tasks/new/details',
  '/developer/tasks/task-42',
  '/developer/tasks/task-42/edit/checklist',
  '/reviewer',
  '/reviewer/my-tasks',
  '/reviewer/history',
  '/reviewer/analytics',
  '/reviewer/tasks/task-42',
  '/admin',
  '/admin/users',
  '/admin/customers',
  '/admin/checklist',
  '/admin/handovers',
  '/admin/reports',
] as const;

describe('legacy workspace redirects', () => {
  it.each(legacyPaths)('preserves the complete deep link for %s', async (path) => {
    const router = createMemoryRouter(
      [
        { path: 'developer/*', element: <LegacyWorkspaceRedirect /> },
        { path: 'reviewer/*', element: <LegacyWorkspaceRedirect /> },
        { path: 'admin/*', element: <LegacyWorkspaceRedirect /> },
        { path: 'crp/*', element: <Outlet /> },
      ],
      { initialEntries: [`${path}?view=compact#focus-target`] },
    );

    render(<RouterProvider router={router} />);

    await waitFor(() => expect(router.state.location.pathname).toBe(`/crp${path}`));
    expect(router.state.location.search).toBe('?view=compact');
    expect(router.state.location.hash).toBe('#focus-target');
  });
});
