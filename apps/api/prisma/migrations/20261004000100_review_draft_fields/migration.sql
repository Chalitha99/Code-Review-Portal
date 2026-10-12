ALTER TABLE "public"."code_review_forms"
  ADD COLUMN "previous_feedback_review_note" TEXT,
  ADD COLUMN "previous_feedback_acknowledged" BOOLEAN,
  ADD COLUMN "current_review_session_id" UUID,
  ADD COLUMN "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "public"."review_findings"
  ADD COLUMN "review_session_id" UUID;

ALTER TABLE "public"."developer_finding_responses"
  ADD COLUMN "review_cycle_number" INTEGER NOT NULL DEFAULT 1;

ALTER TYPE "public"."handover_status" ADD VALUE IF NOT EXISTS 'RETURNED_TO_QUEUE';

INSERT INTO "public"."code_review_questions"
  ("id", "question_text", "display_order", "is_active")
VALUES
  ('00000000-0000-4000-8000-000000000001', 'Do database calls have &AO prefixed?', 10, true),
  ('00000000-0000-4000-8000-000000000002', 'Have presentation objects been scanned?', 20, true),
  ('00000000-0000-4000-8000-000000000003', 'Have code files been scanned for translation?', 30, true),
  ('00000000-0000-4000-8000-000000000004', 'Are new forms designed according to IFS AQS guidelines?', 40, true),
  ('00000000-0000-4000-8000-000000000005', 'Do cursors and SQL statements select against tables where suitable?', 50, true),
  ('00000000-0000-4000-8000-000000000006', 'Are variables defined as %TYPE in PL/SQL?', 60, true),
  ('00000000-0000-4000-8000-000000000007', 'Has the correct base layer (Ext or Core) been selected when extending?', 70, true),
  ('00000000-0000-4000-8000-000000000008', 'Are customized files checked into Harvest with version 0 without changes?', 80, true),
  ('00000000-0000-4000-8000-000000000009', 'Are COB/INS/UPG files written so they can be run several times?', 90, true),
  ('00000000-0000-4000-8000-000000000010', 'Is the code indentation correct, and do blank lines separate code blocks?', 100, true),
  ('00000000-0000-4000-8000-000000000011', 'Is the customization implemented in a minimally invasive way?', 110, true),
  ('00000000-0000-4000-8000-000000000012', 'Are overrides used instead of overtakes?', 120, true),
  ('00000000-0000-4000-8000-000000000013', 'Are there no warnings or errors shown in Developer Studio?', 130, true)
ON CONFLICT ("id") DO NOTHING;
