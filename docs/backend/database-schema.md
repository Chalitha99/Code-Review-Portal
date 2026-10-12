# Code Review Portal - Final Database Schema (Prisma ORM)

This document is the source of truth for generating the NestJS + Prisma database layer for the Code Review Portal.

## Technology

- Backend: NestJS
- ORM: Prisma
- Database: PostgreSQL
- Authentication: Microsoft Entra ID
- Prisma migrations: `prisma migrate`
- Database naming: `snake_case`
- Prisma model naming: PascalCase
- Primary keys: UUID unless otherwise specified

> Microsoft Entra ID handles authentication. Do not create password, password hash, password reset token, or local authentication columns.

---

# Final Table Names

1. `users`
2. `roles`
3. `user_roles`
4. `customers`
5. `task_types`
6. `tasks`
7. `task_task_types`
8. `task_reviewer_assignments`
9. `task_status_history`
10. `checklist_sections`
11. `checklist_questions`
12. `checklist_question_task_types`
13. `developer_checklists`
14. `checklist_answers`
15. `code_review_questions`
16. `code_review_forms`
17. `code_review_answers`
18. `review_findings`
19. `finding_screenshots`
20. `developer_finding_responses`
21. `handover_tasks`
22. `notifications`
23. `audit_logs`

---

# 1. users

Stores all application users.

| Column | PostgreSQL Type | Rules |
|---|---|---|
| `id` | `uuid` | PK, default UUID |
| `entra_object_id` | `varchar(100)` | UNIQUE, nullable until linked |
| `email` | `varchar(255)` | UNIQUE, NOT NULL |
| `full_name` | `varchar(255)` | NOT NULL |
| `status` | `varchar(20)` | NOT NULL, default `ACTIVE` |
| `last_login_at` | `timestamptz` | NULL |
| `created_at` | `timestamptz` | NOT NULL, default now |
| `updated_at` | `timestamptz` | NOT NULL, automatically updated |

Suggested enum:
- `ACTIVE`
- `INACTIVE`

---

# 2. roles

Stores portal roles.

| Column | PostgreSQL Type | Rules |
|---|---|---|
| `id` | `smallserial` | PK, auto increment |
| `code` | `varchar(30)` | UNIQUE, NOT NULL |
| `name` | `varchar(100)` | NOT NULL |
| `description` | `text` | NULL |

Seed values:
- `DEVELOPER`
- `REVIEWER`
- `ADMIN`

---

# 3. user_roles

Junction table between users and roles.

| Column | PostgreSQL Type | Rules |
|---|---|---|
| `user_id` | `uuid` | PK, FK -> `users.id` |
| `role_id` | `smallint` | PK, FK -> `roles.id` |
| `granted_by` | `uuid` | FK -> `users.id`, NULL |
| `granted_at` | `timestamptz` | NOT NULL, default now |

Composite PK:
- (`user_id`, `role_id`)

---

# 4. customers

Stores customer master data.

| Column | PostgreSQL Type | Rules |
|---|---|---|
| `id` | `uuid` | PK |
| `code` | `varchar(50)` | UNIQUE, NOT NULL |
| `name` | `varchar(255)` | UNIQUE, NOT NULL |
| `description` | `text` | NULL |
| `color` | `varchar(20)` | NULL |
| `status` | `varchar(20)` | NOT NULL, default `ACTIVE` |
| `created_by` | `uuid` | FK -> `users.id`, NULL |
| `created_at` | `timestamptz` | NOT NULL, default now |
| `updated_at` | `timestamptz` | NOT NULL, auto update |

---

# 5. task_types

Stores supported development task types.

| Column | PostgreSQL Type | Rules |
|---|---|---|
| `id` | `smallserial` | PK |
| `code` | `varchar(50)` | UNIQUE, NOT NULL |
| `name` | `varchar(100)` | NOT NULL |
| `description` | `text` | NULL |
| `is_active` | `boolean` | NOT NULL, default true |

Possible values:
- `CUSTOMIZATION`
- `CONFIGURATION`
- `LOBBY`
- `QUICK_REPORT`
- `UPGRADE_SERVICE`

---

# 6. tasks

Main business table.

