-- Super Admin is an exclusive role. Normalize an existing Super Admin before
-- installing the database invariant, while retaining every user record.
DELETE FROM "user_roles" AS extra_assignment
WHERE EXISTS (
  SELECT 1
  FROM "user_roles" AS super_assignment
  JOIN "roles" AS super_role ON super_role."id" = super_assignment."role_id"
  WHERE super_assignment."user_id" = extra_assignment."user_id"
    AND super_role."code" = 'SUPER_ADMIN'
    AND super_role."deleted_at" IS NULL
    AND super_assignment."role_id" <> extra_assignment."role_id"
);

DO $$
BEGIN
  IF (
    SELECT COUNT(*)
    FROM "user_roles" AS assignment
    JOIN "roles" AS role ON role."id" = assignment."role_id"
    WHERE role."code" = 'SUPER_ADMIN'
      AND role."deleted_at" IS NULL
  ) > 1 THEN
    RAISE EXCEPTION 'Cannot install Super Admin invariant: more than one Super Admin exists';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "user_roles" AS assignment
    JOIN "roles" AS role ON role."id" = assignment."role_id"
    JOIN "users" AS account ON account."id" = assignment."user_id"
    WHERE role."code" = 'SUPER_ADMIN'
      AND role."deleted_at" IS NULL
      AND (account."status" <> 'ACTIVE' OR account."deleted_at" IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Cannot install Super Admin invariant: current Super Admin is not active';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION "protect_super_admin_roles"()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."code" IN ('ADMIN', 'SUPER_ADMIN')
    AND (NEW."code" <> OLD."code" OR NEW."deleted_at" IS DISTINCT FROM OLD."deleted_at") THEN
    RAISE EXCEPTION 'The Admin and Super Admin roles cannot be renamed or deleted'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "protect_super_admin_roles_trigger"
BEFORE UPDATE ON "roles"
FOR EACH ROW EXECUTE FUNCTION "protect_super_admin_roles"();

CREATE OR REPLACE FUNCTION "validate_super_admin_assignment"()
RETURNS TRIGGER AS $$
DECLARE
  assigns_super_admin BOOLEAN := FALSE;
  affects_super_admin BOOLEAN := FALSE;
BEGIN
  IF TG_OP <> 'DELETE' THEN
    SELECT role."code" = 'SUPER_ADMIN'
      INTO assigns_super_admin
      FROM "roles" AS role
      WHERE role."id" = NEW."role_id";
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT assigns_super_admin OR EXISTS (
      SELECT 1
      FROM "user_roles" AS assignment
      JOIN "roles" AS role ON role."id" = assignment."role_id"
      WHERE assignment."user_id" = NEW."user_id"
        AND role."code" = 'SUPER_ADMIN'
        AND role."deleted_at" IS NULL
    ) INTO affects_super_admin;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT role."code" = 'SUPER_ADMIN' OR EXISTS (
      SELECT 1
      FROM "user_roles" AS assignment
      JOIN "roles" AS assigned_role ON assigned_role."id" = assignment."role_id"
      WHERE assignment."user_id" = OLD."user_id"
        AND assigned_role."code" = 'SUPER_ADMIN'
        AND assigned_role."deleted_at" IS NULL
    )
      INTO affects_super_admin
      FROM "roles" AS role
      WHERE role."id" = OLD."role_id";
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM "roles" AS role
      WHERE role."code" = 'SUPER_ADMIN'
        AND role."id" IN (OLD."role_id", NEW."role_id")
    ) OR EXISTS (
      SELECT 1
      FROM "user_roles" AS assignment
      JOIN "roles" AS role ON role."id" = assignment."role_id"
      WHERE assignment."user_id" IN (OLD."user_id", NEW."user_id")
        AND role."code" = 'SUPER_ADMIN'
        AND role."deleted_at" IS NULL
    ) INTO affects_super_admin;
  END IF;

  IF affects_super_admin THEN
    PERFORM pg_advisory_xact_lock(hashtext('sdp-privileged-role-invariant'));
  END IF;

  -- Qualification is checked before assignment. The Admin role is then removed
  -- in the same transaction so the committed Super Admin role is exclusive.
  IF assigns_super_admin AND NOT EXISTS (
    SELECT 1
    FROM "user_roles" AS assignment
    JOIN "roles" AS role ON role."id" = assignment."role_id"
    JOIN "users" AS account ON account."id" = assignment."user_id"
    WHERE assignment."user_id" = NEW."user_id"
      AND role."code" = 'ADMIN'
      AND role."deleted_at" IS NULL
      AND account."status" = 'ACTIVE'
      AND account."deleted_at" IS NULL
  ) THEN
    RAISE EXCEPTION 'Only an active existing Admin can become Super Admin'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "validate_super_admin_assignment_trigger"
