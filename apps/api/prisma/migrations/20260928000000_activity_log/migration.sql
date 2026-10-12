ALTER TABLE "public"."audit_logs"
  ALTER COLUMN "entity_id" TYPE VARCHAR(100) USING "entity_id"::text,
  ADD COLUMN "actor_name" VARCHAR(255),
  ADD COLUMN "actor_role" VARCHAR(100),
  ADD COLUMN "description" TEXT,
  ADD COLUMN "task_id" UUID,
  ADD COLUMN "target_user_id" UUID,
  ADD COLUMN "metadata" JSONB;

UPDATE "public"."audit_logs" AS audit
SET
  "actor_name" = COALESCE(users."full_name", 'System'),
  "actor_role" = 'UNKNOWN',
  "description" = audit."action"
FROM "public"."users" AS users
WHERE users."id" = audit."user_id";

UPDATE "public"."audit_logs"
SET
  "actor_name" = COALESCE("actor_name", 'System'),
  "actor_role" = COALESCE("actor_role", 'SYSTEM'),
  "description" = COALESCE("description", "action");

ALTER TABLE "public"."audit_logs"
  ALTER COLUMN "actor_name" SET NOT NULL,
  ALTER COLUMN "actor_role" SET NOT NULL,
  ALTER COLUMN "description" SET NOT NULL;

CREATE INDEX "audit_logs_action_idx" ON "public"."audit_logs"("action");
CREATE INDEX "audit_logs_actor_role_idx" ON "public"."audit_logs"("actor_role");
CREATE INDEX "audit_logs_task_id_idx" ON "public"."audit_logs"("task_id");
CREATE INDEX "audit_logs_target_user_id_idx" ON "public"."audit_logs"("target_user_id");
CREATE INDEX "audit_logs_created_at_idx" ON "public"."audit_logs"("created_at");
