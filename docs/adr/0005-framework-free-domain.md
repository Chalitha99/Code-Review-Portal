# 0005 · Business rules in framework-free `domain/` modules

**Status:** Accepted · **Date:** Phase 1, Sprint 0 · **Reinforced:** every checkpoint since

## Context

The rules in this product are the product: cycle counting, the rank gate that blocks Approve,
checklist completeness, the mandatory rejection reason, who may cancel or delete a task. Each is
written in a specification clause, will be re-asserted server-side in Phase 2, and is asked from
several screens at once.

The natural place to put them is wherever they are first needed — a `disabled` prop, a handler.

## Decision

Every rule is a pure function in a `domain/` module (or in `lib/` once it outgrows one feature).
No React import, no router, no store — ESLint enforces this, and the domain layer carries a
**90% statement / 85% branch coverage threshold, per file**.

Current occupants:

| Module                                     | Owns                                                                  |
| ------------------------------------------ | --------------------------------------------------------------------- |
| `lib/statusMachine.ts`                     | Who may edit, submit, pick, decide, hand over, cancel, delete, assign |
| `features/tasks/domain/taskRules.ts`       | Derived title (FL 2.5-01), submit readiness                           |
| `features/tasks/domain/checklistRules.ts`  | Which questions render, progress, issue count                         |
| `features/tasks/domain/responseRules.ts`   | Per-finding responses, resubmit readiness (FL 2.11.2.3-01)            |
| `features/reviews/domain/reviewRules.ts`   | General Check completeness, rank gate, cycle counting                 |
| `features/reports/domain/reportMetrics.ts` | Every number on the Reports tab                                       |
| `lib/attachments.ts`                       | Image type/size/count limits (FL 2.9.2.6-01)                          |

A rule that lives in a `disabled` prop cannot be shared with a NestJS guard. A rule that lives in
a function can be ported line for line.

## Alternatives considered

- **Rules where they are used.** Rejected. `canDecideReview` is asked by the review page, the
  queue, and three handlers; three copies is three chances to disagree.
- **Rules only in the (future) backend.** Rejected for Phase 1: there is no backend, and the UI
  still has to decide what to disable.

## Consequences

**Good.** These are the cheapest tests in the codebase and the most valuable. `reportMetrics`
reproduces the wireframe's own "14.3% approval rate" from an independently-built fixture — an
external oracle, not a restatement of the implementation. The rules are portable to Phase 2 as-is.

**The cost.**

- Constant pressure to import React "just for this one hook". The lint rule is what holds the
  line, and it has been tested with deliberate violations.
- Shared rules migrate. `statusMachine` started in `features/tasks/domain/` and moved to `lib/`
  when reviewers and admins needed it; the same happened to `useTasks`, `taskColumns`,
  `ChecklistSummary`, `useCustomers` and `useUsers`. **Every boundary violation so far has been
  fixed by moving the shared thing, never by weakening the rule** — that is the discipline that
  keeps the layer graph meaningful.
- The threshold has to be verified, not trusted. It once matched no files at all (Vitest globs
  match absolute paths, so `'src/features/*/domain/**'` matched nothing) _and_ `npm test` did not
  pass `--coverage`, so the block was inert twice over. It is `'**/src/features/*/domain/**'` with
  `perFile: true` now, and it was re-probed with a deliberately uncovered function.
