-- Add local credentials without excluding future Entra-only accounts.
ALTER TABLE "public"."users"
ADD COLUMN "password_hash" VARCHAR(255);

-- Refresh tokens are rotated and stored only as Argon2 hashes.
CREATE TABLE "public"."refresh_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "last_used_at" TIMESTAMPTZ(6),
    "user_agent" VARCHAR(500),
    "ip_address" VARCHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "refresh_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "refresh_sessions_user_id_idx" ON "public"."refresh_sessions"("user_id");
CREATE INDEX "refresh_sessions_expires_at_idx" ON "public"."refresh_sessions"("expires_at");

ALTER TABLE "public"."refresh_sessions"
ADD CONSTRAINT "refresh_sessions_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

