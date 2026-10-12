# 0006 · The checklist is administered data; answers snapshot it

**Status:** Accepted · **Date:** Phase 1, checkpoint 4 · **Decided with:** the business

## Context

The developer quality checklist is 29 questions across 9 categories, rendered according to which
of 5 task types a developer selects. It started as a compile-time constant: `TASK_TYPES` was a
`z.enum`, the questions were a JSON fixture.

The business then asked for it to be maintained by an admin — add, reword, retire questions,
categories and task types, at runtime.

Worth stating plainly: **this is not in the functional specification.** SPL-OPS-FO-001 §2.12–2.19
documents Tasks, Users, Customers, Integrations and Reports and no checklist screen. The only
mention of configurability is the _other_ document's §10 Future Roadmap — "allow checklist
questions/sections to be configured per customer without code changes". The business pulled that
roadmap item into scope. It turns a compile-time constant into runtime data, which is a larger
change than it looks.

## Decision

**1. Task types and categories are rows, not enums.** `TASK_TYPES` and the `TaskType` union left
`@sdp/types`; a task stores task type _ids_. A `z.enum` would have made "add a task type" a code
change and a redeploy, and would have put the display names in `content/*.json` where an admin
cannot reach them.

**2. A question declares its own task types** — `appliesTo: taskTypeId[]` on the question, not on
the category. Unit Testing's four questions and Completion's three are shared verbatim by all five
task types; Configurations' single question by two. Putting `appliesTo` on the category would force
a category to be all-or-nothing per task type, so Unit Testing could never gain a
Customization-only question without being cloned.

**3. Answers snapshot their wording.** `checklistAnswerEntrySchema` carries `questionText`,
`categoryName` and `order`, copied in at save time by the server.

**4. Deletion is guarded; retirement is the norm.** Hard-delete only what was never used —
a question nobody has answered, a category with no questions, a task type no task carries.
Everything else is deactivated.

## Alternatives considered

- **Keep the enum, ship an admin screen later.** Rejected by the business.
- **Category declares its task types.** Rejected — see (2).
- **Duplicate the question per task type.** Turns 29 rows into 58 and makes fixing a typo a
  five-place edit.
- **Answers reference the question by id only.** This is the one that matters. Rejected because
  once an admin can reword or retire a question, a reference-only record would silently rewrite
  what a past reviewer appears to have approved, and a deleted question would make rows vanish
  from a completed review. **This checklist is the quality gate**, so the record has to stay
  faithful to the moment it was signed off.

## Consequences

**Good.** A stored checklist renders on its own with no template join. Admins can maintain the
bank without a deploy. The correct Task Type → Category mapping is now data — and fixing it
closed risk R13: the seed had mapped Reservation, Code, Security and Translations to all five task
types, so a Configuration task showed 24 questions instead of 8.

**The cost.**

- Nothing downstream can switch exhaustively on a task type any more. The set is open. That is
  correct, and it is a real loss of compile-time safety.
- Two representations of the same question now exist — the live template row and the snapshot
  inside every stored answer. They will diverge, by design. Anything reporting on _what was asked_
  must read the snapshot (`lib/storedChecklist.ts` reads only the snapshot, never the template);
  anything offering _what to ask next_ reads the template.
- The seeded counts are an external oracle and are asserted as such: 23 / 8 / 8 / 9 / 10 for the
  five task types. A test fails if the seed drifts from the business's own document.

## Open

Screen 23 reads "18 of 30 answered" with all five types selected; the enumerated data gives **29**.
Going with 29 — an enumeration beats a mock number — and flagged for sign-off.
