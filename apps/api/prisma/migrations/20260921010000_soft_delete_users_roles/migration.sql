ALTER TABLE "users"
ADD COLUMN "deleted_at" TIMESTAMPTZ(6);

ALTER TABLE "roles"
ADD COLUMN "deleted_at" TIMESTAMPTZ(6);

CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");
CREATE INDEX "roles_deleted_at_idx" ON "roles"("deleted_at");
