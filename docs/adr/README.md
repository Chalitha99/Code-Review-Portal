# Architecture Decision Records

One file per decision that had a real alternative and would be expensive to reverse. If a choice
was obvious, or reversing it is a morning's work, it belongs in a code comment instead — this
directory is for the decisions a new engineer would otherwise re-litigate.

Each record states the decision, what was actually considered, and — most usefully — **what it
costs**. A record that lists only advantages is marketing, not a decision record.

| #                                                               | Decision                                                                                | Status             |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------ |
| [0001](0001-tailwind-design-tokens.md)                          | Tailwind v4 with design tokens, not SCSS modules                                        | Accepted           |
| [0002](0002-server-and-client-state.md)                         | TanStack Query for server state, Zustand for client state                               | Accepted           |
| [0003](0003-msw-as-the-api-seam.md)                             | MSW at the network boundary, not a mock service object                                  | Superseded by 0016 |
| [0004](0004-headless-tables.md)                                 | Headless tables (TanStack Table), not a grid component                                  | Accepted           |
| [0005](0005-framework-free-domain.md)                           | Business rules in framework-free `domain/` modules                                      | Accepted           |
| [0006](0006-administered-checklist.md)                          | The checklist is administered data; answers snapshot it                                 | Accepted           |
| [0007](0007-handover-design.md)                                 | Handover holds a task out of the queue; the cycle is untouched                          | Provisional        |
| [0008](0008-keyed-remount-not-effects.md)                       | Seed form state in `useState`, reset with a `key`                                       | Accepted           |
| [0009](0009-charting-library.md)                                | Recharts stays; the effort goes into presentation                                       | Accepted           |
| [0010](0010-soft-delete-and-restore.md)                         | Restoring deleted records is a Phase 2 persistence decision                             | Accepted           |
| [0011](0011-row-reordering.md)                                  | Pragmatic drag-and-drop, and a keyboard path we own                                     | Accepted           |
| [0012](0012-component-tiers-and-the-portal-layer.md)            | Three component tiers; the portal owns one                                              | Accepted           |
| [0013](0013-single-identity-no-impersonation.md)                | One identity per session; no impersonation                                              | Accepted           |
| [0014](0014-monorepo-shape-and-the-backend-seam.md)             | Flat repository; the backend arrives at apiClient                                       | Accepted           |
| [0015](0015-resubmission-returns-to-the-requesting-reviewer.md) | Resubmission returns to the requesting reviewer; pending reviews block reviewer removal | Proposed           |
| [0016](0016-nestjs-is-the-only-backend.md)                      | NestJS is the only backend; the MSW mock is removed                                     | Accepted           |
| [0017](0017-email-delivery.md)                                  | Email through Brevo, with the notifications table as the outbox                         | Accepted           |

## Status meanings

- **Accepted** — in force. Change it by writing a superseding record, not by editing this one.
- **Provisional** — built without a specification or a wireframe, pending business review. Expect
  it to change; keep the blast radius small.
- **Superseded** — kept for the reasoning; the header names its replacement.
