# SDP Frontend Documentation

Start here. Each numbered document covers one of the SDP Frontend Engineering &
Architecture Standards; read them in order the first time, then use them as
reference.

## For someone joining the project

Read these four, in this order. About forty minutes.

1. [Getting started](./01-getting-started.md) — install, run, and the scripts you will use daily
2. [Architecture](./02-architecture.md) — how the application is put together and why
3. [Folder structure](./03-folder-structure.md) — where things live and where new things go
4. [Coding standards](./04-coding-standards.md) — the conventions the linter enforces

When you build your first screen, work through
[Adding a new UI](./23-adding-a-new-ui.md) — it walks the whole job end to end
and applies the standards above as it goes.

Then skim [Definition of done](./14-definition-of-done.md) before opening your
first pull request.

## Reference

| Document                                                            | Covers                                                                       |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| [01 · Getting started](./01-getting-started.md)                     | Setup, running, scripts, environment                                         |
| [02 · Architecture](./02-architecture.md)                           | Principles, technology stack, feature architecture                           |
| [03 · Folder structure](./03-folder-structure.md)                   | Every folder, what belongs in it, configuration files                        |
| [04 · Coding standards](./04-coding-standards.md)                   | Naming, file layout, comments, TypeScript rules                              |
| [05 · Design patterns](./05-design-patterns.md)                     | The recurring patterns and when to reach for each                            |
| [06 · Component architecture](./06-component-architecture.md)       | The two component tiers and the rules between them                           |
| [07 · Design system](./07-design-system.md)                         | Tokens, gradients, typography, charts, the colour rules                      |
| [08 · State management](./08-state-management.md)                   | Server state, client state, form state, URL state                            |
| [09 · API architecture](./09-api-architecture.md)                   | The client, contracts, query keys, error shape                               |
| [10 · Forms and validation](./10-forms-and-validation.md)           | React Hook Form + Zod, where messages live                                   |
| [11 · Routing and authorization](./11-routing-and-authorization.md) | Route tree, guards, adding a sub-application                                 |
| [12 · Accessibility](./12-accessibility.md)                         | The standard, the gates, and the traps already hit                           |
| [13 · Testing strategy](./13-testing-strategy.md)                   | The four tiers, what goes where, how to run them                             |
| [14 · Definition of done](./14-definition-of-done.md)               | Code review checklist and merge criteria                                     |
| [15 · Dependency governance](./15-dependency-governance.md)         | What each dependency is for; adding and removing                             |
| [16 · Mock API](./16-mock-api.md)                                   | MSW, the seeded database, demo controls                                      |
| [17 · Performance](./17-performance.md)                             | Code splitting, caching, measuring before optimising                         |
| [18 · Security](./18-security.md)                                   | The trust boundary and what the client may assume                            |
| [19 · Error handling and observability](./19-error-handling.md)     | Boundaries, logging, what a user sees                                        |
| [20 · Responsive design](./20-responsive-design.md)                 | Breakpoints and layout conventions                                           |
| [21 · Storybook standards](./21-storybook-standards.md)             | What every component must have a story for                                   |
| [22 · Route modules](./22-route-modules.md)                         | What a page file must export, and how to add a new page                      |
| [23 · Adding a new UI](./23-adding-a-new-ui.md)                     | End-to-end: content, path, page, route, links, and the component tiers       |
| [24 · Test plan](./24-test-plan.md)                                 | The manual, spec-traceable test suite in `qa/`: setup, roles, format, gaps   |
| [25 · Review assignment rules](./25-review-assignment-rules.md)     | Who holds a review, resubmission routing, removing a reviewer with open work |
| [26 · Configuration and hosting](./26-configuration-and-hosting.md) | Every env variable, ports, proxy, and what to change when hosting            |
| [27 · Production hosting runbook](./27-production-hosting-runbook.md) | Step-by-step hosting: secrets, DB, server, NGINX, TLS, tests, go-live, rollback |
| [Backend · Database schema](./backend/database-schema.md)           | Prisma schema reference for the code review portal                           |
| [Backend · Database layer](./backend/database-layer.md)             | `apps/api/src/database` boundary                                             |
| [Backend · Integrations](./backend/integrations.md)                 | `apps/api/src/integrations` (mail and other external clients)                |
| [Backend · Task review scenarios](./backend/task-review-scenarios.md) | Review round and cycle counting scenarios                                  |
| [Frontend · Parity audit](./frontend/parity-audit.md)               | Post-migration behaviour parity audit of `apps/web`                         |
| [Email and notifications](./email-notifications.md)                 | Brevo setup, which events email whom, Neon patches, troubleshooting          |
| [ADRs](./adr/)                                                      | Architecture decisions, with the reasoning that produced them                |
| [Backlog](./backlog.md)                                             | Decided but not yet built                                                    |
