import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { routes } from '@/app/routes.tsx';
import { signInForTest } from './setup.ts';
import { buildDataset } from './fixtures/dataset.ts';
import { serveNotifications } from './serve.ts';

/** Fixture accounts (`tests/support/fixtures/data/users.json`) chosen for their role sets. */
export const USERS = {
  /** Developer + Reviewer + Admin. */
  allRoles: 'u-charith',
  developerOnly: 'u-dheliya',
  /** Developer + Reviewer + Admin; assigned reviewer on t-blom-010 (In Review). */
  reviewer: 'u-pinsara',
  adminOnly: 'u-qa-admin',
  superAdmin: 'u-qa-superadmin',
  /** Admin + SuperAdmin + Reviewer, without Developer. */
  superReviewer: 'u-qa-superreviewer',
} as const;

/**
 * Mounts the real route table at `path`, signed in as `userId`.
 *
 * The app shell's own request — the notification bell — is answered from the
 * fixtures; everything the screen itself loads is up to the test (`serve.ts`).
 */
export function renderApp(path: string, userId: string = USERS.allRoles) {
  signInForTest(userId);
  serveNotifications(buildDataset());
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...utils, router, queryClient, user: userEvent.setup({ delay: null }) };
}

/** Matches `n` as a whole number inside concatenated card text ("Approved12Review…"). */
export function countText(n: number): RegExp {
  return new RegExp(String.raw`(?<!\d)` + String(n) + String.raw`(?!\d)`);
}
