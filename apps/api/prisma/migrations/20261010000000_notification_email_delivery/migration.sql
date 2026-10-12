-- CreateEnum
CREATE TYPE "notification_email_status" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "email_attempts" INTEGER,
ADD COLUMN     "email_last_error" VARCHAR(500),
ADD COLUMN     "email_next_attempt_at" TIMESTAMPTZ(6),
ADD COLUMN     "email_status" "notification_email_status",
ADD COLUMN     "payload" JSONB;

-- CreateIndex
CREATE INDEX "notifications_email_status_email_next_attempt_at_idx" ON "notifications"("email_status", "email_next_attempt_at");