| Column | PostgreSQL Type | Rules |
|---|---|---|
| `id` | `uuid` | PK |
| `task_code` | `varchar(100)` | UNIQUE, NOT NULL |
| `customer_sequence_no` | `integer` | NOT NULL |
| `title` | `varchar(500)` | NOT NULL |
| `crim_id` | `varchar(100)` | NOT NULL |
| `version` | `varchar(100)` | NULL |
| `priority` | `varchar(20)` | NOT NULL |
| `status` | `varchar(30)` | NOT NULL |
| `current_review_cycle` | `integer` | NOT NULL, default 0 |
| `checklist_completed` | `boolean` | NOT NULL, default false |
| `developer_id` | `uuid` | FK -> `users.id`, NOT NULL |
| `current_reviewer_id` | `uuid` | FK -> `users.id`, NULL |
| `customer_id` | `uuid` | FK -> `customers.id`, NOT NULL |
| `created_at` | `timestamptz` | NOT NULL, default now |
| `updated_at` | `timestamptz` | NOT NULL, auto update |
| `submitted_at` | `timestamptz` | NULL |
| `approved_at` | `timestamptz` | NULL |
| `delivered_at` | `timestamptz` | NULL |
| `cancelled_at` | `timestamptz` | NULL |

Priority enum:
- `LOW`
- `MEDIUM`
- `HIGH`

Task status enum:
- `DRAFT`
- `SUBMITTED`
- `IN_REVIEW`
- `CHANGES_REQUESTED`
- `RESUBMITTED`
- `APPROVED`
- `DELIVERED`
- `CANCELLED`

Constraints:
- UNIQUE (`customer_id`, `customer_sequence_no`)

Indexes:
- `task_code`
- `crim_id`
- `customer_id`
- `developer_id`
- `current_reviewer_id`
- `status`
- `priority`

---

# 7. task_task_types

Many-to-many mapping between tasks and task types.

| Column | PostgreSQL Type | Rules |
|---|---|---|
| `task_id` | `uuid` | PK, FK -> `tasks.id` |
| `task_type_id` | `smallint` | PK, FK -> `task_types.id` |

Composite PK:
- (`task_id`, `task_type_id`)

---

# 8. task_reviewer_assignments

Stores reviewer assignment history.

| Column | PostgreSQL Type | Rules |
|---|---|---|
| `id` | `uuid` | PK |
| `task_id` | `uuid` | FK -> `tasks.id`, NOT NULL |
| `reviewer_id` | `uuid` | FK -> `users.id`, NOT NULL |
| `assigned_by` | `uuid` | FK -> `users.id`, NULL |
| `assignment_type` | `varchar(30)` | NOT NULL |
| `assigned_at` | `timestamptz` | NOT NULL, default now |
| `unassigned_at` | `timestamptz` | NULL |
| `is_current` | `boolean` | NOT NULL, default true |

Assignment type enum:
- `SELF_PICKED`
- `ADMIN_ASSIGNED`
- `ADMIN_REASSIGNED`
- `HANDOVER_REASSIGNED`

Important:
- Only one current reviewer assignment should exist per task.
- Prisma schema does not directly express every PostgreSQL partial unique index. If needed, create the partial unique index using a custom SQL migration.

---

# 9. task_status_history

Stores task workflow status history.

| Column | PostgreSQL Type | Rules |
|---|---|---|
| `id` | `uuid` | PK |
| `task_id` | `uuid` | FK -> `tasks.id`, NOT NULL |
| `old_status` | `varchar(30)` | NULL |
| `new_status` | `varchar(30)` | NOT NULL |
| `changed_by` | `uuid` | FK -> `users.id`, NULL |
| `review_form_id` | `uuid` | FK -> `code_review_forms.id`, NULL |
| `remarks` | `text` | NULL |
| `changed_at` | `timestamptz` | NOT NULL, default now |

---

# 10. checklist_sections

Stores Developer Checklist sections.

| Column | PostgreSQL Type | Rules |
|---|---|---|
| `id` | `uuid` | PK |
| `name` | `varchar(255)` | NOT NULL |
| `display_order` | `integer` | NOT NULL, default 0 |
| `is_active` | `boolean` | NOT NULL, default true |

---

# 11. checklist_questions

Stores Developer Checklist questions.

