# Production hosting runbook

Step-by-step procedure for putting SDP into production behind NGINX. Nothing here is applied yet: the repository contains no live server configuration. Follow the phases in order when hosting starts. Each phase ends with a **Done when** check; do not move on until it passes.

Related: [Configuration and hosting](./26-configuration-and-hosting.md) (every environment variable) and [Security](./18-security.md) (what the API already enforces).

**Target layout**

```
Internet ─► NGINX :443 (TLS, headers, rate limits, static web build)
                 └─ /api/* ─► Node API on 127.0.0.1:3000 (systemd, user "sdp")
                                   └─► Neon PostgreSQL (sslmode=require)
                                   └─► Brevo (email)
```

One origin serves both the web app and `/api`, so cookies, CORS and CSRF behave the same as in development.

---

## Phase 1: Decisions and prerequisites

Have these before touching a server:

| Item            | Example / note                                                                                                       |
| --------------- | -------------------------------------------------------------------------------------------------------------------- |
| Public hostname | `portal.example.com`, with a DNS A/AAAA record pointing at the server                                                |
| Server          | Linux VM (Ubuntu 24.04 LTS assumed below), public IP, SSH access                                                     |
| Database        | Neon **production** branch, separate from the shared development data, plus its pooled and direct connection strings |
| Email           | Brevo account, a verified sender address, and an API key for production only                                         |
| Secret owner    | One named person who generates, stores and rotates production secrets                                                |
| Release source  | The commit or tag to deploy, which has passed the tests in Phase 10                                                  |

**Done when** DNS resolves to the server and every row above has an owner.

## Phase 2: Secrets

1. **Rotate what was exposed.** The development `apps/api/.env` sits in a OneDrive-synced folder and held real-looking `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` and `SDP_BREVO_API_KEY` values (VAPT SDP-VAPT-010).
   - Revoke that Brevo key in the Brevo console.
   - Never reuse those JWT secrets.
   - Move the development `.env` out of the synced folder.
2. **Generate new production values** on a trusted machine:

   ```bash
   openssl rand -base64 48   # JWT_ACCESS_SECRET
   openssl rand -base64 48   # JWT_REFRESH_SECRET (must differ)
   ```

