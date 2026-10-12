CREATE TYPE "public"."review_cycle_outcome" AS ENUM ('CHANGES_REQUESTED');

CREATE TABLE "public"."review_cycles" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "task_id" UUID NOT NULL,
  "round_number" INTEGER NOT NULL,
  "outcome" "public"."review_cycle_outcome" NOT NULL DEFAULT 'CHANGES_REQUESTED',
  "counted" BOOLEAN NOT NULL DEFAULT true,
  "exclusion_reason" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "excluded_at" TIMESTAMPTZ(6),
  CONSTRAINT "review_cycles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "review_cycles_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "review_cycles_task_id_round_number_key"
  ON "public"."review_cycles"("task_id", "round_number");
CREATE INDEX "review_cycles_task_id_counted_idx"
  ON "public"."review_cycles"("task_id", "counted");

ALTER TABLE "public"."developer_finding_responses"
  ADD COLUMN "cycle_id" UUID;
CREATE INDEX "developer_finding_responses_cycle_id_idx"
  ON "public"."developer_finding_responses"("cycle_id");
ALTER TABLE "public"."developer_finding_responses"
  ADD CONSTRAINT "developer_finding_responses_cycle_id_fkey"
  FOREIGN KEY ("cycle_id") REFERENCES "public"."review_cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Every historical Request Changes decision created exactly one business cycle.
INSERT INTO "public"."review_cycles" (
  "task_id", "round_number", "outcome", "counted", "created_at", "updated_at"
)
SELECT form."task_id", form."review_cycle_number", 'CHANGES_REQUESTED', true,
       COALESCE(form."completed_at", form."created_at"),
       COALESCE(form."completed_at", form."created_at")
FROM "public"."code_review_forms" form
WHERE form."decision" = 'CHANGES_REQUESTED'
ON CONFLICT ("task_id", "round_number") DO NOTHING;

-- The legacy counter was advanced on Request Changes. Rebase it to the highest
-- review form that actually exists so it becomes the immutable real round.
UPDATE "public"."tasks" task
SET "current_review_cycle" = COALESCE(forms."latest_round", 0)
FROM (
  SELECT task_row."id" AS "task_id", MAX(form."review_cycle_number") AS "latest_round"
  FROM "public"."tasks" task_row
  LEFT JOIN "public"."code_review_forms" form ON form."task_id" = task_row."id"
  GROUP BY task_row."id"
) forms
WHERE task."id" = forms."task_id";

-- Preserve exclusions recorded by the prior audit-based implementation.
UPDATE "public"."review_cycles" cycle
SET "counted" = false,
    "exclusion_reason" = COALESCE(
      audit."metadata"->>'reason',
      'All findings were rejected by the developer and accepted by the reviewer.'
    ),
    "excluded_at" = audit."created_at",
    "updated_at" = audit."created_at"
FROM "public"."audit_logs" audit
WHERE audit."task_id" = cycle."task_id"
  AND audit."action" = 'COUNTED_CYCLE_ADJUSTED'
  AND (audit."metadata"->>'qualifyingReviewRound')::integer = cycle."round_number";

-- Link existing responses to the counted cycle created by their originating finding.
UPDATE "public"."developer_finding_responses" response
SET "cycle_id" = cycle."id"
FROM "public"."review_findings" finding
JOIN "public"."code_review_forms" form ON form."id" = finding."review_form_id"
JOIN "public"."review_cycles" cycle
  ON cycle."task_id" = form."task_id"
 AND cycle."round_number" = form."review_cycle_number"
WHERE response."finding_id" = finding."id";