BEFORE INSERT OR UPDATE OR DELETE ON "user_roles"
FOR EACH ROW EXECUTE FUNCTION "validate_super_admin_assignment"();

CREATE OR REPLACE FUNCTION "enforce_exclusive_super_admin"()
RETURNS TRIGGER AS $$
DECLARE
  affects_super_admin BOOLEAN := FALSE;
  super_admin_count INTEGER;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT role."code" = 'SUPER_ADMIN' OR EXISTS (
      SELECT 1
      FROM "user_roles" AS assignment
      JOIN "roles" AS assigned_role ON assigned_role."id" = assignment."role_id"
      WHERE assignment."user_id" = NEW."user_id"
        AND assigned_role."code" = 'SUPER_ADMIN'
        AND assigned_role."deleted_at" IS NULL
    )
      INTO affects_super_admin
      FROM "roles" AS role
      WHERE role."id" = NEW."role_id";
  ELSIF TG_OP = 'DELETE' THEN
    SELECT role."code" = 'SUPER_ADMIN' OR EXISTS (
      SELECT 1
      FROM "user_roles" AS assignment
      JOIN "roles" AS assigned_role ON assigned_role."id" = assignment."role_id"
      WHERE assignment."user_id" = OLD."user_id"
        AND assigned_role."code" = 'SUPER_ADMIN'
        AND assigned_role."deleted_at" IS NULL
    )
      INTO affects_super_admin
      FROM "roles" AS role
      WHERE role."id" = OLD."role_id";
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM "roles" AS role
      WHERE role."code" = 'SUPER_ADMIN'
        AND role."id" IN (OLD."role_id", NEW."role_id")
    ) OR EXISTS (
      SELECT 1
      FROM "user_roles" AS assignment
      JOIN "roles" AS role ON role."id" = assignment."role_id"
      WHERE assignment."user_id" IN (OLD."user_id", NEW."user_id")
        AND role."code" = 'SUPER_ADMIN'
        AND role."deleted_at" IS NULL
    ) INTO affects_super_admin;
  END IF;

  IF NOT affects_super_admin THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  SELECT COUNT(*)
    INTO super_admin_count
    FROM "user_roles" AS assignment
    JOIN "roles" AS role ON role."id" = assignment."role_id"
    WHERE role."code" = 'SUPER_ADMIN'
      AND role."deleted_at" IS NULL;

  IF super_admin_count <> 1 THEN
    RAISE EXCEPTION 'The system must have exactly one Super Admin'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "user_roles" AS super_assignment
    JOIN "roles" AS super_role ON super_role."id" = super_assignment."role_id"
    JOIN "users" AS account ON account."id" = super_assignment."user_id"
    WHERE super_role."code" = 'SUPER_ADMIN'
      AND super_role."deleted_at" IS NULL
      AND (
        account."status" <> 'ACTIVE'
        OR account."deleted_at" IS NOT NULL
        OR EXISTS (
          SELECT 1
          FROM "user_roles" AS other_assignment
          WHERE other_assignment."user_id" = super_assignment."user_id"
            AND other_assignment."role_id" <> super_assignment."role_id"
        )
      )
  ) THEN
    RAISE EXCEPTION 'A Super Admin must be active and have no other roles'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "exclusive_super_admin_constraint"
AFTER INSERT OR UPDATE OR DELETE ON "user_roles"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "enforce_exclusive_super_admin"();

CREATE OR REPLACE FUNCTION "enforce_super_admin_user_eligibility"()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "user_roles" AS assignment
    JOIN "roles" AS role ON role."id" = assignment."role_id"
    WHERE assignment."user_id" = NEW."id"
      AND role."code" = 'SUPER_ADMIN'
      AND role."deleted_at" IS NULL
  ) AND (NEW."status" <> 'ACTIVE' OR NEW."deleted_at" IS NOT NULL) THEN
    RAISE EXCEPTION 'The Super Admin must remain active and cannot be deleted before transfer'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "super_admin_user_eligibility_constraint"
AFTER UPDATE OF "status", "deleted_at" ON "users"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "enforce_super_admin_user_eligibility"();
