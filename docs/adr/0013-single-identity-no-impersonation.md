# ADR 0013 — One identity per session; no impersonation

- **Status:** Accepted
- **Date:** 2026-09-05

## Context

Three roles — Developer, Reviewer, Admin — see three different workspaces, and a
user may hold more than one. During development and demos it is constantly
useful to look at the application "as" another role.

An Admin can already reach all three workspaces, which makes a switcher look
almost free: the shell knows the roles, and swapping the active one is a few
lines.

## Alternatives considered

**A role switcher for users holding multiple roles.** Convenient, and it does not
grant access anyone lacks. Rejected because it makes "the current role" a second
piece of session state that every guard, every query key and every audit record
has to agree on. The workspace guards already derive access from
`user.roles`; introducing an _active_ role means two sources of truth for the
same question, and the wrong one gets read eventually.

**Admin impersonation of another user.** The strongest version of the same idea,
and the most useful for support. Rejected outright for phase 1: every write in
this application is attributed — a review is signed, a checklist records who
answered it, a handover records who handed over. An impersonated write is either
attributed to the wrong person or needs a second "on behalf of" field threaded
through the whole audit trail. Neither is worth building before there is a real
backend to enforce it.

## Decision

A session carries exactly one identity, resolved once at sign-in and never
changed. There is no user switcher and no impersonation. Checking another role
means signing out and signing in as an account that holds it — which is also how
an auditor would want it.

`clearUserStorage()` and `queryClient.clear()` run on every session end, so the
next identity starts from nothing rather than inheriting a cached view of the
previous one.

## Consequences

Testing role gating is slower: seven seeded accounts exist precisely so this is
merely tedious rather than difficult, and they are listed in
`01-getting-started.md`.

When impersonation is genuinely needed — a support tool, most likely — it
arrives as a backend-issued token that says who is acting and on whose behalf,
not as a client-side toggle. The client never decides authorisation, which
`18-security.md` states as the trust boundary.

The mock API's `window.__mockApi.setUser()` is a demo control, not an exception
to this. It replaces the session outright rather than layering an identity over
another, and it does not exist outside development.
