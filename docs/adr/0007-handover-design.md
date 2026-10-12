# 0007 · Handover holds a task out of the queue; the review cycle is untouched

**Status:** **Provisional** — designed by us, pending business review · **Date:** Phase 1, checkpoint 5

## Context

The specification defines handover in one paragraph (§1.5, p.12): a reviewer who cannot finish
hands the task back to the admin pool, and the admin reassigns it.

That is all there is. **There is no Figma screen, no development-spec section, and no Handover
button anywhere in the 26 wireframes** — screen 12's action bar has Approve and Request Changes
and nothing else. Every decision below is ours (plan §1.3, risk R7).

## Decision

**Reviewer side.** A Hand Over button in the Review page action bar, shown only when
`canDecideReview` passes, opening a confirmation with a **mandatory** reason.

**What handing over does:**

- clears `reviewerId`;
- returns the task to `Submitted`, or `ReSubmitted` if it has been round before;
- sets `isHandedOver = true`;
- raises a `Pending` handover row and a `HandedOver` task event carrying the reason.

**What it deliberately does not do:** touch `reviewCycle`.

**Admin side.** A Handovers tab with two actions, not one: **Reassign** to a named reviewer, or
**Return to queue** when the right answer is "anyone may take this". Resolved rows stay listed as
history.

## The three decisions that carry weight

**1. A handed-over task leaves the open Available queue.** `isHandedOver` — a flag that had
existed unused since Sprint 0 — is what excludes it. The alternative was to drop it straight back
into the open pool, which is friendlier when the admin is slow, but then two people can claim one
task: a reviewer could pick the very task the admin is reassigning, and the handover queue would
list work already taken. The specification says "the admin pool", so waiting for the admin is the
specified behaviour; **Return to queue** exists so the admin can choose the friendlier outcome
explicitly.

**2. The review cycle does not increment.** A cycle counts a _completed_ review round (spec p.10);
handing over is the absence of one. Incrementing here would inflate every cycle metric in Reports
whenever a reviewer went on leave — the numbers would silently punish the team for a staffing
event.

**3. The reason is mandatory.** It is the only thing the admin has to decide who picks the task up
next. An optional field would reliably arrive empty and the queue would become a list of tasks with
no explanation of why any of them are in it.

Two exclusions on reassignment, both re-checked server-side: the reviewer who handed it over
(handing it straight back defeats the purpose) and the developer who raised it (the self-review
bar holds on every path).

## Consequences

**Good.** Reuses the Admin Tasks shell, `ConfirmDialog` and `AssignReviewerDialog`'s shape, so it
reads as part of the same product rather than something bolted on. Rework is contained if the
design is rejected.

**The cost, stated honestly.** This is the largest piece of unspecified behaviour in Phase 1, and
the tests are currently the specification. If the business wants handover to leave tasks in the
open pool, or to count as a cycle, those are small code changes — but they are changes to
behaviour that people will have already been trained on.

**Review before Phase 2.** Specifically: the queue-holding rule, the cycle rule, and whether
"Return to queue" is wanted at all.
