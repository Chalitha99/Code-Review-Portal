-- Same change as migrations/20261010000000_notification_email_delivery, for the
-- shared Neon database (which has no Prisma migration history). Additive and
-- idempotent: nullable columns with no default, so no existing row is rewritten.
-- Apply only with: npm run db:neon-patch -w @sdp/api -- prisma/neon-patches/<this file>

BEGIN;

DO $$
BEGIN
  CREATE TYPE "notification_email_status" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "email_status" "notification_email_status";
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "email_attempts" INTEGER;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "email_next_attempt_at" TIMESTAMPTZ(6);
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "email_last_error" VARCHAR(500);
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "payload" JSONB;

CREATE INDEX IF NOT EXISTS "notifications_email_status_email_next_attempt_at_idx"
  ON "notifications" ("email_status", "email_next_attempt_at");

COMMIT;
