# 0008 · Seed form state in `useState`, reset it with a `key`

**Status:** Accepted · **Date:** Phase 1, checkpoint 2 (key corrected at checkpoint 5)

## Context

Several forms are initialised from server data and then edited: the Code Review Form, the
Add/Edit User and Customer dialogs, the checklist question form, the Assign Reviewer picker.

The obvious implementation is an effect: `useEffect(() => setDraft(fromServer), [fromServer])`.

## Decision

Never synchronise props into state from an effect. Instead:

1. seed state in `useState`'s initialiser, and
2. remount the component with a `key` when it should genuinely reset.

Dialogs go further: they are **mounted only while open** and keyed on their subject, so opening
one for a different record is a fresh mount rather than a reset.

```tsx
{isFormOpen ? <UserFormDialog key={editing?.id ?? 'new'} user={editing} … /> : null}
```

`react-hooks/set-state-in-effect` enforces the rule.

## Why not the effect

It re-runs on every refetch, and refetches happen for reasons that have nothing to do with the
user. On the review form the effect would have fired on each screenshot upload and **discarded
whatever the reviewer had typed** — ten minutes of General Check answers and findings gone, with
no error and nothing in the console.

## The trap this decision has of its own — and it caught us

**Choosing the wrong key is the same bug wearing a different hat.**

`ReviewFormSection` was keyed on the review id. That looked natural and was wrong: a review row is
created **lazily, on the first write**. Until then the query returns `null` and the key is `"new"`.
The moment a reviewer attached their first screenshot, the row appeared, the key changed, the form
remounted, and the General Check answers, findings and rank were silently thrown away. In the
browser it presented as "I attached the screenshot but Request Changes is still greyed out".

Nothing caught it for two checkpoints because no test had ever uploaded a screenshot **and** typed
something in the same run — the reviewer spec asserted the disabled state and stopped there.

It is now keyed on `${task.id}-${task.reviewCycle}`. The cycle is the thing that actually means
"start again": it advances only when a review round completes.

**The rule that follows:** a reset key must be derived from something that exists _before_ the
first write. An id assigned by the server on first save is exactly the wrong choice.

`features/reviews/routes/reviewFormState.test.tsx` is the negative control — it fails if the key
regresses to the review id, and that was verified by reverting the key and watching both tests go
red.

## Consequences

**Good.** No effect fighting a refetch for ownership of a text box. Dialogs cannot show a previous
subject's data. The rule is lint-enforced rather than remembered.

**The cost.** Keyed remounts are invisible in the JSX unless you know to look, so each one carries
a comment explaining what the key means. And, as above, the key itself is a correctness decision —
not plumbing.