| Column | PostgreSQL Type | Rules |
|---|---|---|
| `id` | `uuid` | PK |
| `section_id` | `uuid` | FK -> `checklist_sections.id`, NOT NULL |
| `question_text` | `text` | NOT NULL |
| `display_order` | `integer` | NOT NULL, default 0 |
| `is_active` | `boolean` | NOT NULL, default true |
| `created_at` | `timestamptz` | NOT NULL, default now |
| `updated_at` | `timestamptz` | NOT NULL, auto update |

---

# 12. checklist_question_task_types

Maps checklist questions to task types.

| Column | PostgreSQL Type | Rules |
|---|---|---|
| `question_id` | `uuid` | PK, FK -> `checklist_questions.id` |
| `task_type_id` | `smallint` | PK, FK -> `task_types.id` |

Composite PK:
- (`question_id`, `task_type_id`)

---

# 13. developer_checklists

Stores one Developer Checklist per task.

| Column | PostgreSQL Type | Rules |
|---|---|---|
| `id` | `uuid` | PK |
| `task_id` | `uuid` | UNIQUE, FK -> `tasks.id`, NOT NULL |
| `developer_id` | `uuid` | FK -> `users.id`, NOT NULL |
| `additional_remarks` | `text` | NULL |
| `status` | `varchar(20)` | NOT NULL, default `DRAFT` |
| `checked_date` | `date` | NULL |
| `completed_at` | `timestamptz` | NULL |
| `created_at` | `timestamptz` | NOT NULL, default now |
| `updated_at` | `timestamptz` | NOT NULL, auto update |

Status enum:
- `DRAFT`
- `COMPLETED`

---

# 14. checklist_answers

Stores Developer Checklist answers.

| Column | PostgreSQL Type | Rules |
|---|---|---|
| `id` | `uuid` | PK |
| `checklist_id` | `uuid` | FK -> `developer_checklists.id`, NOT NULL |
| `question_id` | `uuid` | FK -> `checklist_questions.id`, NOT NULL |
| `answer` | `varchar(10)` | NOT NULL |
| `created_at` | `timestamptz` | NOT NULL, default now |
| `updated_at` | `timestamptz` | NOT NULL, auto update |

Answer enum:
- `YES`
- `NO`
- `NA`

Constraint:
- UNIQUE (`checklist_id`, `question_id`)

---

# 15. code_review_questions

Stores reviewer-side Code Review questions.

| Column | PostgreSQL Type | Rules |
|---|---|---|
| `id` | `uuid` | PK |
| `section_name` | `varchar(255)` | NULL |
| `question_text` | `text` | NOT NULL |
| `display_order` | `integer` | NOT NULL, default 0 |
| `is_active` | `boolean` | NOT NULL, default true |

---

# 16. code_review_forms

Represents one review cycle.

| Column | PostgreSQL Type | Rules |
|---|---|---|
| `id` | `uuid` | PK |
| `task_id` | `uuid` | FK -> `tasks.id`, NOT NULL |
| `reviewer_id` | `uuid` | FK -> `users.id`, NOT NULL |
| `review_cycle_number` | `integer` | NOT NULL |
| `review_rank` | `smallint` | NULL; expected 1, 2, or 3 |
| `review_comment` | `text` | NULL |
| `other_remarks` | `text` | NULL |
| `feedback_summary` | `text` | NULL |
| `status` | `varchar(30)` | NOT NULL |
| `decision` | `varchar(30)` | NULL |
| `created_at` | `timestamptz` | NOT NULL, default now |
| `completed_at` | `timestamptz` | NULL |

Constraint:
- UNIQUE (`task_id`, `review_cycle_number`)

Form status enum:
- `DRAFT`
- `IN_PROGRESS`
- `COMPLETED`

Decision enum:
- `APPROVED`
- `CHANGES_REQUESTED`

Review rank:
- `1` = clean / approvable
- `2` = minor issues
- `3` = serious issues

---

# 17. code_review_answers

Stores reviewer answers for Code Review questions.

