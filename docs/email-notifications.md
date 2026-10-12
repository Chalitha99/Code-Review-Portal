# Email and notifications

How the API sends email: account invites, password resets, security notices and
task-event emails. The in-app bell uses the same notification rows. For the
password-link security rules, see [Security → Password links](./18-security.md#password-links-temporary-local-auth).
For the decision record, see [ADR 0017](./adr/0017-email-delivery.md).

## Contents

- [How it works](#how-it-works)
- [Which events send email](#which-events-send-email)
- [Setup](#setup)
- [Database changes on Neon](#database-changes-on-neon)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [Future improvements](#future-improvements)

## How it works

```
feature service ──(same DB transaction)──▶ notifications row  (email_status = PENDING, payload)
                                              │
                    EmailDispatcher (every EMAIL_DISPATCH_INTERVAL_MS, and ~1 s after a change)
                                              │  claims with FOR UPDATE SKIP LOCKED
                                              ▼
                                   MailTemplates → Mailer ──▶ Brevo (EMAIL_ENABLED=true)
                                                         └──▶ DevOutboxMailer (log / E2E_MAIL_OUTBOX)
```

There are two delivery paths:

- **Password links and account notices go out immediately.** This covers the
  invite, reset link, "password changed", "email changed" and "access changed"
  emails. `PasswordLinksService.deliver()` records the outcome on the link
  (`email_status` SENT or FAILED), which the Users tab shows. A failed send can
  be retried with Resend invite or Send reset link. Forgot-password sends after
  the HTTP reply (see Security).
- **Task-event emails go through the `notifications` table, which works as an
  outbox.** The row that drives the bell carries `email_status = PENDING` and a
  `payload` of event facts. It is written in the same transaction as the task
  change, so an email exists only if the change commits.
  - `EmailDispatcher` (`apps/api/src/modules/notifications/email-dispatcher.service.ts`)
    claims up to 20 rows at a time with `FOR UPDATE SKIP LOCKED` and a 5-minute
    lease, so several API instances never send the same row twice.
  - It renders each row with `buildTaskEmail` and sends it.
  - Retryable failures (429, 5xx, network, timeout) back off 1, 2, 4, 8 and
    16 minutes, then become `FAILED` after 6 attempts. A permanent error (other
    4xx) fails at once.
  - Rows are `SKIPPED` when the recipient is no longer active or the row is
    older than 24 hours, so a backlog is never sent late.

**The Postgres trigger.** Approve, request changes and resubmit already create
their bell rows in the `create_task_status_notification` trigger. The trigger
is kept, because the shared Neon database still serves older builds. Inside the
same transaction, `NotificationsService.queueEmailForTriggerRows` marks only the
rows the trigger has just inserted. It matches them on `created_at = now()`,
which is the transaction timestamp the trigger also used.

**Only an instance that can really deliver drains the queue.** That means
`EMAIL_ENABLED=true`, or a test run. A developer running with email off leaves
rows PENDING for an instance that can send them.

**Every email has:**

- an HTML part and a plain-text part
- the task code with the customer (e.g. `ACME-07 (Acme)`) and the task title
- the actor
- the event date and time in `APP_TIMEZONE` with its offset, e.g.
  `10 Oct 2026, 13:30 (GMT+5:30)`
- a link to the right screen for the recipient

All user-supplied text is HTML-escaped. Subjects are flattened to one line, and
the Brevo adapter rejects line breaks in headers.

## Which events send email

| #   | Event                                                     | Email to                                                         | Bell (in-app) to                           |
| --- | --------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------ |
| 1   | Reviewer picks a task                                     | Developer                                                        | Developer                                  |
| 2a  | Changes requested                                         | Developer (reviewer, round, number of findings)                  | Developer                                  |
| 2b  | Approved                                                  | Developer                                                        | Developer, all admins                      |
| 3   | Developer resubmits after fixes                           | Follow-up reviewer                                               | Follow-up reviewer                         |
| 3b  | Resubmitted but the follow-up reviewer is unavailable     | All admins and super admins                                      | Same                                       |
| 4   | Reviewer hands a task over (reason required)              | All admins and super admins, and the developer                   | Developer, eligible reviewers, admins      |
| 5   | Admin reassigns a handed-over task                        | New reviewer, developer                                          | New reviewer, developer, original reviewer |
| 6   | Admin assigns or reassigns a reviewer directly            | New reviewer, developer                                          | New reviewer, developer, replaced reviewer |
| 7   | Admin changes the follow-up reviewer                      | New follow-up reviewer, developer                                | Same                                       |
| 8   | Admin cancels a task (reason)                             | Developer, current reviewer                                      | Same                                       |
| 9   | Admin returns a handover to the queue                     | —                                                                | Developer, original reviewer               |
| 10  | Invite accepted or password reset                         | The user ("Your account is ready" / "Your password was changed") | —                                          |
| 11  | Admin changes an active user's email                      | The old address (notice), and the new address (invite)           | —                                          |
| 12  | Account deactivated, reactivated or removed; roles change | The user                                                         | —                                          |

These stay in-app only, to avoid noise:

- a first submission, which goes to the whole reviewer pool
- approval copies to admins
- finding responses and verdicts
- draft saves
- the "available to pick" broadcast after a handover

## Setup

### Brevo (one time)

1. **Verify the sender.** In Senders, Domains & Dedicated IPs, verify the
   address in `SDP_EMAIL_FROM_ADDRESS`. Brevo rejects an unverified sender with 400.
2. **Use a company domain for production.** Authenticate it with the Brevo
   code, DKIM, SPF (`include:spf.brevo.com`) and DMARC (start with `p=none`).
   A free-mail sender such as `@gmail.com` works for testing, but Gmail's DMARC
   policy makes such mail land in spam or be rejected at many providers.
3. **Create the API key.** In SMTP & API → API keys, create a v3 key and put it
   in `SDP_BREVO_API_KEY`. Keep it only in `.env` or a secret manager. Rotate it
   if it is ever pasted elsewhere.
4. **Turn the IP restriction off, or allow the API host's address.** Security →
   Authorised IPs. Otherwise Brevo answers 401 "unrecognised IP address".
5. **Turn off click and open tracking for transactional email.** Click tracking
   rewrites links and can drop the `#token=` fragment.

### Environment (`apps/api/.env`)

| Variable                                 | Required                       | Notes                                                               |
| ---------------------------------------- | ------------------------------ | ------------------------------------------------------------------- |
| `EMAIL_ENABLED`                          | yes in production              | `true` uses Brevo; anything else uses the dev outbox (log only)     |
| `SDP_BREVO_API_KEY`                      | when enabled                   | Never logged                                                        |
| `SDP_EMAIL_FROM_ADDRESS`                 | when enabled                   | A Brevo-verified sender                                             |
| `APP_NAME`                               | no                             | Product name in emails; default "Service Delivery Portal"           |
| `SDP_EMAIL_FROM_NAME`                    | no                             | Sender name; defaults to `APP_NAME`                                 |
| `SDP_SUPPORT_EMAIL`                      | no                             | Reply-to and footer contact; defaults to the from address           |
| `APP_BASE_URL`                           | yes in production (`https://`) | Base of every emailed link, and the allowed web origin unless `FRONTEND_ORIGIN` is set |
| `APP_TIMEZONE`                           | no                             | IANA zone for email times; default `Asia/Colombo`                   |
| `INVITE_TTL_HOURS` / `RESET_TTL_MINUTES` | no                             | 1–168 / 10–1440; defaults 24 / 60                                   |
| `PASSWORD_LINK_RESEND_COOLDOWN_SECONDS`  | no                             | Wait between resends; default 60                                    |
| `EMAIL_DISPATCH_INTERVAL_MS`             | no                             | Poll interval; default 30000 (lets Neon suspend between polls)      |
| `BREVO_API_URL`                          | no                             | Default `https://api.brevo.com/v3`                                  |
| `DIRECT_URL`                             | only for `db:neon-patch`       | Neon's non-pooler URL; derived from `DATABASE_URL` when unset       |

At boot the API validates these (`src/config/env.validation.ts`) and logs one
line, with no secrets, naming the transport, sender, link base URL and link
lifetimes. With
Brevo it also checks the key once and warns if Brevo rejects it. Tests always
use the dev outbox, whatever `.env` says.

### Where settings live (change once, used everywhere)

- **API:**
  - `src/config/defaults.ts` holds every default, and nothing else does.
  - `src/config/configuration.ts` is the only reader of `process.env`. It
    resolves each value once: env first, then the default. For example,
    `appBaseUrl` is `APP_BASE_URL`, else the first `FRONTEND_ORIGIN`.
  - All other code calls `ConfigService.getOrThrow(...)` with no fallback of
    its own.
  - `src/config/configuration.spec.ts` fails the build if any file outside
    `src/config` reads `process.env` or hard-codes an `http(s)://` URL.
- **Web:**
  - The web has no environment settings of its own; copy such as the email
    placeholder lives in `apps/web/src/content/`.
  - Values the API owns are not copied into the web. The screens read link
    lifetimes and the resend cooldown from `GET /api/auth/link-policy`, and
    the Users-tab toast uses the `expiresAt` the API returns.
- **E2E:**
  - `apps/web-e2e/ports.config.mjs` holds the test ports (`E2E_WEB_PORT`,
    `E2E_API_PORT`). The Playwright config, the helpers and the API test server
    all import it.

## Database changes on Neon

The shared Neon database holds real data and has **no Prisma migration
history**, so `prisma migrate` must never run against it. Schema changes reach
it as reviewed, additive SQL patches:

1. Add the change as a normal migration in `prisma/migrations/`. Fresh
   databases use it: the e2e cluster and a future production database.
2. Add the same SQL, made idempotent, to `prisma/neon-patches/`. Use
   `IF NOT EXISTS` and nullable columns with **no default**, so no existing row
   is rewritten.
3. Create a Neon restore point, then run the dry run and the apply:
   ```bash
   npm run db:neon-patch -w @sdp/api -- prisma/neon-patches/<file>.sql          # dry run
   npm run db:neon-patch -w @sdp/api -- prisma/neon-patches/<file>.sql --apply
   ```
   The script refuses `UPDATE`, `DELETE`, `INSERT`, `DROP`, `TRUNCATE`,
   `RENAME`, `ALTER TYPE`, `ALTER COLUMN`, `NOT NULL`, `DEFAULT` and new
   functions or triggers. It fingerprints every existing notification row and
   the user, task and notification counts before and after, and fails if
   anything changed.

`20261010_notification_email_delivery.sql` was applied to Neon on 2026-10-10.
The fingerprint and the counts (18 users, 72 tasks, 373 notifications) were
unchanged.

Do **not** add values to an existing enum that older builds read, such as
`notification_type`. An older Prisma client throws on an unknown value. New
task events reuse existing types, and the exact event is in `payload.event`.

## Testing

| Layer      | Where                                                                                                   | Covers                                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Unit       | `src/integrations/mail/*.spec.ts`, `email-dispatcher.service.spec.ts`, `password-links.service.spec.ts` | Brevo request, retry classification, header injection, escaping, time zone, back-off, skip rules, TTLs, notices        |
| Guard      | `src/common/raw-sql.guard.spec.ts`                                                                      | No unparameterised raw SQL                                                                                             |
| API e2e    | `test/e2e/email-and-links.e2e-spec.ts` (throwaway Postgres, never Neon)                                 | Invite → set password → sign in; reuse; expiry (410); forgot-password parity; task email dispatch; SQL injection input |
| Web        | `apps/web/tests/component/features/local-auth/routes/localAuthScreens.test.tsx`                         | Token kept until 200, reload, expiry timer, signed-in visitor, reset wording                                           |
| Playwright | `apps/web-e2e/tests/journeys/05-onboarding.spec.ts`                                                     | Real invite link, reload, rejected then accepted password, signed-in admin opening a reset link                        |

```bash
npm run e2e:db:up -w @sdp/api && npm run e2e:db:reset -w @sdp/api
E2E_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/sdp_e2e npm run test:e2e -w @sdp/api
npm run e2e
```

> On Windows, if `npm run test:api` fails every file with
> `Cannot read properties of undefined (reading 'config')`, the shell has
> `NX_WORKSPACE_ROOT_PATH` set with a lowercase drive letter (some editor
> terminals do this). Run `env -u NX_WORKSPACE_ROOT_PATH npm run test:api`, or
> open a new terminal.

## Troubleshooting

| Symptom                                       | Likely cause                                                                  | Fix                                                                                                |
| --------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Users tab shows "Email failed"                | Brevo rejected the send; the API log has `Brevo answered <status> (<reason>)` | 401: key or IP restriction. 400 "sender": verify `SDP_EMAIL_FROM_ADDRESS`. Then use Resend invite. |
| Link opens "This link can't be used"          | A newer link was sent (resend, email change, another forgot request), or used | Use the newest email, or request a new link                                                        |
| Link opens without a token                    | Something rewrote the link (click tracking, a mail scanner)                   | Turn off Brevo click tracking; the plain-text part carries the same link                           |
| Task emails never arrive; rows stay `PENDING` | No running API instance has `EMAIL_ENABLED=true`                              | Enable email on one instance; rows older than 24 h are skipped                                     |
| Rows go to `FAILED` with `email_last_error`   | Six retryable failures, or a permanent Brevo error                            | Read `email_last_error`; fix and resend manually if needed                                         |
| Links point at the wrong host                 | `APP_BASE_URL`                                                                | Set it to the web origin users open; e2e sets it automatically                                     |

## Future improvements

- **Moving off Neon to the production Postgres** (RDS, Cloud SQL, Azure,
  Supabase or similar):
  1. Dump Neon and restore the dump.
  2. Set `DATABASE_URL` to the pooled URL and `DIRECT_URL` to the direct one.
  3. Baseline the Prisma history with `prisma migrate resolve --applied <name>`
     for each migration already reflected in the schema.
  4. From then on use `prisma migrate deploy`, and retire `neon-patches/`.
  5. Add `directUrl = env("DIRECT_URL")` to the Prisma datasource then.

  The code uses only standard Postgres features (`SKIP LOCKED`, `jsonb`,
  `timestamptz`, `gen_random_uuid()`), so no code change is needed.

- **Data retention.** A scheduled cleanup to null old `payload`s, and delete
  `password_links` that expired more than 30 days ago. It is not added while the
  database is shared.
- **More than one API instance.** Move `RateLimiterService` to Postgres or
  Redis. The dispatcher is already multi-instance safe.
- **Per-user email preferences and time zone.** A user setting to opt out of
  non-security emails, and their own zone for email times.
- **Admin digest.** A daily email of handovers pending, or pool tasks waiting,
  longer than N hours.
- **Bounces and complaints.** A Brevo webhook to mark hard-bounced addresses,
  and to show them on the Users tab.
- **Alerting.** Alert on rows in `FAILED`, or `PENDING` for more than 30
  minutes.
- **Retire the SQL trigger.** Once every build creates approve, changes and
  resubmit notifications in TypeScript, drop `create_task_status_notification`.
- **Dependencies.** `npm audit --omit=dev` (2026-10-10) reports advisories in
  `proxy-addr` (critical, IP spoofing; matters with `TRUST_PROXY` subnets),
  `multer` and others. Upgrade in a separate change.
- **SSO.** When it arrives, invites and password links go away. The
  task-event email stays.
