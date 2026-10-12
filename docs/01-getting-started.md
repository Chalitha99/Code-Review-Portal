# Getting started

## What this is

The Service Delivery Portal is a single frontend hosting three sub-applications:
**Code Review** (built), **Delivery** and **Wiki** (registered shells, later
phases). The Code Review Portal replaces a spreadsheet-and-document review
process with role-based workspaces, a task-type-driven quality checklist and
structured reviewer feedback.

## Prerequisites

| Tool    | Version         | Why                                                               |
| ------- | --------------- | ----------------------------------------------------------------- |
| Node.js | **22 or newer** | Vite 8 requires it. Older versions fail with a cryptic ESM error. |
| npm     | 10+             | Ships with Node 22. The repo uses npm workspaces.                 |

Check with `node --version`. If you use `nvm`, run `nvm use 22`.

## Setup

```bash
git clone <repository-url>
cd Repo_SDP
npm install
# create apps/api/.env from docs/26-configuration-and-hosting.md (DATABASE_URL + JWT secrets)
npm run dev                              # web :5175 + NestJS :3000
```

Open <http://localhost:5175>. You will land on the login screen. The browser
talks only to NestJS (`/api`, proxied by Vite); there is no mock backend
([ADR 0016](./adr/0016-nestjs-is-the-only-backend.md)).

### Accounts

Accounts are created by an admin from the **Users** tab and finish setup through
an emailed set-password link. Without an email transport configured, the API
writes the message (with the link) to its log in development. For a first local
admin, set `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` and run
`npm run prisma:seed -w @sdp/api` against your own database.

Signing in as different accounts is how you check role gating — there is no
account switcher in the app, deliberately. See
[ADR 0013](./adr/0013-single-identity-no-impersonation.md).

## Scripts

| Script                               | What it does                                                   | When you run it           |
| ------------------------------------ | -------------------------------------------------------------- | ------------------------- |
| `npm run dev`                        | Web (Vite) + API (NestJS, esbuild watch)                       | Daily                     |
| `npm run build`                      | Type-check and build every project                             | Before pushing            |
| `npm run typecheck`                  | `tsc -b` across apps and packages                              | Daily                     |
| `npm run lint` / `lint:fix`          | ESLint, including the architecture rules                       | Daily                     |
| `npm run format` / `format:check`    | Prettier                                                       | Before committing         |
| `npm test`                           | Unit and component tests (web + API)                           | Daily                     |
| `npm run test:storybook -w @sdp/web` | Every story in Chromium, with accessibility checks             | Before pushing UI changes |
| `npm run storybook -w @sdp/web`      | Component workshop on :6006                                    | Building components       |
| `npm run e2e`                        | Playwright journeys against the real stack (own DB, own ports) | Before pushing            |

The API e2e suite and Playwright need PostgreSQL binaries locally (the scripts
start a private, throwaway cluster — never the shared database) and browsers:

```bash
npx playwright install chromium
npm run e2e:db:up -w @sdp/api
```

See [Testing strategy](./13-testing-strategy.md).

## Environment

The web app needs none: it calls relative `/api` URLs. `SDP_API_TARGET`
changes where Vite proxies them (default `http://localhost:3000`).

The API's variables are listed in the root [README](../README.md#environment).
In production the app must be served over HTTPS: session cookies are `Secure`,
and the API refuses to start with `COOKIE_SECURE=false`, a non-https
`APP_BASE_URL` (or `FRONTEND_ORIGIN`), or a database URL without `sslmode=require`.

## Committing

Husky runs `lint-staged` on commit: ESLint with `--fix`, then Prettier. If a
commit is rejected, the message names the rule — fix it rather than passing
`--no-verify`.

Branch from `develop`. CI runs the same gates you have locally, plus the browser
suites.
