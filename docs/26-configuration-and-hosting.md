# 26 · Configuration and hosting

Every setting the app reads, where it lives, and what to change when you deploy.

## Where settings live

| App        | Source                                                         | Notes                                                                                                                                   |
| ---------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api` | `apps/api/.env` (gitignored) or real process environment vars | Loaded by `@nestjs/config` from the working directory. Process env wins over the file. Validated at boot by `src/config/env.validation.ts`. |
| `apps/web` | none at runtime                                                | The browser always calls relative `/api` URLs. User-facing copy (including the email placeholder) is in `apps/web/src/content/`.        |
| `apps/web` dev server | shell env vars `SDP_WEB_PORT`, `SDP_API_TARGET`     | Read by `apps/web/vite.config.ts` from `process.env`. Vite does not load these from a `.env` file.                                      |
| e2e        | shell env vars `E2E_WEB_PORT`, `E2E_API_PORT`, `E2E_DATABASE_URL` | Defaults in `apps/web-e2e/ports.config.mjs` (5185 / 3100).                                                                           |

Code-side rules (API): every default is in `apps/api/src/config/defaults.ts`; `apps/api/src/config/configuration.ts` is the only reader of `process.env`; everything else uses `ConfigService`.

## Creating `apps/api/.env` on a fresh checkout

Minimum for local development:

```dotenv
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require
JWT_ACCESS_SECRET=<32+ random characters>
JWT_REFRESH_SECRET=<a different 32+ random characters>
EMAIL_ENABLED=false
APP_BASE_URL=http://localhost:5175
```

## API variables

| Variable                                   | Default                                | Production                         | Purpose                                                                                   |
| ------------------------------------------ | -------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------- |
| `NODE_ENV`                                 | `development`                          | `production`                       | Turns on the production checks below                                                      |
| `PORT`                                     | `3000`                                 | host's port                        | API listen port                                                                           |
| `DATABASE_URL`                             | —                                      | required, `sslmode=require`        | PostgreSQL connection                                                                     |
| `DIRECT_URL`                               | derived                                | optional                           | Neon non-pooler URL, only for `npm run db:neon-patch`                                     |
| `DB_TRANSACTION_TIMEOUT_MS`               | `15000`                                | optional (1000–60000)              | Interactive transaction limit; raise if a remote DB logs P2028 "Transaction already closed" |
| `DB_TRANSACTION_MAX_WAIT_MS`              | `5000`                                 | optional (500–30000)               | How long a transaction waits for a pooled connection                                      |
| `FRONTEND_ORIGIN`                          | origin of `APP_BASE_URL`               | optional, `https://` only          | CORS allow-list, comma-separated; set only for extra or different origins                 |
| `APP_BASE_URL`                             | `http://localhost:5175`                | required, `https://` public web URL | Public web URL: base of every emailed link, and the CORS / `Origin` allow-list unless `FRONTEND_ORIGIN` is set |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | —                                      | required, different, 32+ chars     | Cookie token signing                                                                      |
| `JWT_ISSUER` / `JWT_AUDIENCE`              | `sebsa-code-review-api` / `sebsa-code-review-web`| optional                           | Token claims                                                                              |
| `JWT_ACCESS_TTL_SECONDS` / `JWT_REFRESH_TTL_SECONDS` / `JWT_REMEMBER_TTL_SECONDS` | 900 / 7 days / 30 days | optional            | Token lifetimes                                                                           |
| `COOKIE_SECURE`                            | Secure in production only              | leave unset (`false` is refused)   | `Secure` flag on cookies                                                                  |
| `TRUST_PROXY`                              | off                                    | `1` behind NGINX                   | Express `trust proxy`; use the hop count, not an address list, and never `true` ([why](./27-production-hosting-runbook.md#phase-9-trust-proxy-and-client-ip)) |
| `SWAGGER_ENABLED`                          | on only in development                 | usually unset                      | API docs at `/api/docs`                                                                   |
| `EMAIL_ENABLED`                            | `false`                                | must be `true`                     | `true` sends via Brevo; otherwise logs only                                               |
| `SDP_BREVO_API_KEY`                        | —                                      | required when email enabled        | Brevo API key                                                                             |
| `SDP_EMAIL_FROM_ADDRESS`                   | —                                      | required when email enabled        | Brevo-verified sender                                                                     |
| `SDP_EMAIL_FROM_NAME`                      | `APP_NAME`                             | optional                           | Sender name                                                                               |
| `SDP_SUPPORT_EMAIL`                        | from address                           | optional                           | Reply-to and footer contact                                                               |
| `BREVO_API_URL`                            | `https://api.brevo.com/v3`             | optional                           | Brevo API base                                                                            |
| `APP_NAME`                                 | `Service Delivery Portal`              | optional                           | Product name in emails                                                                    |
| `APP_TIMEZONE`                             | `Asia/Colombo`                         | optional                           | IANA zone for email times                                                                 |
| `INVITE_TTL_HOURS` / `RESET_TTL_MINUTES`   | 24 / 60                                | optional                           | Password link lifetimes                                                                   |
| `PASSWORD_LINK_RESEND_COOLDOWN_SECONDS`    | 60                                     | optional                           | Wait between resends                                                                      |
| `EMAIL_DISPATCH_INTERVAL_MS`               | 30000                                  | optional                           | Email outbox poll interval                                                                |
| `BOOTSTRAP_ADMIN_EMAIL` / `_PASSWORD` / `_NAME` | —                                 | seed only                          | First admin for `npm run prisma:seed -w @sdp/api`                                         |
| `E2E_MAIL_OUTBOX`                          | —                                      | refused                            | Test runs only                                                                            |

Brevo account setup is in [Email and notifications](./email-notifications.md).

## Ports

Nothing outside the files below hardcodes a port.

| Port               | Default | Change with                         | Must also change                                                                  |
| ------------------ | ------- | ----------------------------------- | --------------------------------------------------------------------------------- |
| API                | 3000    | `PORT` in `apps/api/.env`           | `SDP_API_TARGET` for the dev server, or the reverse-proxy upstream when hosted    |
| Web dev server     | 5175    | `SDP_WEB_PORT` shell var            | `APP_BASE_URL` in `apps/api/.env`                           |
| e2e API / web      | 3100 / 5185 | `E2E_API_PORT` / `E2E_WEB_PORT` | nothing; the e2e scripts pass them through                                        |

The dev server uses `strictPort: true`: if the port is busy it stops instead of moving to the next free port, because a silent move would break CORS, emailed links and the e2e suite. Pick a free port explicitly, for example:

```bash
SDP_WEB_PORT=5176 SDP_API_TARGET=http://localhost:3001 npm run dev
# and in apps/api/.env: PORT=3001, APP_BASE_URL=http://localhost:5176
```

## Hosting checklist

1. Build: `npm run build` → `dist/apps/web` (static files) and `dist/apps/api/main.js`.
2. Run the API with `node dist/apps/api/main.js`, with variables set in the host's environment (preferred) or an `.env` in the working directory.
3. Set in the API environment:
   - `NODE_ENV=production`, `PORT=<internal port>`
   - `DATABASE_URL` with `sslmode=require`
   - `APP_BASE_URL=https://<public web host>` (email links and the allowed origin; add `FRONTEND_ORIGIN` only for extra origins)
   - `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (new values, not the dev ones)
   - `TRUST_PROXY=1` behind NGINX (a hop count; not an address list)
   - `EMAIL_ENABLED=true`, `SDP_BREVO_API_KEY`, `SDP_EMAIL_FROM_ADDRESS`, optionally `SDP_SUPPORT_EMAIL`
   - leave `COOKIE_SECURE` and `SWAGGER_ENABLED` unset
4. Serve the web build and the API from the same origin through NGINX: static files for everything, `/api/*` forwarded to the API unchanged. Follow the [Production hosting runbook](./27-production-hosting-runbook.md), which has the full hardened NGINX config and the deployment and test steps. The config covers TLS, security headers and CSP for the SPA, edge rate limits, per-route body limits, `.map` blocking, and an `X-Forwarded-For` that clients cannot spoof. The `/api` prefix is fixed in `apps/api/src/app.setup.ts` (`setGlobalPrefix`) and `apps/web/src/lib/apiClient.ts` (`API_BASE`); change both together if it ever moves.

5. Check the API boot log: one line naming the email transport (`brevo`), sender, link base URL and link lifetimes. A Brevo key problem is logged as a warning.

The web build itself needs no per-environment values, so the same `dist/apps/web` works on any host.
