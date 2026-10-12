# ADR 0017 — Email through Brevo, with the notifications table as the outbox

- **Status:** Accepted
- **Date:** 2026-10-10

## Context

Invites and password resets were "sent" only by a development stub, so outside
development every invite was recorded FAILED. The specification also asks for
email on review events: pick, changes requested, approval, resubmission,
handover and reassignment. In-app notifications already existed. Some are
created in TypeScript, and others by the Postgres trigger
`create_task_status_notification`.

The constraints:

- The development database is a shared Neon instance with real data and no
  Prisma migration history.
- Teammates may run older builds against it.
- Production will move to another Postgres.

## Decision

1. **Brevo over its HTTPS API, with no SDK.** `BrevoMailer` implements the
   existing `Mailer` port. `MailModule` binds it when `EMAIL_ENABLED=true`, and
   the dev outbox otherwise. Templates are TypeScript (`MailTemplates`), so
   esbuild bundles them and no asset-copy step exists.
2. **Password links send at once and record SENT or FAILED on the link.** The
   admin sees the result and can resend.
3. **Task-event email uses the `notifications` row as the outbox.**
   - New nullable columns (`email_status`, attempts, next attempt, last error,
     `payload`) are written in the same transaction as the task change.
   - `EmailDispatcher` claims rows with `FOR UPDATE SKIP LOCKED`, sends them,
     and retries with back-off.
4. **The trigger stays.** Rows it inserts are tagged for email in the same
   transaction (`created_at = now()`). No new values are added to
   `notification_type`, and the exact event lives in `payload.event`.
5. **Neon gets additive, idempotent SQL patches, through a guarded script.**
   Fresh databases get the equivalent Prisma migration.

## Alternatives considered

- **A separate `outbox_events` table.** It is cleaner in isolation, but it
  duplicates the recipient and type data the notification row already holds,
  and adds a second write path for each event.
- **Sending synchronously after commit.** There is no retry, and a send lost to
  a crash or a provider outage is never retried.
- **Moving the trigger's logic to TypeScript and dropping it.** That is the
  better end state. Dropping the trigger on a shared database would silently
  stop approval notifications for older builds, so it is deferred.
- **The `@getbrevo/brevo` SDK or SMTP through nodemailer.** One POST does not
  justify the dependency, and HTTPS avoids SMTP port and firewall issues.

## Costs

- Email for trigger-created rows depends on matching `created_at = now()`. A
  future change that inserts those rows outside the status-changing
  transaction would silently lose their email. The unit tests and the e2e test
  cover the current paths.
- The dispatcher polls (30 s by default). Changes also nudge it, so sending is
  near-immediate, but an idle API still wakes Neon once per interval.
- `payload` is a free-form JSON column, validated with Zod at send time. A
  schema change needs care so it can still read older rows. Unreadable rows
  are `SKIPPED`, not retried.
- Rate limits stay in memory, so this is correct for a single API instance.
