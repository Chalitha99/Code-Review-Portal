CREATE OR REPLACE FUNCTION "public"."create_task_status_notification"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  actor_name text;
  target_reviewer_id uuid;
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status::text IN ('APPROVED', 'CHANGES_REQUESTED') THEN
    target_reviewer_id := COALESCE(NEW.current_reviewer_id, OLD.current_reviewer_id);
    SELECT full_name INTO actor_name FROM "public"."users" WHERE id = target_reviewer_id;

    INSERT INTO "public"."notifications"
      (id, task_id, recipient_id, notification_type, title, message, is_read, email_sent, created_at)
    VALUES
      (
        gen_random_uuid(),
        NEW.id,
        NEW.developer_id,
        CASE
          WHEN NEW.status::text = 'APPROVED' THEN 'TASK_APPROVED'::"public"."notification_type"
          ELSE 'CHANGES_REQUESTED'::"public"."notification_type"
        END,
        CASE
          WHEN NEW.status::text = 'APPROVED' THEN NEW.title || ' approved'
          ELSE 'Changes requested on ' || NEW.title
        END,
        COALESCE(actor_name, 'Your reviewer') || CASE
          WHEN NEW.status::text = 'APPROVED' THEN ' approved your code review task.'
          ELSE ' requested changes to your code review task.'
        END,
        false,
        false,
        now()
      );
  ELSIF NEW.status::text = 'RESUBMITTED' THEN
    SELECT assignment.reviewer_id INTO target_reviewer_id
    FROM "public"."task_reviewer_assignments" AS assignment
    WHERE assignment.task_id = NEW.id
    ORDER BY assignment.assigned_at DESC
    LIMIT 1;

    IF target_reviewer_id IS NOT NULL THEN
      SELECT full_name INTO actor_name FROM "public"."users" WHERE id = NEW.developer_id;
      INSERT INTO "public"."notifications"
        (id, task_id, recipient_id, notification_type, title, message, is_read, email_sent, created_at)
      VALUES
        (
          gen_random_uuid(),
          NEW.id,
          target_reviewer_id,
          'TASK_RESUBMITTED'::"public"."notification_type",
          NEW.title || ' resubmitted for review',
          COALESCE(actor_name, 'The developer') || ' resubmitted the task for your review.',
          false,
          false,
          now()
        );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "task_status_notification" ON "public"."tasks";
CREATE TRIGGER "task_status_notification"
AFTER UPDATE OF status ON "public"."tasks"
FOR EACH ROW
EXECUTE FUNCTION "public"."create_task_status_notification"();
