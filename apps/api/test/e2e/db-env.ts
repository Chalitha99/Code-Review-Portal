/**
 * Points the e2e suites that need a real database at `E2E_DATABASE_URL`.
 *
 * Imported FIRST by those specs, before the app module, so Prisma and the
 * config module only ever see the e2e URL (process env wins over apps/api/.env).
 * Refuses anything but a local database whose name contains "e2e": the shared
 * Neon database can never be reached from a test run.
 */
const url = process.env['E2E_DATABASE_URL'] ?? '';

export const hasE2eDatabase = url !== '';

if (hasE2eDatabase) {
  const { hostname, pathname } = new URL(url);
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname) || !pathname.includes('e2e')) {
    throw new Error(`E2E_DATABASE_URL must be a local *e2e* database, not ${hostname}${pathname}`);
  }
  process.env['DATABASE_URL'] = url;
  process.env['NODE_ENV'] = 'test';
  process.env['EMAIL_ENABLED'] = 'false';
}
