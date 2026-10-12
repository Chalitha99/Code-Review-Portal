# Security

## The one rule

**The client never decides authorization.**

Route guards, hidden buttons and filtered lists shape the _experience_. They are
not a control. Anyone can open the console, call the endpoint directly, and skip
every one of them.

This is why the mock API enforces permissions server-side even though there is
no server yet:

```ts
const auth = requireRole('reviewer', 'admin');
if ('response' in auth) return auth.response;
```

Building it this way means the client's assumptions are already correct when a
real backend arrives. A mock that trusts the caller teaches the codebase a habit
the real system cannot afford.

Every handler that touches protected data calls `requireUser()` or
`requireRole()` first. `currentUser()` returns `null` with no session rather
than defaulting to a user — an unauthenticated request must genuinely fail.

## Authentication

Mock auth today, SSO later. What is deliberate about the current implementation
and should survive the swap:

- **Wrong password and unknown account return the identical message.** Different
  messages turn a login form into an account enumeration oracle.
- **The session is one identity.** No impersonation, no user switcher. Testing
  another role means signing in as that account, which is also how a real
  auditor would want it. See [ADR 0013](./adr/0013-single-identity-no-impersonation.md).
- **Sign-out calls `queryClient.clear()`**, not `invalidateQueries`. The next
  user must never see a flash of the previous user's cached data.
- **Nothing sensitive is in `localStorage`.** It holds a user id and UI
  preferences. When real tokens exist they belong in httpOnly cookies —
  `localStorage` is readable by any script on the page, which makes one XSS into
  a full account compromise.

## Password links (temporary local auth)

Until SSO, an admin creates an account and the user sets their own password
through a one-time emailed link (`{APP_BASE_URL}/set-password#token=...`).
Forgot password, and an admin's **Send reset link**, use the same link. The
screens are public. **The token is the only credential, and the server is the
only control.** The implementation is `apps/api/src/modules/password-links`.
Email delivery is described in [Email and notifications](./email-notifications.md).

**Tokens**

- 32 bytes from a CSPRNG, base64url (43 characters). Only `SHA-256(token)` is
  stored (`password_links.token_hash`), so a database dump or a log line cannot
  be replayed. Token lengths above 256 are rejected before hashing.
- Single use, enforced by a conditional update, so two concurrent submits
  cannot both succeed. Expiry: invite `INVITE_TTL_HOURS` (default 24 h), reset
  `RESET_TTL_MINUTES` (default 60 min). Issuing a link revokes the user's
  earlier links for the same purpose. Setting a password revokes every link the
  user holds and **ends every existing session** (`RefreshSession`).
- A link is valid only while the account is in the state it was issued for:
  INVITED for an invite, ACTIVE for a reset. Deactivating or deleting an account
  revokes its links.
- The token is never in a query string, an API response, a log line, the audit
  log or a notification payload. The email's expiry text comes from the link's
  real `expiresAt`, shown in `APP_TIMEZONE`.

**In the browser** (`features/local-auth/lib/tokenStore.ts`, `SetPasswordPage.tsx`)

- The token is read from the `#token=` fragment, which browsers never send to a
  server or in `Referer`. It is kept in memory, never in localStorage,
  sessionStorage or a cookie.
- The fragment **stays in the address bar until the backend answers 200** to
  `POST /auth/set-password`. A reload or a rejected password therefore keeps
  the same link usable. Only then is it scrubbed (`history.replaceState`).
- `POST /auth/token/validate` decides which screen to show. While the form is
  open, a timer sends the user to `/link-expired` when `expiresAt` passes, and
  a submit after expiry is not sent. The server re-checks expiry, use,
  revocation and account state on submit.
- Only a definite `expired` or `invalid` answer leads to `/link-expired`. A
  network error or a 5xx shows "try again" instead.
- `/set-password` and `/link-expired` open even when someone is signed in on
  the browser, so an admin can open a link while testing. After a successful
  save, that browser's session is signed out.

**No account enumeration**

- `POST /auth/forgot-password` always answers `202` after at least 400 ms. The
  account lookup and the email run after the reply, so known and unknown
  addresses take the same time.
