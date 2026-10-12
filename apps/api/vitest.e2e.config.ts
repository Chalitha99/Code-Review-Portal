import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Separate from a `unit` project (there isn't one yet - Phase 7 is a health
 * check, not business logic) because e2e specs boot the whole Nest app and
 * belong in `test/e2e/`, not mixed in with `src/`.
 */
export default defineConfig({
  test: {
    name: 'e2e',
    environment: 'node',
    globals: false,
    include: ['test/e2e/**/*.e2e-spec.ts'],
    root: dirname,
  },
});
