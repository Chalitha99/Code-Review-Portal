import { beforeEach, describe, expect, it } from 'vitest';
import { waitFor } from '@testing-library/react';
import { ROUTES } from '@/config/routes.ts';
import { renderApp, USERS } from '@tests/support/renderApp.tsx';
import { serveReferenceData, serveTaskLists, serveTaskSummary } from '@tests/support/serve.ts';
import { apiStub } from '@tests/support/apiStub.ts';

// Route access is decided in the client router from the user's roles; the
// workspaces it lands on only need something to render.
beforeEach(() => {
  serveReferenceData();
  serveTaskLists({});
  serveTaskSummary(0);
  apiStub.get('/handovers', () => []);
  apiStub.get('/reviews', () => []);
});

/**
 * Each workspace needs its own role (source `WORKSPACE_ACCESS`): Developer,
 * Reviewer, and Admin-or-SuperAdmin. A user who has some workspace but not this
 * one is sent to the portal home; deep links into a forbidden workspace are covered too.
 */
const CASES: [user: string, path: string, allowed: boolean][] = [
  [USERS.developerOnly, '/crp/developer', true],
  [USERS.developerOnly, '/crp/reviewer', false],
  [USERS.developerOnly, '/crp/admin', false],
  [USERS.developerOnly, '/crp/admin/tasks/t-blom-010', false],
  [USERS.superReviewer, '/crp/reviewer', true],
  [USERS.superReviewer, '/crp/admin/users', true],
  [USERS.superReviewer, '/crp/developer', false],
  [USERS.superReviewer, '/crp/developer/tasks/new', false],
  [USERS.adminOnly, '/crp/admin/checklist', true],
];

describe('workspace route access', () => {
  it.each(CASES)('%s at %s → allowed=%s', async (user, path, allowed) => {
    const { router } = renderApp(path, user);
    if (allowed) {
      await waitFor(() => expect(router.state.location.pathname).toBe(path));
    } else {
      await waitFor(() => expect(router.state.location.pathname).toBe(ROUTES.home));
    }
  });
});
