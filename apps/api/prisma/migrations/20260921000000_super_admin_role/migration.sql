INSERT INTO "roles" ("code", "name", "description")
VALUES (
  'SUPER_ADMIN',
  'Super Administrator',
  'Manages portal users and grants all available roles.'
)
ON CONFLICT ("code") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description";
