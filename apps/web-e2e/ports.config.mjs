// @ts-check
/**
 * The one place the e2e stack's ports are set. Kept apart from a developer's
 * `npm run dev` (web 5175 → API 3000 → Neon). Override with E2E_WEB_PORT / E2E_API_PORT.
 */
export const E2E_WEB_PORT = process.env['E2E_WEB_PORT'] ?? '5185';
export const E2E_API_PORT = process.env['E2E_API_PORT'] ?? '3100';
export const E2E_WEB_URL = `http://localhost:${E2E_WEB_PORT}`;
export const E2E_API_URL = `http://localhost:${E2E_API_PORT}`;