| Column | PostgreSQL Type | Rules |
|---|---|---|
| `id` | `uuid` | PK |
| `review_form_id` | `uuid` | FK -> `code_review_forms.id`, NOT NULL |
| `question_id` | `uuid` | FK -> `code_review_questions.id`, NOT NULL |
| `answer` | `varchar(20)` | NOT NULL |
| `detailed_findings` | `text` | NULL |
| `created_at` | `timestamptz` | NOT NULL, default now |
| `updated_at` | `timestamptz` | NOT NULL, auto update |

Answer enum:
- `OK`
- `PARTIALLY_OK`
- `NOT_OK`
- `NA`

Constraint:
- UNIQUE (`review_form_id`, `question_id`)

Business rule:
- `detailed_findings` is mandatory when answer is `PARTIALLY_OK` or `NOT_OK`.

---

# 18. review_findings

Stores individual reviewer findings.

| Column | PostgreSQL Type | Rules |
|---|---|---|
| `id` | `uuid` | PK |
| `review_form_id` | `uuid` | FK -> `code_review_forms.id`, NOT NULL |
| `finding_no` | `integer` | NOT NULL |
| `comment_text` | `text` | NOT NULL |
| `status` | `varchar(20)` | NOT NULL, default `OPEN` |
| `created_by` | `uuid` | FK -> `users.id`, NOT NULL |
| `created_at` | `timestamptz` | NOT NULL, default now |
| `updated_at` | `timestamptz` | NOT NULL, auto update |

Finding status enum:
- `OPEN`
- `RESOLVED`
- `REJECTED`
- `CLOSED`

Constraint:
- UNIQUE (`review_form_id`, `finding_no`)

---

# 19. finding_screenshots

Stores screenshot metadata for review findings.

The actual image should be stored in object storage. Do not store binary image data directly in PostgreSQL.

| Column | PostgreSQL Type | Rules |
|---|---|---|
| `id` | `uuid` | PK |
| `finding_id` | `uuid` | FK -> `review_findings.id`, NOT NULL |
| `file_name` | `varchar(255)` | NOT NULL |
| `storage_key` | `text` | NOT NULL |
| `file_url` | `text` | NULL |
| `mime_type` | `varchar(100)` | NOT NULL |
| `file_size` | `bigint` | NOT NULL |
| `annotation_text` | `text` | NULL |
| `uploaded_by` | `uuid` | FK -> `users.id`, NOT NULL |
| `uploaded_at` | `timestamptz` | NOT NULL, default now |

Validation rules should be handled in NestJS:
- PNG
- JPG/JPEG
- GIF
- WebP
- Maximum 5 MB per screenshot
- Maximum 10 screenshots where required

---

# 20. developer_finding_responses

Stores Developer responses and Reviewer follow-up decisions.

| Column | PostgreSQL Type | Rules |
|---|---|---|
| `id` | `uuid` | PK |
| `finding_id` | `uuid` | FK -> `review_findings.id`, NOT NULL |
| `developer_id` | `uuid` | FK -> `users.id`, NOT NULL |
| `decision` | `varchar(20)` | NOT NULL |
| `rejection_reason` | `text` | NULL |
| `developer_comment` | `text` | NULL |
| `responded_at` | `timestamptz` | NOT NULL, default now |
| `reviewer_decision` | `varchar(20)` | NOT NULL, default `PENDING` |
| `reviewer_comment` | `text` | NULL |
| `reviewed_by` | `uuid` | FK -> `users.id`, NULL |
| `reviewed_at` | `timestamptz` | NULL |

Developer decision enum:
- `RESOLVED`
- `REJECTED`

Reviewer decision enum:
- `PENDING`
- `ACCEPTED`
- `REJECTED`

Business rule:
- `rejection_reason` is mandatory if developer decision is `REJECTED`.

---

# 21. handover_tasks

Stores reviewer handover requests and reassignments.

| Column | PostgreSQL Type | Rules |
|---|---|---|
| `id` | `uuid` | PK |
| `task_id` | `uuid` | FK -> `tasks.id`, NOT NULL |
| `from_reviewer_id` | `uuid` | FK -> `users.id`, NOT NULL |
| `to_reviewer_id` | `uuid` | FK -> `users.id`, NULL |
| `reason` | `text` | NULL |
| `status` | `varchar(20)` | NOT NULL |
| `requested_at` | `timestamptz` | NOT NULL, default now |
| `reassigned_by` | `uuid` | FK -> `users.id`, NULL |
| `reassigned_at` | `timestamptz` | NULL |

