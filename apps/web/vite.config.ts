import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path, { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const dirname = path.dirname(fileURLToPath(import.meta.url));

/** This project's directory, used to key the out-of-tree dep cache. */
const PROJECT_ROOT = fileURLToPath(new URL('.', import.meta.url));

/**
 * Application build config. Test configuration deliberately lives in
 * `vitest.config.ts`, which merges this file — keeping the two apart means a
 * browser-mode Storybook run cannot break `npm run build`.
 *
 * The `@sdp/*` aliases point at TypeScript source rather than relying solely on
 * the npm workspace symlinks. Without them Vite's dependency optimiser tries to
 * pre-bundle the workspace packages and fails to resolve an entry, since they
 * publish `.ts` rather than built output.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(dirname, 'src'),
      '@sdp/contracts': path.resolve(dirname, '../../packages/contracts/src'),
      '@sdp/types': path.resolve(dirname, '../../packages/types/src'),
    },
  },
  server: {
    port: Number(process.env['SDP_WEB_PORT'] ?? 5175),
    proxy: {
      '/api': {
        // NestJS. The Playwright suite points this at its own e2e API
        // (SDP_API_TARGET=http://localhost:3100) so it never touches the API a
        // developer runs against the shared database.
        target: process.env['SDP_API_TARGET'] ?? 'http://localhost:3000',
        changeOrigin: true,
      },
    },
    /*
     * Fail rather than drift to 5176.
     *
     * Vite's default is to pick the next free port, which is friendly right up
     * until it is not: a second instance runs happily on another port while
     * SHARING `cacheDir` with the first, and the two race to rename the
     * optimised-deps directory. The Playwright suite runs its own server on
     * SDP_WEB_PORT=5185, so a silent move would put the suite on the wrong one.
     */
    strictPort: true,
  },

  /*
   * The dep cache lives OUTSIDE the project tree.
   *
   * Symptom: `EBUSY: resource busy or locked, rename '…/.vite/deps_temp_xxxx'
   * -> '…/.vite/deps'`, leaving orphaned `deps_temp_*` directories and — during
   * the window before Vite's retry succeeds — 504s on every dependency, which
   * surface as "This page ran into a problem" because a lazy chunk could not
   * import.
   *
   * Cause: Vite writes hundreds of files into a temp directory and then renames
   * the directory over the old one. On Windows that rename fails outright if any
   * process holds a handle to a file inside it, and on a corporate machine
   * something always does — Defender scanning newly written executables' worth
   * of JS, the editor's file watcher indexing `node_modules`, a sync client.
   *
   * `node_modules/.vite` is the default only because it is conventionally
   * ignored. Moving the cache to the OS temp directory takes it out of the
   * scanned and watched tree entirely, which is the only fix that addresses the
   * cause rather than retrying around it. Keyed by project path so a sibling
   * checkout cannot collide.
   */
  // A separate cache per port: the Playwright server (5185) and a developer's
  // own dev server (5175) must not race over one optimised-deps directory.
  cacheDir: join(
    tmpdir(),
    'sdp-vite',
    createHash('sha1')
      .update(`${PROJECT_ROOT}:${process.env['SDP_WEB_PORT'] ?? '5175'}`)
      .digest('hex'),
  ),
  build: {
    outDir: '../../dist/apps/web',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      output: {
        /**
         * Two hand-cut chunks, from measuring the real bundle.
         *
         * Recharts is already split, because only the lazy chart screens import
         * it. The table core was not: `DataTable` is reachable from the entry
         * graph, so 180 KB of grid engine loaded before the login form — which
         * no grid is behind.
         *
         * `react-vendor` is separate for caching rather than size: React and
         * the router change on upgrades, application code changes weekly, and
         * one chunk for both would re-download the framework every deploy.
         *
         * Deliberately NOT a catch-all `node_modules → vendor` rule: that
         * collapses every lazily-imported library back into one eager chunk
         * and undoes the route splitting.
         */
        manualChunks(id) {
          // Vite 8 accepts only the function form; the `{ name: [...] }` record
          // that older guides show is not in its types and fails to compile.
          // Ids arrive with the platform's separators, so normalise first.
          const modulePath = id.replaceAll('\\', '/');
          if (!modulePath.includes('/node_modules/')) return undefined;

          if (
            /\/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(
              modulePath,
            )
          ) {
            return 'react-vendor';
          }
          // Table only. NOT all of `@tanstack/` — React Query is loaded on the
          // login screen, so sweeping the scope into this chunk would drag the
          // grid engine back into the eager graph, which is the exact thing
          // this rule exists to prevent.
          if (/\/node_modules\/@tanstack\/(react-)?table(-core)?\//.test(modulePath)) {
            return 'table-vendor';
          }
          return undefined;
        },
      },
    },
  },
});