3. **Create `/etc/sdp/api.env`** on the server (Phase 4 creates the folder):

   ```ini
   NODE_ENV=production
   PORT=3000
   TRUST_PROXY=1
   DATABASE_URL=postgresql://<app-role>:<password>@<neon-pooler-host>/<db>?sslmode=require
   APP_BASE_URL=https://portal.example.com
   JWT_ACCESS_SECRET=<generated>
   JWT_REFRESH_SECRET=<generated>
   EMAIL_ENABLED=true
   SDP_BREVO_API_KEY=<production key>
   SDP_EMAIL_FROM_ADDRESS=<verified sender>
   SDP_SUPPORT_EMAIL=<support address>
   ```

   - Leave `COOKIE_SECURE`, `SWAGGER_ENABLED` and `E2E_MAIL_OUTBOX` unset.
   - Optional variables are listed in [doc 26](./26-configuration-and-hosting.md#api-variables).

4. **Lock the file down**, and keep it out of the repository and any synced or shared folder:

   ```bash
   sudo chown root:root /etc/sdp/api.env && sudo chmod 600 /etc/sdp/api.env
   ```

**Done when** the old key is revoked, the new values exist only in `/etc/sdp/api.env` (plus the secret owner's password manager), and the file mode is `600`.

## Phase 3: Database

1. Use the Neon **production** branch. The URL must carry `sslmode=require`; the API refuses to start in production without it.
2. Create a least-privilege application role:
   - **Allowed:** read and write on the application tables.
   - **Not allowed:** superuser, `CREATEDB`, or DDL at runtime.
   - Run schema changes with a separate owner role.
3. In Neon:
   - Enable the **IP allow-list** for the server's egress IP.
   - Enable **point-in-time restore**.
4. Bring the schema up to date. Follow the existing procedure:
   - For a fresh database, run `prisma migrate deploy` with the owner role.
   - For an existing database, use the additive Neon patches described in [Email and notifications](./email-notifications.md):

     ```bash
     npm run db:neon-patch -w @sdp/api -- prisma/neon-patches/<file>.sql          # dry run
     npm run db:neon-patch -w @sdp/api -- prisma/neon-patches/<file>.sql --apply
     ```

   - Never run `prisma migrate reset` against Neon.
5. Create the first Super Admin with the seed's bootstrap variables, run once, then remove those variables from the environment.

**Done when** the app role can connect with `sslmode=require` from the server, cannot from elsewhere, and PITR is on.

## Phase 4: Server preparation

```bash
sudo apt update && sudo apt full-upgrade -y
sudo apt install -y unattended-upgrades ufw nginx certbot git
sudo dpkg-reconfigure -plow unattended-upgrades

# Node LTS (22 or newer; the project is tested on 22 and 24)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# Service user and folders
sudo useradd --system --create-home --home-dir /srv/sdp --shell /usr/sbin/nologin sdp
sudo mkdir -p /srv/sdp/releases /etc/sdp /var/www/certbot

# Firewall: only SSH, HTTP, HTTPS are public. Port 3000 is never opened.
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80,443/tcp
sudo ufw enable
```

- Restrict SSH to known addresses or a VPN, and turn off password login (`PasswordAuthentication no`).
- The API listens on all interfaces, so the firewall (or the cloud security group) is what keeps port 3000 private. Apply the same rule in the cloud console if there is one.

**Done when** `sudo ufw status` shows only 22, 80 and 443 allowed, and `node -v` reports 22 or newer.

## Phase 5: Build and deploy a release

The API bundle (`dist/apps/api/main.js`) keeps its npm dependencies external, so each release is a full checkout with `node_modules` and the generated Prisma client.

```bash
REL=/srv/sdp/releases/$(date +%Y%m%d%H%M%S)
sudo -u sdp git clone --depth 1 --branch <tag-or-branch> <repo-url> "$REL"
cd "$REL"
sudo -u sdp npm ci
sudo -u sdp npm run build          # dist/apps/web and dist/apps/api/main.js (runs prisma generate)
sudo -u sdp test ! -e apps/api/.env && echo "ok: no .env in the release"
sudo ln -sfn "$REL" /srv/sdp/current
```

- Never copy a `.env` into a release. The API reads configuration only from `/etc/sdp/api.env` through systemd.
- Keep the last few releases for rollback (Phase 12).

**Done when** `/srv/sdp/current/dist/apps/web/index.html` and `/srv/sdp/current/dist/apps/api/main.js` exist.

## Phase 6: API service (systemd)

Create `/etc/systemd/system/sdp-api.service`:

```ini
[Unit]
Description=SDP API
After=network-online.target
Wants=network-online.target

[Service]
User=sdp
Group=sdp
WorkingDirectory=/srv/sdp/current
EnvironmentFile=/etc/sdp/api.env
ExecStart=/usr/bin/node dist/apps/api/main.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
LockPersonality=true
CapabilityBoundingSet=
AmbientCapabilities=

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now sdp-api
sudo journalctl -u sdp-api -n 50 --no-pager
curl -s http://127.0.0.1:3000/api/health
```

- At boot the API validates its configuration. It refuses to start with:
  - http origins or `APP_BASE_URL`
  - `COOKIE_SECURE=false`
  - a database URL without `sslmode`
  - short or missing JWT secrets
  - `TRUST_PROXY=true`
  - a mail outbox file
- A refusal names the variable; fix it in `/etc/sdp/api.env` and restart.
- The boot log has one line naming the email transport (`brevo`), the sender, the link base URL and the link lifetimes.

**Done when** the health call returns `{"status":"ok",...}` and the boot log shows the `brevo` transport.

## Phase 7: NGINX configuration

Three files. Replace `portal.example.com` everywhere, and keep the paths as shown unless the layout differs.

### `/etc/nginx/conf.d/sdp.conf`

```nginx
# Service Delivery Portal: NGINX reverse proxy (TLS, static web build, /api).
# Included inside http {}. See docs/27-production-hosting-runbook.md.

limit_req_zone  $binary_remote_addr zone=sdp_auth:10m rate=10r/m;
limit_req_zone  $binary_remote_addr zone=sdp_api:10m  rate=20r/s;
limit_conn_zone $binary_remote_addr zone=sdp_conn:10m;
limit_req_status  429;
limit_conn_status 429;
server_tokens off;

upstream sdp_api {
    server 127.0.0.1:3000;
    keepalive 16;
}

server {
    listen 80;
    listen [::]:80;
    server_name portal.example.com;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name portal.example.com;

    ssl_certificate         /etc/letsencrypt/live/portal.example.com/fullchain.pem;
    ssl_certificate_key     /etc/letsencrypt/live/portal.example.com/privkey.pem;
    ssl_trusted_certificate /etc/letsencrypt/live/portal.example.com/chain.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305;
    ssl_prefer_server_ciphers off;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SDP_SSL:10m;
    ssl_session_tickets off;
    ssl_stapling on;
    ssl_stapling_verify on;

    root /srv/sdp/current/dist/apps/web;
    index index.html;

    client_max_body_size 1m;
    client_body_timeout 15s;
    client_header_timeout 15s;
    keepalive_timeout 30s;
    send_timeout 30s;
    large_client_header_buffers 4 16k;
    limit_conn sdp_conn 40;

    # /api responses keep the API's own helmet headers; the static locations get the snippet.
    location ~ /\.          { return 404; }
    location ~* \.map$      { return 404; }
    location ^~ /api/docs   { return 404; }

    location = /index.html {
        include snippets/sdp-security-headers.conf;
        add_header Cache-Control "no-cache" always;
    }

    location /assets/ {
        include snippets/sdp-security-headers.conf;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
        try_files $uri =404;
    }

    # Public sign-in and password-link routes: brute-force and email-flood budget.
    location ~ ^/api/auth/(login|forgot-password|set-password|resend-link|token/validate)/?$ {
        limit_req zone=sdp_auth burst=10 nodelay;
        include snippets/sdp-proxy.conf;
    }

    # Body limits mirror apps/api/src/common/http/body-parsers.ts (8 MB / 25 MB + envelope).
    location ~ ^/api/(tasks|review-tasks)/[^/]+/attachments(/[^/]+)?/?$ {
        client_max_body_size 9m;
        limit_req zone=sdp_api burst=40 nodelay;
        include snippets/sdp-proxy.conf;
    }

    location ~ ^/api/tasks/[^/]+/(review|handover)/?$ {
        client_max_body_size 26m;
        limit_req zone=sdp_api burst=40 nodelay;
        include snippets/sdp-proxy.conf;
    }

    location /api/ {
        limit_req zone=sdp_api burst=40 nodelay;
        include snippets/sdp-proxy.conf;
    }

    location / {
        include snippets/sdp-security-headers.conf;
        try_files $uri $uri/ /index.html;
    }
}
```

### `/etc/nginx/snippets/sdp-proxy.conf`

```nginx
# X-Forwarded-For is overwritten with the real peer address, never appended to, so a
# client-supplied chain cannot reach Express. Pair with TRUST_PROXY=1 on the API.
proxy_pass http://sdp_api;
proxy_http_version 1.1;
proxy_set_header Connection "";
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $remote_addr;
proxy_set_header X-Forwarded-Proto https;
proxy_set_header X-Forwarded-Host $host;
proxy_hide_header X-Powered-By;
proxy_request_buffering on;
proxy_connect_timeout 5s;
proxy_send_timeout 60s;
proxy_read_timeout 60s;
```

### `/etc/nginx/snippets/sdp-security-headers.conf`

```nginx
# Security headers for the web app's HTML and static assets. Included in each static
# location because NGINX drops inherited add_header once a location adds its own.
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests" always;
add_header X-Frame-Options "DENY" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" always;
add_header Cross-Origin-Opener-Policy "same-origin" always;
add_header Cross-Origin-Resource-Policy "same-origin" always;
```

### What the configuration enforces

| Control             | Setting                                                                                               | Why                                                                                                                                                                           |
| ------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TLS                 | TLS 1.2/1.3, Mozilla intermediate ciphers, HTTP/2, OCSP stapling, no session tickets                  | Transport security; plain HTTP only redirects                                                                                                                                 |
| Client IP           | `X-Forwarded-For` overwritten with `$remote_addr`                                                     | A client cannot inject a fake IP (Phase 9)                                                                                                                                    |
| Sign-in brute force | `sdp_auth`: 10 per minute per IP, burst 10, on login and the public password-link routes              | Edge throttle in front of the API's own limits                                                                                                                                |
| General API         | `sdp_api`: 20 per second per IP, burst 40; 40 connections per IP                                      | Absorbs floods before they reach Node                                                                                                                                         |
| Request size        | 1 MB default; 9 MB attachments; 26 MB review/handover                                                 | Mirrors `body-parsers.ts`. Oversized bodies are rejected before the API sees them, so large anonymous bodies are limited to the two upload routes, and those are rate-limited |
| Slow clients        | 15 s header/body timeouts, request buffering                                                          | Slowloris protection; Node only sees complete requests                                                                                                                        |
| Web headers         | CSP, HSTS (2 years), `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP/CORP | The built `index.html` carries no headers of its own (VAPT SDP-VAPT-007)                                                                                                      |
| API headers         | Passed through unchanged from helmet                                                                  | The API already sends its own CSP, HSTS and frame headers                                                                                                                     |
| Exposure            | `*.map`, dotfiles and `/api/docs` return 404; `server_tokens off`; `X-Powered-By` hidden              | Source maps, stray files and API docs are never served                                                                                                                        |
| Caching             | `index.html` no-cache; `/assets/*` immutable for 1 year                                               | Users always load the current build                                                                                                                                           |

**Why the CSP looks like this**

- `script-src 'self'` is strict: the build has no inline scripts.
- `style-src` needs `'unsafe-inline'` because Radix UI (scroll lock) and `sonner` insert `<style>` elements at runtime.
- `img-src data:` is needed because attachments and screenshots are stored and shown as data URLs.
- Fonts are self-hosted (`@fontsource`).
- There are no third-party origins.

**Install**

```bash
sudo cp sdp.conf /etc/nginx/conf.d/sdp.conf
sudo cp sdp-proxy.conf sdp-security-headers.conf /etc/nginx/snippets/
sudo rm -f /etc/nginx/sites-enabled/default
```

Do not reload yet: the certificate from Phase 8 must exist first. For the very first issuance, temporarily comment out the `server { listen 443 … }` block, or use `certbot --nginx`.

**Done when** the three files are in place with the real hostname.

## Phase 8: TLS certificate

```bash
# With only the port-80 server block active:
sudo nginx -t && sudo systemctl reload nginx
sudo certbot certonly --webroot -w /var/www/certbot -d portal.example.com \
     --deploy-hook "systemctl reload nginx"
# Re-enable the 443 block, then:
sudo nginx -t && sudo systemctl reload nginx
sudo certbot renew --dry-run
```

Certbot installs a renewal timer. The deploy hook reloads NGINX after each renewal.

**Done when** `nginx -t` passes, `https://portal.example.com` loads with a valid certificate, and the renew dry run succeeds.

## Phase 9: Trust proxy and client IP

The API must run with `TRUST_PROXY=1` (Phase 2).

- `1` is a **hop count**. Express trusts exactly one proxy and takes the client IP from the `X-Forwarded-For` entry that NGINX writes. NGINX overwrites that header with the real peer address, so a spoofed value never reaches Express.
- **Do not** use an address or subnet list (`loopback`, `10.0.0.0/8`). The open `proxy-addr` advisory (GHSA-jqcg-44mw-7w3h, VAPT SDP-VAPT-005) concerns subnet matching. Hop-count mode does not use that code path, which removes the practical exposure without a dependency upgrade.
- **Never** `true`; the API refuses to start with it.
- **Without** `TRUST_PROXY`, every user appears to come from `127.0.0.1`. They then share one per-IP sign-in budget (30 per 15 minutes) and lock each other out.
- If another proxy or load balancer is ever placed in front of NGINX, revisit this setting: the hop count and the header handling must change together.

**Done when** the spoofing check in Phase 10 passes.

## Phase 10: Testing

### 10a. Automated suites, on the release commit before deploying

```bash
npm ci
cd apps/api && npx vitest run --config vitest.config.ts && cd ../..        # API unit tests
npm run e2e:db:up -w @sdp/api
export E2E_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/sdp_e2e
npm run e2e:db:reset -w @sdp/api
cd apps/api && npx vitest run --config vitest.e2e.config.ts --no-file-parallelism && cd ../..
npm run e2e                                                                  # Playwright journeys
npm run e2e:db:down -w @sdp/api
```

- The e2e suites only ever use the private local database (see [Testing strategy](./13-testing-strategy.md)).
- Run them sequentially (`--no-file-parallelism`): they share one database.
- The security regression suite (`apps/api/test/e2e/security`) is part of this run.

**Done when** everything is green. The security suite reports its known-open findings as "expected fail".

### 10b. Local NGINX dry run (optional, no server needed)

Use this to try a config change before it goes to the server. It was last run successfully on 2026-10-11 on Windows, without admin rights.

1. Download the NGINX Windows zip from nginx.org into a temp folder, and create a throwaway certificate:

   ```bash
   MSYS_NO_PATHCONV=1 openssl req -x509 -newkey rsa:2048 -nodes -days 1 \
     -subj "/CN=localhost" -keyout key.pem -out cert.pem
   ```

2. Build the web app: `cd apps/web && npx vite build` (output goes to `dist/apps/web`).
3. Make a test copy of `sdp.conf`:
   - ports `8080`/`8443`
   - `server_name localhost`
   - the temp certificate paths
   - `root` set to the absolute `dist/apps/web` path, in quotes
   - upstream `127.0.0.1:3100`

   Copy the snippets into `conf/snippets/`. Use an `nginx.conf` whose `http {}` includes `mime.types` and the test file. Run `nginx -t`, then start NGINX.

4. Start the e2e API behind it:

   ```bash
   E2E_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/sdp_e2e \
   E2E_WEB_ORIGIN=https://localhost:8443 TRUST_PROXY=1 \
     node apps/api/scripts/e2e-serve.mjs
   ```

5. Run the checks in 10c against `https://localhost:8443` (add `-k` to curl for the self-signed certificate).
6. Clean up: `nginx -s stop`, stop the API, `npm run e2e:db:down -w @sdp/api`, and delete the temp folder and `dist/apps/web`.

A warning that `ssl_stapling` is ignored is expected with a self-signed certificate.

### 10c. Checks against the deployed site

Replace `$B` with `https://portal.example.com`.

```bash
B=https://portal.example.com

# Security headers on the web app
curl -sI $B/ | grep -Ei 'strict-transport|content-security|x-frame|x-content|referrer|permissions|cache-control'

# SPA deep link falls back to index.html
curl -s -o /dev/null -w '%{http_code}\n' $B/crp/anything                     # 200

# Hashed assets cached; source maps, dotfiles and API docs hidden
A=$(curl -s $B/ | grep -oE '/assets/index-[^"]+\.js' | head -1)
curl -sI $B$A | grep -i cache-control                                      # immutable
for p in "$A.map" /.env /api/docs /api/docs-json; do
  echo "$p -> $(curl -s -o /dev/null -w '%{http_code}' $B$p)"; done          # all 404

# HTTP redirects to HTTPS
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' http://portal.example.com/   # 301

# API health through the proxy
curl -s $B/api/health                                                        # {"status":"ok",...}

# Edge rate limit on sign-in: 11 x 401, then 429 (NGINX HTML page), even with spoofed headers
for i in $(seq 1 14); do
  curl -s -o /dev/null -w '%{http_code} ' -H "Origin: $B" -H "X-Forwarded-For: 203.0.113.$i" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"ghost$i@example.com\",\"password\":\"Wrong-Passw0rd!\"}" $B/api/auth/login
done; echo

# Body limits: 413 from NGINX
head -c 2000000 /dev/zero | tr '\0' a | sed 's/^/{"x":"/;s/$/"}/' > /tmp/b.json
curl -s -o /dev/null -w '%{http_code}\n' -H 'Content-Type: application/json' \
  --data-binary @/tmp/b.json $B/api/notifications/read-all                  # 413
rm /tmp/b.json
```

Wait about one minute after the rate-limit check before running the remaining checks; the sign-in budget refills at 10 per minute.

**Spoofed client IP is ignored (Phase 9).** Sign in once through the browser while a test client sends `X-Forwarded-For: 198.51.100.7`. Then confirm the API recorded the real address and not the spoofed one:

```sql
select ip_address, created_at from refresh_sessions order by created_at desc limit 1;
```

**Browser checks**, logged in as a real user:

- The browser developer console shows **no** "Content Security Policy" errors while you sign in, open a task, open an attachment and save a review.
- Cookies include `sdp_access`, `sdp_refresh`, `sdp_csrf`, and `sdp_device` (HttpOnly, SameSite=Strict, path `/api/auth/login`).
- Sign-out, then sign-in again works.
- A password-reset email arrives, and its link opens `/set-password` on the production host.

Two failed requests on a fresh browser before sign-in are normal: `/api/auth/me` returns 401 and the silent `/api/auth/refresh` returns 403 (no session yet).

**Done when** every check above matches its expected result.

## Phase 11: Go-live and post-launch controls

| Threat                                  | Control                                                                                                                                               |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Password guessing / credential stuffing | fail2ban jails on NGINX `429`s and on repeated `401`s for `/api/auth/login`; ban for hours                                                            |
| Lockout abuse                           | Already handled in the API: a browser that signed in before keeps its own sign-in budget (device cookie, VAPT SDP-VAPT-004)                           |
| Web attacks and scanners                | Optional ModSecurity with the OWASP Core Rule Set: detection mode first, then blocking once false positives are tuned                                 |
| Unpatched host                          | `unattended-upgrades` (Phase 4); review NGINX and Node updates monthly                                                                                |
| Silent abuse or outage                  | Ship NGINX and `journalctl -u sdp-api` logs to central storage; alert on spikes of `429`/`RATE_LIMITED`, `401` and `5xx`, and on health-check failure |
| Data loss                               | Neon PITR on; run a restore drill to a scratch branch once before go-live and then quarterly                                                          |
| Certificate expiry                      | Certbot timer plus an external expiry monitor (alert 14 days before)                                                                                  |
| Secret leakage                          | Secrets only in `/etc/sdp/api.env` and the owner's vault; rotate on staff change or any suspected exposure                                            |

**Done when** alerts reach a named person and the first restore drill has passed.

## Phase 12: Rollback

```bash
ls -1t /srv/sdp/releases | head                      # pick the previous release
sudo ln -sfn /srv/sdp/releases/<previous> /srv/sdp/current
sudo systemctl restart sdp-api
sudo systemctl reload nginx                          # serves the previous web build
curl -s https://portal.example.com/api/health
```

- Database changes are additive only (Phase 3), so the previous release still runs against the current schema.
- If a schema patch itself is the problem, restore from Neon PITR to a new branch and switch `DATABASE_URL`. Never edit production data by hand.

## Phase 13: Before scaling out or the next hardening round

- **More than one API instance:** move the in-memory rate limiter to a shared store such as Redis first. Otherwise each instance has its own limits (VAPT SDP-VAPT-009).
- **Dependencies:** upgrade `express`/`proxy-addr`, `@nestjs/platform-express` and `prisma` (VAPT SDP-VAPT-005), then re-run Phase 10.
- **CI:** add a pipeline as a merge gate:
  - lint, typecheck, unit tests, sequential e2e, and `npm audit --omit=dev`
  - SHA-pinned actions and a least-privilege `permissions:` block
  - Dependabot and secret scanning
- **Remaining open VAPT items:** the submit race, the cross-task finding oracle, NUL-byte handling, list pagination, and production source maps. With the NGINX config the `.map` files are already hidden; the source fix is `sourcemap: false` in `apps/web/vite.config.ts` when the team decides.