Handover status enum:
- `PENDING`
- `REASSIGNED`
- `CANCELLED`

---

# 22. notifications

Stores portal and email notification information.

| Column | PostgreSQL Type | Rules |
|---|---|---|
| `id` | `uuid` | PK |
| `task_id` | `uuid` | FK -> `tasks.id`, NULL |
| `recipient_id` | `uuid` | FK -> `users.id`, NOT NULL |
| `notification_type` | `varchar(50)` | NOT NULL |
| `title` | `varchar(255)` | NOT NULL |
| `message` | `text` | NOT NULL |
| `is_read` | `boolean` | NOT NULL, default false |
| `read_at` | `timestamptz` | NULL |
| `email_sent` | `boolean` | NOT NULL, default false |
| `email_sent_at` | `timestamptz` | NULL |
| `created_at` | `timestamptz` | NOT NULL, default now |

Notification type enum:
- `TASK_SUBMITTED`
- `TASK_ASSIGNED`
- `CHANGES_REQUESTED`
- `TASK_RESUBMITTED`
- `TASK_APPROVED`
- `TASK_HANDOVER`
- `TASK_CANCELLED`
- `TASK_DELIVERED`

---

# 23. audit_logs

Stores important application audit events.

| Column | PostgreSQL Type | Rules |
|---|---|---|
| `id` | `uuid` | PK |
| `user_id` | `uuid` | FK -> `users.id`, NULL |
| `action` | `varchar(100)` | NOT NULL |
| `entity_type` | `varchar(100)` | NOT NULL |
| `entity_id` | `uuid` | NULL |
| `old_values` | `jsonb` | NULL |
| `new_values` | `jsonb` | NULL |
| `ip_address` | `inet` | NULL |
| `created_at` | `timestamptz` | NOT NULL, default now |

Possible action values:
- `USER_CREATED`
- `USER_ROLE_CHANGED`
- `USER_DEACTIVATED`
- `CUSTOMER_CREATED`
- `CUSTOMER_UPDATED`
- `TASK_CREATED`
- `TASK_CANCELLED`
- `REVIEWER_ASSIGNED`
- `REVIEWER_REASSIGNED`
- `REVIEW_COMPLETED`
- `TASK_APPROVED`

---

# Prisma Model Naming

Use these Prisma model names and map them to the existing snake_case PostgreSQL table names:

| Prisma Model | Database Table |
|---|---|
| `User` | `users` |
| `Role` | `roles` |
| `UserRole` | `user_roles` |
| `Customer` | `customers` |
| `TaskType` | `task_types` |
| `Task` | `tasks` |
| `TaskTaskType` | `task_task_types` |
| `TaskReviewerAssignment` | `task_reviewer_assignments` |
| `TaskStatusHistory` | `task_status_history` |
| `ChecklistSection` | `checklist_sections` |
| `ChecklistQuestion` | `checklist_questions` |
| `ChecklistQuestionTaskType` | `checklist_question_task_types` |
| `DeveloperChecklist` | `developer_checklists` |
| `ChecklistAnswer` | `checklist_answers` |
| `CodeReviewQuestion` | `code_review_questions` |
| `CodeReviewForm` | `code_review_forms` |
| `CodeReviewAnswer` | `code_review_answers` |
| `ReviewFinding` | `review_findings` |
| `FindingScreenshot` | `finding_screenshots` |
| `DeveloperFindingResponse` | `developer_finding_responses` |
| `HandoverTask` | `handover_tasks` |
| `Notification` | `notifications` |
| `AuditLog` | `audit_logs` |

Use `@@map("table_name")` for table names and `@map("column_name")` where Prisma field names use camelCase.

---

# Prisma Implementation Rules

1. Use Prisma ORM, not TypeORM.

2. Use PostgreSQL datasource:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

3. Use UUID IDs like:

```prisma
id String @id @default(uuid()) @db.Uuid
```

4. Use timestamps like:

```prisma
createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)
```

5. Use PostgreSQL JSONB for audit values:

```prisma
oldValues Json? @map("old_values") @db.JsonB
newValues Json? @map("new_values") @db.JsonB
```

