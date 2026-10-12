# ADR 0015 — A resubmission returns to the requesting reviewer; pending reviews block reviewer removal

- **Status:** Proposed (assumption awaiting product confirmation)
- **Date:** 2026-10-08

## Context

Originally, a task the developer resubmitted after Request Changes went back to
the open review pool, and any reviewer could pick it up. The requirement changed:
the reviewer who asked for the changes is the one who knows what to check, so the
resubmission should go straight back to them.

Implementing that exposed a gap. While a task waits for the developer
(ChangesRequested), no reviewer "holds" it — `currentReviewerId` is null. Nothing
stopped an admin from deactivating that reviewer, and then the developer's
resubmission had nowhere valid to go: the API answered 409 and the task was
stuck, since an admin could not assign a ChangesRequested task either.

## Alternatives considered

**Fall back to the pool whenever the requesting reviewer is unavailable.** Never
stuck, but silently loses the routing rule in exactly the case where an admin
made a deliberate change, and nobody is told.

**Let admins reassign the task to anyone at resubmission time.** Moves the
problem to the moment the developer is waiting, rather than preventing it.

## Decision

1. A resubmission goes to the task's **follow-up reviewer**: the one an admin
   chose, otherwise the reviewer of the latest Request Changes decision.
2. An admin can change the follow-up reviewer while the task is
   ChangesRequested, with a reason (`POST /tasks/:id/resubmission-reviewer`).
3. A reviewer who still has pending review work (InReview, awaiting
   resubmission, or a pending handover) **cannot be deactivated, deleted or lose
   the Reviewer role** (409 `REVIEWER_HAS_PENDING_TASKS`). Each refused attempt is
   audited. The admin transfers the work first.
4. As a safety net only, an ineligible follow-up reviewer at resubmission time
   sends the task to the pool, with the previous reviewer kept in history and
   the audit log, and the admins notified.

Rule 3 was stated by the product owner as an assumption. It is recorded in
`docs/25-review-assignment-rules.md` for the team to confirm or correct.

## Consequences

- Deactivating a reviewer becomes a two-step operation when they have open
  work, and the Users tab says exactly which tasks to move.
- `tasks.resubmission_reviewer_id` (nullable, additive migration) holds the
  admin's choice and is cleared on resubmit.
- The pool fallback should never run in normal operation. If its audit action
  (`RESUBMISSION_REVIEWER_UNAVAILABLE`) appears in the Activity Log, something
  bypassed rule 3.
