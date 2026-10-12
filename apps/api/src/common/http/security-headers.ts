import helmet from 'helmet';
import type { RequestHandler } from 'express';

/**
 * Standard security response headers (helmet).
 *
 * - HSTS only in production, where the app is served over HTTPS; sending it
 *   from `http://localhost` would be ignored at best and sticky at worst.
 * - `frame-ancestors 'none'` / `X-Frame-Options: DENY`: the API and Swagger
 *   are never framed.
 * - `nosniff`, `Referrer-Policy: no-referrer`, no `X-Powered-By`.
 * Helmet's default CSP is kept; it still allows the Swagger UI's own assets.
 */
export function securityHeaders(production: boolean): RequestHandler {
  return helmet({
    contentSecurityPolicy: {
      directives: { frameAncestors: ["'none'"] },
    },
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'no-referrer' },
    hsts: production ? { maxAge: 31_536_000, includeSubDomains: true } : false,
  });
}
