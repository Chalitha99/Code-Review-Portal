CREATE TABLE "public"."task_attachments" (
  "id" UUID NOT NULL,
  "task_id" UUID NOT NULL,
  "file_name" VARCHAR(255) NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "mime_type" VARCHAR(100) NOT NULL,
  "storage_ref" TEXT NOT NULL,
  "caption" TEXT NOT NULL DEFAULT '',
  "uploaded_by_id" UUID NOT NULL,
  "uploaded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "task_attachments_task_id_idx" ON "public"."task_attachments"("task_id");
CREATE INDEX "task_attachments_uploaded_by_id_idx" ON "public"."task_attachments"("uploaded_by_id");

ALTER TABLE "public"."task_attachments"
  ADD CONSTRAINT "task_attachments_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."task_attachments"
  ADD CONSTRAINT "task_attachments_uploaded_by_id_fkey"
  FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
