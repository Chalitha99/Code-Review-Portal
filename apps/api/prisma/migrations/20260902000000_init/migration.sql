-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."user_status" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "public"."customer_status" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "public"."task_priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "public"."task_status" AS ENUM ('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'CHANGES_REQUESTED', 'RESUBMITTED', 'APPROVED', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."reviewer_assignment_type" AS ENUM ('SELF_PICKED', 'ADMIN_ASSIGNED', 'ADMIN_REASSIGNED', 'HANDOVER_REASSIGNED');

-- CreateEnum
CREATE TYPE "public"."checklist_status" AS ENUM ('DRAFT', 'COMPLETED');

-- CreateEnum
CREATE TYPE "public"."checklist_answer_value" AS ENUM ('YES', 'NO', 'NA');

-- CreateEnum
CREATE TYPE "public"."code_review_form_status" AS ENUM ('DRAFT', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "public"."review_decision" AS ENUM ('APPROVED', 'CHANGES_REQUESTED');

-- CreateEnum
CREATE TYPE "public"."code_review_answer_value" AS ENUM ('OK', 'PARTIALLY_OK', 'NOT_OK', 'NA');

-- CreateEnum
CREATE TYPE "public"."finding_status" AS ENUM ('OPEN', 'RESOLVED', 'REJECTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "public"."developer_decision" AS ENUM ('RESOLVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."reviewer_decision" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."handover_status" AS ENUM ('PENDING', 'REASSIGNED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."notification_type" AS ENUM ('TASK_SUBMITTED', 'TASK_ASSIGNED', 'CHANGES_REQUESTED', 'TASK_RESUBMITTED', 'TASK_APPROVED', 'TASK_HANDOVER', 'TASK_CANCELLED', 'TASK_DELIVERED');

-- CreateTable
CREATE TABLE "public"."users" (
    "id" UUID NOT NULL,
    "entra_object_id" VARCHAR(100),
    "email" VARCHAR(255) NOT NULL,
    "full_name" VARCHAR(255) NOT NULL,
    "status" "public"."user_status" NOT NULL DEFAULT 'ACTIVE',
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."roles" (
    "id" SMALLSERIAL NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" SMALLINT NOT NULL,
    "granted_by" UUID,
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "public"."customers" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "color" VARCHAR(20),
    "status" "public"."customer_status" NOT NULL DEFAULT 'ACTIVE',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."task_types" (
    "id" SMALLSERIAL NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "task_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tasks" (
    "id" UUID NOT NULL,
    "task_code" VARCHAR(100) NOT NULL,
    "customer_sequence_no" INTEGER NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "crim_id" VARCHAR(100) NOT NULL,
    "version" VARCHAR(100),
    "priority" "public"."task_priority" NOT NULL,
    "status" "public"."task_status" NOT NULL,
    "current_review_cycle" INTEGER NOT NULL DEFAULT 0,
    "checklist_completed" BOOLEAN NOT NULL DEFAULT false,
    "developer_id" UUID NOT NULL,
    "current_reviewer_id" UUID,
    "customer_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "submitted_at" TIMESTAMPTZ(6),
    "approved_at" TIMESTAMPTZ(6),
    "delivered_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."task_task_types" (
    "task_id" UUID NOT NULL,
    "task_type_id" SMALLINT NOT NULL,

    CONSTRAINT "task_task_types_pkey" PRIMARY KEY ("task_id","task_type_id")
);

-- CreateTable
CREATE TABLE "public"."task_reviewer_assignments" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "reviewer_id" UUID NOT NULL,
    "assigned_by" UUID,
    "assignment_type" "public"."reviewer_assignment_type" NOT NULL,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unassigned_at" TIMESTAMPTZ(6),
    "is_current" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "task_reviewer_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."task_status_history" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "old_status" "public"."task_status",
    "new_status" "public"."task_status" NOT NULL,
    "changed_by" UUID,
    "review_form_id" UUID,
    "remarks" TEXT,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."checklist_sections" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "checklist_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."checklist_questions" (
    "id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "question_text" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "checklist_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."checklist_question_task_types" (
    "question_id" UUID NOT NULL,
    "task_type_id" SMALLINT NOT NULL,

    CONSTRAINT "checklist_question_task_types_pkey" PRIMARY KEY ("question_id","task_type_id")
);

-- CreateTable
CREATE TABLE "public"."developer_checklists" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "developer_id" UUID NOT NULL,
    "additional_remarks" TEXT,
    "status" "public"."checklist_status" NOT NULL DEFAULT 'DRAFT',
    "checked_date" DATE,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "developer_checklists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."checklist_answers" (
    "id" UUID NOT NULL,
    "checklist_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "answer" "public"."checklist_answer_value" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "checklist_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."code_review_questions" (
    "id" UUID NOT NULL,
    "section_name" VARCHAR(255),
    "question_text" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "code_review_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."code_review_forms" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "reviewer_id" UUID NOT NULL,
    "review_cycle_number" INTEGER NOT NULL,
    "review_rank" SMALLINT,
    "review_comment" TEXT,
    "other_remarks" TEXT,
    "feedback_summary" TEXT,
    "status" "public"."code_review_form_status" NOT NULL,
    "decision" "public"."review_decision",
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "code_review_forms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."code_review_answers" (
    "id" UUID NOT NULL,
    "review_form_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "answer" "public"."code_review_answer_value" NOT NULL,
    "detailed_findings" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "code_review_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."review_findings" (
    "id" UUID NOT NULL,
    "review_form_id" UUID NOT NULL,
    "finding_no" INTEGER NOT NULL,
    "comment_text" TEXT NOT NULL,
    "status" "public"."finding_status" NOT NULL DEFAULT 'OPEN',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "review_findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."finding_screenshots" (
    "id" UUID NOT NULL,
    "finding_id" UUID NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "storage_key" TEXT NOT NULL,
    "file_url" TEXT,
    "mime_type" VARCHAR(100) NOT NULL,
    "file_size" BIGINT NOT NULL,
    "annotation_text" TEXT,
    "uploaded_by" UUID NOT NULL,
    "uploaded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finding_screenshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."developer_finding_responses" (
    "id" UUID NOT NULL,
    "finding_id" UUID NOT NULL,
    "developer_id" UUID NOT NULL,
    "decision" "public"."developer_decision" NOT NULL,
    "rejection_reason" TEXT,
    "developer_comment" TEXT,
    "responded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewer_decision" "public"."reviewer_decision" NOT NULL DEFAULT 'PENDING',
    "reviewer_comment" TEXT,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),

    CONSTRAINT "developer_finding_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."handover_tasks" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "from_reviewer_id" UUID NOT NULL,
    "to_reviewer_id" UUID,
    "reason" TEXT,
    "status" "public"."handover_status" NOT NULL,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reassigned_by" UUID,
    "reassigned_at" TIMESTAMPTZ(6),

    CONSTRAINT "handover_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."notifications" (
    "id" UUID NOT NULL,
    "task_id" UUID,
    "recipient_id" UUID NOT NULL,
    "notification_type" "public"."notification_type" NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "message" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMPTZ(6),
    "email_sent" BOOLEAN NOT NULL DEFAULT false,
    "email_sent_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."audit_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "action" VARCHAR(100) NOT NULL,
    "entity_type" VARCHAR(100) NOT NULL,
    "entity_id" UUID,
    "old_values" JSONB,
    "new_values" JSONB,
    "ip_address" INET,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_entra_object_id_key" ON "public"."users"("entra_object_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "public"."roles"("code");

-- CreateIndex
CREATE INDEX "user_roles_role_id_idx" ON "public"."user_roles"("role_id");

-- CreateIndex
CREATE INDEX "user_roles_granted_by_idx" ON "public"."user_roles"("granted_by");

-- CreateIndex
CREATE UNIQUE INDEX "customers_code_key" ON "public"."customers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "customers_name_key" ON "public"."customers"("name");

-- CreateIndex
CREATE INDEX "customers_created_by_idx" ON "public"."customers"("created_by");

-- CreateIndex
CREATE UNIQUE INDEX "task_types_code_key" ON "public"."task_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_task_code_key" ON "public"."tasks"("task_code");

-- CreateIndex
CREATE INDEX "tasks_task_code_idx" ON "public"."tasks"("task_code");

-- CreateIndex
CREATE INDEX "tasks_crim_id_idx" ON "public"."tasks"("crim_id");

-- CreateIndex
CREATE INDEX "tasks_customer_id_idx" ON "public"."tasks"("customer_id");

-- CreateIndex
CREATE INDEX "tasks_developer_id_idx" ON "public"."tasks"("developer_id");

-- CreateIndex
CREATE INDEX "tasks_current_reviewer_id_idx" ON "public"."tasks"("current_reviewer_id");

-- CreateIndex
CREATE INDEX "tasks_status_idx" ON "public"."tasks"("status");

-- CreateIndex
CREATE INDEX "tasks_priority_idx" ON "public"."tasks"("priority");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_customer_id_customer_sequence_no_key" ON "public"."tasks"("customer_id", "customer_sequence_no");

-- CreateIndex
CREATE INDEX "task_task_types_task_type_id_idx" ON "public"."task_task_types"("task_type_id");

-- CreateIndex
CREATE INDEX "task_reviewer_assignments_task_id_idx" ON "public"."task_reviewer_assignments"("task_id");

-- CreateIndex
CREATE INDEX "task_reviewer_assignments_reviewer_id_idx" ON "public"."task_reviewer_assignments"("reviewer_id");

-- CreateIndex
CREATE INDEX "task_reviewer_assignments_assigned_by_idx" ON "public"."task_reviewer_assignments"("assigned_by");

-- CreateIndex
CREATE INDEX "task_status_history_task_id_idx" ON "public"."task_status_history"("task_id");

-- CreateIndex
CREATE INDEX "task_status_history_changed_by_idx" ON "public"."task_status_history"("changed_by");

-- CreateIndex
CREATE INDEX "task_status_history_review_form_id_idx" ON "public"."task_status_history"("review_form_id");

-- CreateIndex
CREATE INDEX "checklist_questions_section_id_idx" ON "public"."checklist_questions"("section_id");

-- CreateIndex
CREATE INDEX "checklist_question_task_types_task_type_id_idx" ON "public"."checklist_question_task_types"("task_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "developer_checklists_task_id_key" ON "public"."developer_checklists"("task_id");

-- CreateIndex
CREATE INDEX "developer_checklists_developer_id_idx" ON "public"."developer_checklists"("developer_id");

-- CreateIndex
CREATE INDEX "checklist_answers_checklist_id_idx" ON "public"."checklist_answers"("checklist_id");

-- CreateIndex
CREATE INDEX "checklist_answers_question_id_idx" ON "public"."checklist_answers"("question_id");

-- CreateIndex
CREATE UNIQUE INDEX "checklist_answers_checklist_id_question_id_key" ON "public"."checklist_answers"("checklist_id", "question_id");

-- CreateIndex
CREATE INDEX "code_review_forms_task_id_idx" ON "public"."code_review_forms"("task_id");

-- CreateIndex
CREATE INDEX "code_review_forms_reviewer_id_idx" ON "public"."code_review_forms"("reviewer_id");

-- CreateIndex
CREATE UNIQUE INDEX "code_review_forms_task_id_review_cycle_number_key" ON "public"."code_review_forms"("task_id", "review_cycle_number");

-- CreateIndex
CREATE INDEX "code_review_answers_review_form_id_idx" ON "public"."code_review_answers"("review_form_id");

-- CreateIndex
CREATE INDEX "code_review_answers_question_id_idx" ON "public"."code_review_answers"("question_id");

-- CreateIndex
CREATE UNIQUE INDEX "code_review_answers_review_form_id_question_id_key" ON "public"."code_review_answers"("review_form_id", "question_id");

-- CreateIndex
CREATE INDEX "review_findings_review_form_id_idx" ON "public"."review_findings"("review_form_id");

-- CreateIndex
CREATE INDEX "review_findings_created_by_idx" ON "public"."review_findings"("created_by");

-- CreateIndex
CREATE UNIQUE INDEX "review_findings_review_form_id_finding_no_key" ON "public"."review_findings"("review_form_id", "finding_no");

-- CreateIndex
CREATE INDEX "finding_screenshots_finding_id_idx" ON "public"."finding_screenshots"("finding_id");

-- CreateIndex
CREATE INDEX "finding_screenshots_uploaded_by_idx" ON "public"."finding_screenshots"("uploaded_by");

-- CreateIndex
CREATE INDEX "developer_finding_responses_finding_id_idx" ON "public"."developer_finding_responses"("finding_id");

-- CreateIndex
CREATE INDEX "developer_finding_responses_developer_id_idx" ON "public"."developer_finding_responses"("developer_id");

-- CreateIndex
CREATE INDEX "developer_finding_responses_reviewed_by_idx" ON "public"."developer_finding_responses"("reviewed_by");

-- CreateIndex
CREATE INDEX "handover_tasks_task_id_idx" ON "public"."handover_tasks"("task_id");

-- CreateIndex
CREATE INDEX "handover_tasks_from_reviewer_id_idx" ON "public"."handover_tasks"("from_reviewer_id");

-- CreateIndex
CREATE INDEX "handover_tasks_to_reviewer_id_idx" ON "public"."handover_tasks"("to_reviewer_id");

-- CreateIndex
CREATE INDEX "handover_tasks_reassigned_by_idx" ON "public"."handover_tasks"("reassigned_by");

-- CreateIndex
CREATE INDEX "notifications_task_id_idx" ON "public"."notifications"("task_id");

-- CreateIndex
CREATE INDEX "notifications_recipient_id_idx" ON "public"."notifications"("recipient_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "public"."audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "public"."audit_logs"("entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "public"."user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_roles" ADD CONSTRAINT "user_roles_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."customers" ADD CONSTRAINT "customers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tasks" ADD CONSTRAINT "tasks_developer_id_fkey" FOREIGN KEY ("developer_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tasks" ADD CONSTRAINT "tasks_current_reviewer_id_fkey" FOREIGN KEY ("current_reviewer_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tasks" ADD CONSTRAINT "tasks_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."task_task_types" ADD CONSTRAINT "task_task_types_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."task_task_types" ADD CONSTRAINT "task_task_types_task_type_id_fkey" FOREIGN KEY ("task_type_id") REFERENCES "public"."task_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."task_reviewer_assignments" ADD CONSTRAINT "task_reviewer_assignments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."task_reviewer_assignments" ADD CONSTRAINT "task_reviewer_assignments_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."task_reviewer_assignments" ADD CONSTRAINT "task_reviewer_assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."task_status_history" ADD CONSTRAINT "task_status_history_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."task_status_history" ADD CONSTRAINT "task_status_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."task_status_history" ADD CONSTRAINT "task_status_history_review_form_id_fkey" FOREIGN KEY ("review_form_id") REFERENCES "public"."code_review_forms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."checklist_questions" ADD CONSTRAINT "checklist_questions_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "public"."checklist_sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."checklist_question_task_types" ADD CONSTRAINT "checklist_question_task_types_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."checklist_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."checklist_question_task_types" ADD CONSTRAINT "checklist_question_task_types_task_type_id_fkey" FOREIGN KEY ("task_type_id") REFERENCES "public"."task_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."developer_checklists" ADD CONSTRAINT "developer_checklists_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."developer_checklists" ADD CONSTRAINT "developer_checklists_developer_id_fkey" FOREIGN KEY ("developer_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."checklist_answers" ADD CONSTRAINT "checklist_answers_checklist_id_fkey" FOREIGN KEY ("checklist_id") REFERENCES "public"."developer_checklists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."checklist_answers" ADD CONSTRAINT "checklist_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."checklist_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."code_review_forms" ADD CONSTRAINT "code_review_forms_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."code_review_forms" ADD CONSTRAINT "code_review_forms_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."code_review_answers" ADD CONSTRAINT "code_review_answers_review_form_id_fkey" FOREIGN KEY ("review_form_id") REFERENCES "public"."code_review_forms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."code_review_answers" ADD CONSTRAINT "code_review_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."code_review_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."review_findings" ADD CONSTRAINT "review_findings_review_form_id_fkey" FOREIGN KEY ("review_form_id") REFERENCES "public"."code_review_forms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."review_findings" ADD CONSTRAINT "review_findings_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."finding_screenshots" ADD CONSTRAINT "finding_screenshots_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "public"."review_findings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."finding_screenshots" ADD CONSTRAINT "finding_screenshots_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."developer_finding_responses" ADD CONSTRAINT "developer_finding_responses_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "public"."review_findings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."developer_finding_responses" ADD CONSTRAINT "developer_finding_responses_developer_id_fkey" FOREIGN KEY ("developer_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."developer_finding_responses" ADD CONSTRAINT "developer_finding_responses_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."handover_tasks" ADD CONSTRAINT "handover_tasks_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."handover_tasks" ADD CONSTRAINT "handover_tasks_from_reviewer_id_fkey" FOREIGN KEY ("from_reviewer_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."handover_tasks" ADD CONSTRAINT "handover_tasks_to_reviewer_id_fkey" FOREIGN KEY ("to_reviewer_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."handover_tasks" ADD CONSTRAINT "handover_tasks_reassigned_by_fkey" FOREIGN KEY ("reassigned_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."notifications" ADD CONSTRAINT "notifications_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."notifications" ADD CONSTRAINT "notifications_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- Database-only business rules that Prisma cannot express.
CREATE UNIQUE INDEX "task_reviewer_assignments_one_current_per_task"
ON "public"."task_reviewer_assignments"("task_id")
WHERE "is_current" = true;

ALTER TABLE "public"."code_review_forms"
ADD CONSTRAINT "code_review_forms_review_rank_check"
CHECK ("review_rank" IS NULL OR "review_rank" BETWEEN 1 AND 3);

ALTER TABLE "public"."code_review_answers"
ADD CONSTRAINT "code_review_answers_detailed_findings_check"
CHECK ("answer" NOT IN ('PARTIALLY_OK', 'NOT_OK') OR NULLIF(BTRIM("detailed_findings"), '') IS NOT NULL);

ALTER TABLE "public"."developer_finding_responses"
ADD CONSTRAINT "developer_finding_responses_rejection_reason_check"
CHECK ("decision" <> 'REJECTED' OR NULLIF(BTRIM("rejection_reason"), '') IS NOT NULL);


