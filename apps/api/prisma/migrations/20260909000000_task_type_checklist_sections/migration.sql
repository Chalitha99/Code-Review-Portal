-- Move checklist applicability from individual questions to their parent sections.
CREATE TABLE "public"."task_type_checklist_sections" (
    "task_type_id" SMALLINT NOT NULL,
    "section_id" UUID NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "task_type_checklist_sections_pkey" PRIMARY KEY ("task_type_id", "section_id")
);

-- Preserve current configuration by deriving one mapping per task type/section.
-- The section's existing order becomes the initial per-task-type order.
INSERT INTO "public"."task_type_checklist_sections" ("task_type_id", "section_id", "display_order")
SELECT DISTINCT cqts."task_type_id", cq."section_id", cs."display_order"
FROM "public"."checklist_question_task_types" cqts
JOIN "public"."checklist_questions" cq ON cq."id" = cqts."question_id"
JOIN "public"."checklist_sections" cs ON cs."id" = cq."section_id";

CREATE INDEX "task_type_checklist_sections_section_id_idx"
ON "public"."task_type_checklist_sections"("section_id");

CREATE INDEX "task_type_checklist_sections_task_type_id_display_order_idx"
ON "public"."task_type_checklist_sections"("task_type_id", "display_order");

ALTER TABLE "public"."task_type_checklist_sections"
ADD CONSTRAINT "task_type_checklist_sections_task_type_id_fkey"
FOREIGN KEY ("task_type_id") REFERENCES "public"."task_types"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."task_type_checklist_sections"
ADD CONSTRAINT "task_type_checklist_sections_section_id_fkey"
FOREIGN KEY ("section_id") REFERENCES "public"."checklist_sections"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

DROP TABLE "public"."checklist_question_task_types";

-- Ordering now belongs to the task type/section mapping.
ALTER TABLE "public"."checklist_sections" DROP COLUMN "display_order";

