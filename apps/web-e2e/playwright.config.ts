import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';
import { E2E_API_URL, E2E_WEB_PORT, E2E_WEB_URL } from './ports.config.mjs';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dirname, '../..');

export const WEB_URL = E2E_WEB_URL;
export const API_URL = E2E_API_URL;

/**
 * Browser journeys against the REAL stack: React (Vite) → NestJS → PostgreSQL.
 *
 * Both servers are the suite's own, on their own ports, so neither can be
 * confused with a developer's `npm run dev` (5175 → 3000 → the shared Neon DB):
 *
 *   API  :3100  apps/api/scripts/e2e-serve.mjs — recreates the throwaway e2e
 *               database from prisma/migrations + prisma/seed-e2e.ts first
 *   Web  :5185  Vite, proxying /api to :3100
 *
 * Journeys share that one seeded database and run in file order on one worker;
 * each creates the data it changes (its own task, its own user) so they do not
 * depend on one another's outcome.
 */
export default defineConfig({
  testDir: './tests/journeys',
  outputDir: './test-results/artifacts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? 'github' : [['list']],
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'node scripts/e2e-serve.mjs',
      cwd: path.join(root, 'apps/api'),
      url: `${API_URL}/api/health`,
      // Never reuse: a server already on this port is not known to be ours.
      reuseExistingServer: false,
      timeout: 240_000,
      stdout: 'pipe',
    },
    {
      command: 'npm run dev -w @sdp/web',
      cwd: root,
      url: WEB_URL,
      env: { SDP_WEB_PORT: E2E_WEB_PORT, SDP_API_TARGET: API_URL },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
