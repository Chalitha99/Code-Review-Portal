# Review assignment rules

Who holds a review task at each point, and what an admin may change. The rules
are enforced by NestJS (`apps/api`); the MSW test double mirrors them so the web
tests describe the same behaviour. Decision record: [ADR 0015](adr/0015-resubmission-returns-to-the-requesting-reviewer.md).

> **Assumption recorded for confirmation.** The rule that a reviewer with
> pending work cannot be deactivated (section 4) was stated by the product
> owner as an assumption on 2026-10-08. Confirm or correct it here before it is
> treated as final.

## 1. First submission goes to the pool

A developer submits a Draft. It becomes **Submitted** with no reviewer, and any
eligible reviewer (active, holds Reviewer, not the task's developer) can pick it
from **Available Tasks**. Picking it makes it **InReview** for that reviewer.
An admin may also assign it directly.

## 2. A resubmission goes back to the reviewer who requested changes

When a reviewer requests changes, the task becomes **ChangesRequested** and its
`currentReviewerId` is cleared while the developer works.

When the developer resubmits, the task does **not** return to the pool. It goes
straight to its **follow-up reviewer** as **InReview**, appears only in that
reviewer's **Assigned** list, and only that reviewer is notified
(`TaskResubmitted`). Other reviewers never see it in Available Tasks.

The follow-up reviewer is:

1. the reviewer an admin chose for this task (section 3), if any; otherwise
2. the reviewer who made the latest Request Changes decision.

Status history records `ReSubmitted → InReview` with the remark "Task returned
to the reviewer who requested changes".

Code: `ReviewTasksService.submit` (`apps/api/src/modules/review-tasks/review-tasks.service.ts`).

## 3. An admin can change the follow-up reviewer

While a task is **ChangesRequested**, an admin can choose who receives it on
resubmission: Admin → Tasks → the reviewer action on the row → **Change
follow-up reviewer**.

- `POST /api/tasks/:id/resubmission-reviewer` `{ reviewerId, reason }`
- The reason is required. The new reviewer must be an active Reviewer and not
  the developer.
- Recorded: status-history remark ("Follow-up reviewer changed from X to Y:
  reason"), audit `RESUBMISSION_REVIEWER_CHANGED` (old and new reviewer names),
  and a notification to the new reviewer.
- The choice is used once: it is cleared when the developer resubmits.

## 4. A reviewer with pending work cannot be removed

A reviewer's **pending review work** is:

| Kind                   | Meaning                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------- |
| `InReview`             | A task they currently hold.                                                            |
| `AwaitingResubmission` | A ChangesRequested task that will come back to them (they are its follow-up reviewer). |
| `Handover`             | A pending handover addressed to them.                                                  |

While any exists, an admin **cannot**:

- deactivate them (`PATCH /api/users/:id { isActive: false }`),
- delete them (`DELETE /api/users/:id`), or
- remove their Reviewer role (`PUT /api/users/:id/roles`, `DELETE /api/users/:id/roles/:roleId`).

The API answers **409 `REVIEWER_HAS_PENDING_TASKS`** with
`details.tasks: [{ id, taskCode, title, status, kind }]`. The Users tab keeps
the dialog open, shows "{name} still has N pending review task(s)…", and links
each task.

**Every refused attempt is audited**, even though the change itself is rolled
back: `REVIEWER_DEACTIVATION_BLOCKED`, `REVIEWER_DELETE_BLOCKED` or
`REVIEWER_ROLE_REMOVAL_BLOCKED`, with the actor, the reviewer, the pending task
ids and codes, and the reason the admin entered. They appear in the Activity
Log.

**To clear the work first:**

| Kind                   | How                                                                                       |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| `InReview`             | The reviewer hands it over, or an admin reassigns it (Admin → Tasks → Reassign reviewer). |
| `AwaitingResubmission` | An admin changes the follow-up reviewer (section 3).                                      |
| `Handover`             | An admin reassigns it or returns it to the queue (Admin → Handovers).                     |

Code: `ReviewerWorkloadService` (`apps/api/src/modules/reviewer-workload/`).

## 5. Safety net: the pool fallback

Section 4 should make this unreachable. If the follow-up reviewer is
nevertheless ineligible when the developer resubmits (changed directly in the
database, or a race), the resubmission does **not** fail. Instead:

- the task stays **ReSubmitted** with no reviewer, so any reviewer can pick it
  from the pool;
- status history: "Original reviewer {name} unavailable; returned to the review
  pool";
- audit `RESUBMISSION_REVIEWER_UNAVAILABLE` with `previousReviewerId` and
  `previousReviewerName`;
- every active Admin and Super Admin is notified.

## 6. History is never lost

On every route above, earlier reviewers' names, review rounds and review forms
stay on the task. They show in the task's history (`GET /api/tasks/:id/events`,
`GET /api/tasks/:id/reviews`), in status history, and in the Activity Log.

## Error codes

| Code                         | Status | When                                                                                |
| ---------------------------- | ------ | ----------------------------------------------------------------------------------- |
| `REVIEWER_HAS_PENDING_TASKS` | 409    | Removing a reviewer who still has pending work (`details.tasks`).                   |
| `REASON_REQUIRED`            | 422    | Changing the follow-up reviewer, or reassigning an InReview task, without a reason. |
| `INVALID_STATE`              | 422    | Changing the follow-up reviewer of a task that is not ChangesRequested.             |
| `INVALID_REVIEWER`           | 422    | The chosen reviewer is inactive or not a Reviewer.                                  |
| `SELF_REVIEW`                | 422    | The chosen reviewer is the task's developer.                                        |
| `SAME_REVIEWER`              | 422    | The chosen reviewer already receives the task.                                      |
| `CHANGES_REQUESTED_ACTIVE`   | 422    | Using Assign on a ChangesRequested task (use Change follow-up reviewer instead).    |