6. Define explicit relation names where multiple foreign keys point to `User`.

Example:

```prisma
developer User  @relation("TaskDeveloper", fields: [developerId], references: [id])
currentReviewer User? @relation("TaskCurrentReviewer", fields: [currentReviewerId], references: [id])
```

7. Use explicit junction models for:
- `UserRole`
- `TaskTaskType`
- `ChecklistQuestionTaskType`

8. Use compound IDs:

```prisma
@@id([userId, roleId])
```

or:

```prisma
@@id([taskId, taskTypeId])
```

9. Use `@@unique` for business constraints such as:

```prisma
@@unique([customerId, customerSequenceNo])
```

10. Add indexes using `@@index`.

11. Use Prisma enums for stable workflow values.

12. Do not enable TypeORM or create TypeORM entities.

13. Do not use `synchronize: true`; Prisma manages schema changes through migrations.

14. Migration workflow:

```bash
npx prisma format
npx prisma validate
npx prisma migrate dev --name init
npx prisma generate
```

15. Production migration:

```bash
npx prisma migrate deploy
```

16. Create a NestJS `PrismaModule` and `PrismaService`.

17. Services should inject `PrismaService` rather than repositories.

18. Do not expose Prisma models directly as API request DTOs. Create NestJS DTOs separately using `class-validator`.

19. Use transactions for workflow operations that update several records together, especially:
- submitting a task
- reviewer assignment/reassignment
- requesting changes
- resubmitting
- approving
- handover
- delivering a task

20. Do not cascade-delete historical review/audit records unless the business specification explicitly requires it.

---

# Important Prisma Relation Notes

Because many tables reference `users` more than once, relation names must be explicit.

Examples include:

- `tasks.developer_id`
- `tasks.current_reviewer_id`
- `user_roles.granted_by`
- `task_reviewer_assignments.reviewer_id`
- `task_reviewer_assignments.assigned_by`
- `task_status_history.changed_by`
- `review_findings.created_by`
- `finding_screenshots.uploaded_by`
- `developer_finding_responses.developer_id`
- `developer_finding_responses.reviewed_by`
- `handover_tasks.from_reviewer_id`
- `handover_tasks.to_reviewer_id`
- `handover_tasks.reassigned_by`

Codex must use unique Prisma `@relation("...")` names for these relationships to avoid ambiguous relation errors.

---

# Recommended Folder Structure

```text
src/
â”œâ”€â”€ prisma/
â”‚   â”œâ”€â”€ prisma.module.ts
â”‚   â””â”€â”€ prisma.service.ts
â”œâ”€â”€ auth/
â”œâ”€â”€ users/
â”œâ”€â”€ roles/
â”œâ”€â”€ customers/
â”œâ”€â”€ tasks/
â”œâ”€â”€ checklists/
â”œâ”€â”€ reviews/
â”œâ”€â”€ handovers/
â”œâ”€â”€ notifications/
â””â”€â”€ audit/

prisma/
â”œâ”€â”€ schema.prisma
â”œâ”€â”€ migrations/
â””â”€â”€ seed.ts

docs/
â””â”€â”€ CODE_REVIEW_PORTAL_DATABASE_SCHEMA_PRISMA.md
```

---

# Codex Prompt

Use this prompt when asking Codex to implement the database:

> Read `docs/CODE_REVIEW_PORTAL_DATABASE_SCHEMA_PRISMA.md` completely and treat it as the database source of truth. This NestJS project uses PostgreSQL with Prisma ORM, not TypeORM. Create `prisma/schema.prisma` containing all 23 models, enums, primary keys, foreign keys, relations, compound IDs, unique constraints, indexes, defaults, mappings, and nullable fields described in the document. Use PascalCase Prisma model names and camelCase Prisma field names, while preserving snake_case PostgreSQL table and column names using `@@map()` and `@map()`. Use explicit relation names whenever multiple relations point to the User model. Then create the NestJS `PrismaModule` and `PrismaService`, a Prisma seed file for roles and fixed master values, and an initial Prisma migration. Do not add TypeORM packages or TypeORM entities. Do not add password fields because authentication uses Microsoft Entra ID. Do not invent, remove, or rename database fields without first explaining why.

