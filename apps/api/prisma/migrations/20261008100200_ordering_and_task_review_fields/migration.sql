-- Additive columns only. Existing rows are backfilled; nothing is dropped or renamed.

-- 1. Task type order (PATCH /task-types/order). Backfilled alphabetically, 1..n,
--    which is the order the API returned before this column existed.
ALTER TABLE "public"."task_types"
  ADD COLUMN "display_order" INTEGER NOT NULL DEFAULT 0;

UPDATE "public"."task_types" AS task_type
SET "display_order" = ordered.position
FROM (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "name", "id") AS position
  FROM "public"."task_types"
) AS ordered
WHERE ordered."id" = task_type."id";

-- 2. Checklist category order (PATCH /checklist-categories/order). Until now a
--    category's order lived only on its per-task-type mappings; seed the new
--    column from the smallest mapping order, then make it dense 1..n.
ALTER TABLE "public"."checklist_sections"
  ADD COLUMN "display_order" INTEGER NOT NULL DEFAULT 0;

UPDATE "public"."checklist_sections" AS section
SET "display_order" = ordered.position
FROM (
  SELECT section."id",
         ROW_NUMBER() OVER (
           ORDER BY COALESCE(MIN(mapping."display_order"), 2147483647), section."name", section."id"
         ) AS position
  FROM "public"."checklist_sections" AS section
  LEFT JOIN "public"."task_type_checklist_sections" AS mapping
    ON mapping."section_id" = section."id"
  GROUP BY section."id", section."name"
) AS ordered
WHERE ordered."id" = section."id";

-- 3. Developer's note to the reviewer, previously accepted by the API but dropped.
ALTER TABLE "public"."tasks" ADD COLUMN "note_to_reviewer" TEXT;

-- 4. Admin-chosen follow-up reviewer for a task awaiting resubmission
--    (docs/25-review-assignment-rules.md). NULL = the reviewer who requested changes.
ALTER TABLE "public"."tasks" ADD COLUMN "resubmission_reviewer_id" UUID;
ALTER TABLE "public"."tasks"
  ADD CONSTRAINT "tasks_resubmission_reviewer_id_fkey" FOREIGN KEY ("resubmission_reviewer_id")
  REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "tasks_resubmission_reviewer_id_idx" ON "public"."tasks"("resubmission_reviewer_id");
