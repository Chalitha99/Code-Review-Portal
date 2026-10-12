# 0010 · Restoring deleted records is a Phase 2 persistence decision

**Status:** Accepted · **Date:** Phase 1, Analytics rebuild · **Extends:** [0006](0006-administered-checklist.md)

## Context

The business asked for "a reliable way to restore accidentally deleted records", and asked
explicitly whether it should be built now or when the NestJS backend arrives — with the instruction
not to build a temporary frontend-only solution that the eventual database design would have to
unwind.

Two facts decide this.

**First, most of the requirement is already met.** [ADR-0006](0006-administered-checklist.md) §4
established that deletion is guarded and retirement is the norm. Every administered entity carries
`isActive`; retiring is a `PATCH { isActive: false }` and the admin grid keeps retired rows listed
precisely so they can be switched back on. Hard `DELETE` exists but refuses anything referenced:

| Entity             | Refusal                                                              |
| ------------------ | -------------------------------------------------------------------- |
| Checklist question | `409 QUESTION_IN_USE` — any stored answer references it              |
| Checklist category | `409 CATEGORY_NOT_EMPTY`                                             |
| Task type          | `409 TASK_TYPE_IN_USE` — a task carries it, or a question targets it |
| User               | `409 USER_IN_USE`, plus `422 SELF_DELETE`                            |
| Customer           | `409 CUSTOMER_IN_USE`                                                |
| Task               | Draft and Cancelled only, via `canDeleteTask`                        |

So the destructive, unrecoverable path is already narrow: rows nobody has used, plus the cascading
task delete, which also removes that task's checklists, reviews, issue responses, attachments and
events.

**Second, `CodeReviewPortal/Backend/` does not exist.** It is Phase 2 (frontend-standards §1). The
only place a `deletedAt` could live today is the in-memory MSW store, which §1 also says is _deleted
wholesale in Phase 2_ — and which does not survive a browser refresh.

## Decision

**1. Do not implement restore in Phase 1.** Building a Deleted-items view over the mock store would
produce a screen whose behaviour is a property of a module scheduled for deletion, and would commit
the UI to a shape the real schema has not agreed to. That is the conflict the business asked us to
avoid.

**2. Specify the Phase 2 contract now, here**, so the backend is built with it rather than retrofitted:

- **`deletedAt: timestamptz | null` and `deletedBy: userId | null`** on every administered entity and
  on tasks. Nullable timestamp rather than a boolean — "when" and "who" are the two questions asked
  about an accidental deletion, and a boolean answers neither.
- **A global query filter excluding soft-deleted rows**, applied at the repository layer, not per
  endpoint. A filter that each query opts into is a filter one query will forget.
- **`POST /:entity/:id/restore`**, behind the same admin guard as `DELETE`. Restore is as privileged
  as deletion.
- **Restore re-validates referential integrity** rather than blindly clearing the flag. A customer
  soft-deleted while its code was reused, or a question whose category has since been removed, must
  fail loudly instead of resurrecting a row that breaks an invariant.
- **A retention window** after which a soft-deleted row is genuinely purged, so the tables do not
  grow without bound and so "deleted" eventually means deleted.
- **The task cascade becomes a soft cascade** — children are stamped with the parent's `deletedAt`
  and restored with it, in one transaction. This is the case that most needs the decision made in
  advance, because a hard cascade cannot be undone at all.
- **`isActive` and `deletedAt` stay separate concepts.** Retired means "do not offer this on new
  work, but it is still part of the record"; deleted means "this should not have existed". Collapsing
  them would make retiring a question look like an accident.

**3. The schemas in `packages/types` are where this lands.** They validate mock responses today and
become the NestJS request validators in Phase 2 (§3, §25), so the columns and the restore endpoint
arrive together, once.

## Alternatives considered

- **A client-side undo buffer** — a toast with Undo that re-POSTs the deleted record. Rejected: it
  restores a _reconstruction_, not the row. The new record gets a new id, and every reference from
  reviews, checklists and events still points at the id that is gone. It also only helps the person
  who made the mistake, in the seconds before they navigate away — which is not what "accidentally
  deleted" usually means.
- **`deletedAt` in the MSW store now, with a Deleted-items admin view.** Rejected on the business's
  own instruction. It would be a screen built over a store that is deleted wholesale in Phase 2, and
  it would not survive a refresh, which makes it a demonstration rather than a safeguard.
- **Widen the existing `isActive` flag to cover deletion.** Rejected — see decision 3 above.
- **Do nothing at all and rely on the 409 guards.** Rejected, but closer to adequate than it sounds:
  the guards already cover the referenced rows, which is most of them. The gap is real but narrow.

## Consequences

**Good.** No throwaway code. The frontend is unchanged, so nothing has to be unwound. The Phase 2
team inherits a specification rather than a shim, and the schema-first pipeline means writing it in
`packages/types` is the same act as writing it for NestJS.

**The cost.**

- **Between now and Phase 2 there is no restore.** An admin who hard-deletes an unreferenced
  question loses it, and the answer is "type it again". That is accepted deliberately, on the
  evidence that the destructive path is already narrow — but it IS a gap, and it is open for as long
  as Phase 2 takes.
- **The gap is widest on the task cascade**, which is the one delete that destroys child records.
  Worth revisiting on its own if Phase 2 slips.
- **A specification with no implementation drifts.** If the schema changes shape before the backend
  is built, this record has to be updated with it — nothing enforces it the way a test would.
