-- One-time invite / password-reset links (docs/18-security.md, "Password links").
-- Only SHA-256(token) is stored, so a database dump or log line cannot be replayed.
-- Additive only: new enums and a new table; no existing data is touched.

CREATE TYPE "public"."password_link_purpose" AS ENUM ('INVITE', 'RESET');

CREATE TYPE "public"."email_delivery_status" AS ENUM ('SENT', 'FAILED');

CREATE TABLE "public"."password_links" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "purpose" "public"."password_link_purpose" NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "used_at" TIMESTAMPTZ(6),
  "revoked_at" TIMESTAMPTZ(6),
  "failed_attempts" INTEGER NOT NULL DEFAULT 0,
  "email_status" "public"."email_delivery_status",
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "password_links_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "password_links_user_id_fkey" FOREIGN KEY ("user_id")
    REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "password_links_token_hash_key" ON "public"."password_links"("token_hash");
CREATE INDEX "password_links_user_id_purpose_idx" ON "public"."password_links"("user_id", "purpose");
CREATE INDEX "password_links_expires_at_idx" ON "public"."password_links"("expires_at");
