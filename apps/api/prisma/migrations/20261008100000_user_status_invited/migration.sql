-- Temporary local auth (until SSO): an admin-created account starts INVITED and
-- cannot sign in until the user sets a password through the emailed link.
--
-- Additive only. Kept in its own migration because PostgreSQL cannot use a new
-- enum value inside the transaction that adds it.
ALTER TYPE "public"."user_status" ADD VALUE IF NOT EXISTS 'INVITED';