- `POST /auth/resend-link` answers `202` and ignores used or replaced links.
- `GET /auth/link-policy` returns only the configured lifetimes and resend
  cooldown, so the screens never hard-code them.
- `POST /auth/token/validate` returns only `valid` (masked `emailHint`),
  `expired` or `invalid`. It never consumes the token.
- Login keeps one message for every failure. An INVITED account cannot sign in.

**Rate limits** (429 `RATE_LIMITED`)

| What                       | Limit                                                           |
| -------------------------- | --------------------------------------------------------------- |
| set-password               | 5 policy failures per link (`PASSWORD_PERSONAL` is not counted) |
| forgot-password            | 3 per email per 15 min, counted even without an account         |
| resend-link, resend-invite | 60 s per user and purpose                                       |
| admin reset link           | 60 s per user                                                   |
| all public auth routes     | 30 per IP per 15 min                                            |

The per-email and per-IP counters are in memory (`RateLimiterService`). That is
correct for one API instance; move them to Postgres or Redis before running
more than one. Per-IP limits need Express `trust proxy` (`TRUST_PROXY`) set to
the real proxy depth, or every caller shares the proxy's address.

**Password policy.** `failedPasswordRules` and `isPersonalPassword` from
`@sdp/contracts`, the same rules the browser shows. The answer is
`PASSWORD_POLICY` with `failedRules`, or `PASSWORD_PERSONAL`. Hashing is
Argon2id. The password is never trimmed, logged or echoed.

**Admin actions**

- `POST /users` creates the account INVITED and sends the invite. An admin never
  types a password.
- `POST /users/:id/resend-invite`, `POST /users/:id/revoke-invite` and
  `POST /users/:id/reset-password-link` use the same authorisation as editing:
  only a Super Admin may act on an Admin or Super Admin. Invite actions answer
  `409 NOT_INVITED`, and the reset link answers `409 NOT_ACTIVE`, once the user
  is in another state.
- Changing an active user's email sends a notice to the **old** address.
  Deactivation, removal and role changes send the user an "access changed"
  notice.

**Transport and headers.** The public routes need no CSRF cookie. They check
`Origin` against the allowed origin (`APP_BASE_URL`, or `FRONTEND_ORIGIN` if set) and set `Cache-Control: no-store` and
`Referrer-Policy: no-referrer`. The page adds
`<meta name="referrer" content="no-referrer">` while a password screen is open.

**SQL injection.** All database access goes through Prisma. Raw SQL uses only
tagged templates (`$queryRaw\`...\``), which Prisma sends as bind parameters.
`src/common/raw-sql.guard.spec.ts`fails the build on`$queryRawUnsafe`,
`$executeRawUnsafe`, `Prisma.raw(`or a function-call`$queryRaw(`.
`test/e2e/email-and-links.e2e-spec.ts` sends SQL, NoSQL-style objects, NUL
bytes and oversized values to every public auth route and to user creation,
then checks that no 5xx occurred and the row counts are unchanged.

**Redirects.** After sign-in, only a same-origin path from router state is
followed (`lib/safeRedirect.ts`). `//host`, `/\host`, absolute URLs and control
characters fall back to `/crp`.

## Input

**Validate at the boundary, in both directions.** Zod parses every response
before it reaches a component, and every request body before the mock acts on
it. Validation on the client is for user experience; the server validates again
because the client's copy can be bypassed.

**Never `dangerouslySetInnerHTML`.** React escapes by default; the only way to
introduce an XSS here is to opt out. If rich text ever becomes a requirement,
sanitise with a maintained library on the way in and record the decision as an
ADR.

**URL parameters are user input.** `routePaths` builders call
`encodeURIComponent` on every argument.

## Output

- No secrets in the bundle. `VITE_*` variables are compiled into client code and
  are public by definition. An API key in one is a published API key.
- No sensitive data in logs. `logger.ts` is the one boundary; it must never
  receive a token, a password or a full user record.
- Error messages tell the user what to do, not what the stack was. Details go to
  the console in development and to the logger in production.

## Dependencies

`npm audit` on every dependency addition, and in CI. A high or critical advisory
in a runtime dependency blocks a merge; a moderate one gets an issue and a date.

