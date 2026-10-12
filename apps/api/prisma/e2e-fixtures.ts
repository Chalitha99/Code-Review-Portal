/**
 * The accounts `seed-e2e.ts` creates, shared with the API and Playwright e2e
 * suites. Every account uses `E2E_PASSWORD`; none of this exists outside the
 * disposable e2e database.
 */
export const E2E_PASSWORD = 'E2e-Passw0rd!2026';

export const E2E_USERS = {
  superAdmin: { email: 'e2e.super@example.com', name: 'E2E Super Admin', roles: ['SUPER_ADMIN'] },
  admin: { email: 'e2e.admin@example.com', name: 'E2E Admin', roles: ['ADMIN'] },
  adminReviewer: {
    email: 'e2e.admin.reviewer@example.com',
    name: 'E2E Admin Reviewer',
    roles: ['ADMIN', 'REVIEWER'],
  },
  developer: { email: 'e2e.dev@example.com', name: 'E2E Developer', roles: ['DEVELOPER'] },
  reviewer: { email: 'e2e.reviewer@example.com', name: 'E2E Reviewer', roles: ['REVIEWER'] },
  reviewer2: {
    email: 'e2e.reviewer2@example.com',
    name: 'E2E Second Reviewer',
    roles: ['REVIEWER'],
  },
  devReviewer: {
    email: 'e2e.devrev@example.com',
    name: 'E2E Dev Reviewer',
    roles: ['DEVELOPER', 'REVIEWER'],
  },
} as const;
