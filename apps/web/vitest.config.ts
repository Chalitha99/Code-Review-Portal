import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

const dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * `mergeConfig` is required: the presence of this file stops Vitest reading
 * `vite.config.ts`, so the React/Tailwind plugins and the `@/` + `@sdp/*`
 * aliases have to be inherited explicitly.
 */
export default mergeConfig(
  viteConfig,
  defineConfig({
    resolve: {
      // Test-only helpers (apiStub, fixtures, render helpers) live outside src/.
      alias: { '@tests': path.resolve(dirname, 'tests') },
    },
    test: {
      projects: [
        {
          extends: true,
          test: {
            name: 'unit',
            environment: 'jsdom',
            /*
             * Must comfortably exceed Testing Library's `asyncUtilTimeout`
             * (10s, set in `src/test/setup.ts`). If they are close, a query
             * that genuinely uses its budget trips the TEST timeout first and
             * reports "Test timed out" instead of naming the element it could
             * not find — turning an actionable failure into a guessing game.
             *
             * "Comfortably" means a MULTIPLE, not a margin, which is what 20s
             * got wrong: a single test routinely awaits several queries in
             * sequence — open a dialog, wait for the grid, assert the toast —
             * and under `--coverage` the v8 instrumentation stretches each one.
             * Three successful 6s waits are already an 18s test.
             */
            testTimeout: 40_000,
            /*
             * Capped rather than left to `cpus - 1`.
             *
             * These are not cheap unit tests: the router-level suites mount the
             * whole app. Saturating every core makes the workers contend for
             * CPU, which surfaces as `findBy*` queries exceeding their budget —
             * so the suite fails on machine load rather than on the app, and
             * fails in a DIFFERENT file each run.
             *
             * Measured, not guessed: at the default this suite failed on
             * `developerAnalytics` on one run and `adminWorkspace` on the next,
             * both passing in isolation. Three is the value the source project
             * arrived at the same way.
             */
            maxWorkers: 3,
            globals: false,
            css: true,
            setupFiles: ['./tests/support/setup.ts'],
            /*
             * Tests live in tests/, apart from the code they test:
             *   tests/unit       pure rules and helpers (no DOM, no network)
             *   tests/component  screens and components, with canned API answers
             * Browser journeys against the real NestJS API are in apps/web-e2e.
             */
            include: [
              'tests/unit/**/*.{test,spec}.{ts,tsx}',
              'tests/component/**/*.{test,spec}.{ts,tsx}',
              '../../packages/*/src/**/*.{test,spec}.{ts,tsx}',
            ],
            exclude: ['**/node_modules/**', 'e2e/**'],
          },
        },
        /*
         * Every story rendered in a real browser, with its play function and an
         * axe check (`a11y.test` in .storybook/preview.ts).
         * `npm run test:storybook`.
         */
        {
          extends: true,
          plugins: [storybookTest({ configDir: path.join(dirname, '.storybook') })],
          test: {
            name: 'storybook',
            browser: {
              enabled: true,
              headless: true,
              provider: playwright(),
              instances: [{ browser: 'chromium' }],
            },
          },
        },
      ],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html', 'lcov'],
        include: ['src/**/*.{ts,tsx}', '../../packages/*/src/**/*.ts'],
        exclude: ['**/*.stories.tsx', '**/*.d.ts', 'tests/**', '**/index.ts'],
        thresholds: {
          /*
           * `npm test` runs with `--coverage` precisely so these thresholds are
           * part of the gate. Without that flag the whole block is inert, which
           * is what it was. Use `npm run test:fast` for a quick local loop.
           *
           * `perFile` so one thoroughly tested rule module cannot carry an
           * untested sibling; the point of the gate is that EVERY rule is
           * covered, not that the average looks acceptable.
           */
          perFile: true,

          // Business rules must be provably covered. UI is covered by stories
          // and e2e, so a global threshold here would only invite noise.
          '**/domain/**': {
            statements: 90,
            branches: 85,
            functions: 90,
            lines: 90,
          },

          /*
           * Rules that outgrew a single feature and moved to `lib/` — the task
           * status machine, permissions, reading a stored checklist. They are
           * still domain logic and still portable to a Phase 2 NestJS guard, so
           * they keep the same bar. Listed explicitly rather than globbing all
           * of `lib/`, because `apiClient` and `queryClient` are infrastructure
           * and are covered through the screens that use them.
           */
          '**/src/lib/{statusMachine,taskPolicy,permissions,storedChecklist,kpiBuckets,checklistOrdering,checklistVisibility,reviewCycles,reviewStats}.ts':
            {
              statements: 90,
              branches: 85,
              functions: 90,
              lines: 90,
            },
        },
      },
    },
  }),
);