Every dependency is a supply-chain surface, which is the strongest argument in
[dependency governance](./15-dependency-governance.md) for keeping the list
short.

## Headers, for deployment

The API sets these itself (helmet, below). The host that serves the web build must send the same for the HTML. The NGINX config in the [Production hosting runbook](./27-production-hosting-runbook.md#phase-7-nginx-configuration) does this, with the full CSP:

| Header                      | Value                                                  |
| --------------------------- | ------------------------------------------------------ |
| `Content-Security-Policy`   | `default-src 'self'` plus what the app genuinely needs |
| `X-Frame-Options`           | `DENY`                                                 |
| `X-Content-Type-Options`    | `nosniff`                                              |
| `Referrer-Policy`           | `strict-origin-when-cross-origin`                      |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains`                  |

HTTPS everywhere. Session cookies `Secure`, `HttpOnly`, `SameSite=Lax`.

## API hardening (NestJS)

The backend is the only enforcement point ([ADR 0016](./adr/0016-nestjs-is-the-only-backend.md)).

**Sessions**

- `sdp_access` (15-minute JWT) and `sdp_refresh` (rotated on use, scoped to
  `/api/auth`) are `HttpOnly`, `SameSite=Lax`, `Secure` in production. JWTs are
  pinned to HS256 with separate secrets.
- The access token is bound to its server-side session: logout, a password
  change, deactivation, deletion or an email change revokes the session and the
  access token stops working at once (not after 15 minutes).
- CSRF: double-submit token (`sdp_csrf` cookie + `X-CSRF-Token`) on every write;
  only the exact public auth paths are exempt, and those check `Origin`.

**Sign-in**

- 5 attempts per account and 30 per client IP per 15 minutes, then 429.
- A browser that has signed in to an account before keeps its own 5-attempt
  budget (`sdp_device`: HttpOnly, `SameSite=Strict`, path `/api/auth/login`,
  HMAC-bound to the email). Failures from anywhere else therefore cannot lock
  the owner out, while unknown browsers still share the per-account limit.
- Once a budget is used up, even the correct password fails for it, so a locked
  budget cannot be used as a password oracle.
- Unknown and invited accounts get the same argon2 work as a wrong password, so
  response time does not reveal which emails exist; one generic 401 for all.
- `TRUST_PROXY=1` behind NGINX (a hop count, not an address list), so per-IP
  limits see the client, not the proxy. NGINX overwrites `X-Forwarded-For`.

**Accounts**

- Changing a user's email puts the account back to Invited: password cleared,
  every session and link revoked, a new invite sent to the new address. An
  admin cannot point an account at an unverified address and then reset it.
- revoke-invite deletes only a still-INVITED account, inside one transaction.
- Super Admin transfer is refused while the target still holds review work.

**Uploads** (task attachments, review screenshots)

- Checked on the decoded bytes: PNG/JPEG/GIF/WebP by magic number, ≤ 5 MB,
  ≤ 10 per item. Only `data:image/...;base64` is stored, so no `javascript:` or
  remote URL can reach an `<img src>` or download link.
- JSON body limit 1 MB, raised to 8 MB (attachments) / 25 MB (review drafts)
  only on those routes and only with a session cookie; over-limit is 413.

**Responses and data**

- `helmet`: CSP with `frame-ancestors 'none'`, `X-Frame-Options: DENY`,
  `nosniff`, `Referrer-Policy: no-referrer`, HSTS in production; no
  `X-Powered-By`. Swagger is off unless `SWAGGER_ENABLED=true`.
- Error responses carry a code and a safe message only; internals never leak.
- Passwords and refresh tokens are argon2id; link tokens are stored as SHA-256.
- Data at rest is encrypted by the database host (Neon); production requires
  `sslmode=require` on the connection.
- Retired checklist content (`scope=all`, inactive rows) is admin-only.

**Known follow-ups**: the rate limiter is in memory (one instance; use Redis
with several); attachments are stored as data URLs in the database (move to
object storage); forgot-password waits for the email send, which leaks timing
once a real mail transport is bound — queue it with the email work.
