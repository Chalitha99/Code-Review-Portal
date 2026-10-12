// @ts-check
/**
 * A throwaway PostgreSQL database for the end-to-end suites.
 *
 *   node scripts/e2e-db.mjs up      start a private cluster (created on first use)
 *   node scripts/e2e-db.mjs reset   drop + recreate the e2e database, migrate deploy, seed-e2e
 *   node scripts/e2e-db.mjs down    stop the private cluster
 *
 * SAFETY: this only ever talks to `E2E_DATABASE_URL` (default
 * postgresql://postgres@127.0.0.1:55432/sdp_e2e). It never reads DATABASE_URL,
 * and `assertDisposableDatabase` refuses any host that is not this machine —
 * the shared Neon database can never be migrated, reset or seeded from here.
 *
 * `up` runs its own cluster (initdb + pg_ctl, trust auth, bound to 127.0.0.1)
 * in the OS temp folder, separate from any PostgreSQL service already
 * installed. In CI, point E2E_DATABASE_URL at a service container instead and
 * skip `up`/`down`.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_E2E_DATABASE_URL = 'postgresql://postgres@127.0.0.1:55432/sdp_e2e';
const databaseUrl = process.env['E2E_DATABASE_URL'] ?? DEFAULT_E2E_DATABASE_URL;
const dataDir = process.env['E2E_PG_DATA'] ?? path.join(tmpdir(), 'sdp-e2e-pgdata');

/** Throws unless `url` points at a database on this machine. */
export function assertDisposableDatabase(url) {
  const { hostname, pathname } = new URL(url);
  const local = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname);
  if (!local || hostname.includes('neon.tech')) {
    throw new Error(
      `Refusing to touch ${hostname}: the e2e database must be local and disposable.`,
    );
  }
  if (!pathname.includes('e2e')) {
    throw new Error(`Refusing database "${pathname.slice(1)}": its name must contain "e2e".`);
  }
}

function pgBin(name) {
  const exe = process.platform === 'win32' ? `${name}.exe` : name;
  const candidates = [
    process.env['PG_BIN'],
    ...(process.platform === 'win32'
      ? ['18', '17', '16', '15'].map((v) => `C:\\Program Files\\PostgreSQL\\${v}\\bin`)
      : ['/usr/lib/postgresql/16/bin', '/usr/local/bin', '/opt/homebrew/bin']),
  ].filter(Boolean);
  for (const dir of candidates) {
    const full = path.join(/** @type {string} */ (dir), exe);
    if (existsSync(full)) return full;
  }
  return exe; // fall back to PATH
}

function port() {
  return new URL(databaseUrl).port || '5432';
}

function isRunning() {
  const result = spawnSync(pgBin('pg_isready'), ['-h', '127.0.0.1', '-p', port()], {
    stdio: 'ignore',
  });
  return result.status === 0;
}

function up() {
  assertDisposableDatabase(databaseUrl);
  if (isRunning()) {
    console.log(`e2e PostgreSQL already accepting connections on port ${port()}`);
    return;
  }
  if (!existsSync(path.join(dataDir, 'PG_VERSION'))) {
    mkdirSync(dataDir, { recursive: true });
    execFileSync(
      pgBin('initdb'),
      ['-D', dataDir, '-U', 'postgres', '--auth=trust', '--encoding=UTF8', '--no-instructions'],
      { stdio: 'inherit' },
    );
  }
  execFileSync(
    pgBin('pg_ctl'),
    [
      '-D',
      dataDir,
      '-o',
      `-p ${port()} -c listen_addresses=127.0.0.1`,
      '-l',
      path.join(dataDir, 'server.log'),
      '-w',
      'start',
    ],
    // Not 'inherit': the server outlives pg_ctl and would hold the caller's
    // stdout open forever. Its output goes to server.log instead.
    { stdio: 'ignore' },
  );
  console.log(`e2e PostgreSQL started on 127.0.0.1:${port()} (data: ${dataDir})`);
}

function down() {
  if (!existsSync(path.join(dataDir, 'PG_VERSION'))) return;
  spawnSync(pgBin('pg_ctl'), ['-D', dataDir, '-m', 'fast', 'stop'], { stdio: 'inherit' });
}

/**
 * Recreates the e2e database: DROP + CREATE on the private local server, then
 * `prisma migrate deploy` (the repository's migrations, in order) and the e2e
 * seed. Never `prisma migrate reset`, and never any database but the guarded
 * local one.
 */
function reset() {
  assertDisposableDatabase(databaseUrl);
  const url = new URL(databaseUrl);
  const name = url.pathname.slice(1);
  const psql = (sql) =>
    execFileSync(
      pgBin('psql'),
      [
        '-h',
        url.hostname,
        '-p',
        port(),
        '-U',
        url.username || 'postgres',
        '-d',
        'postgres',
        '-v',
        'ON_ERROR_STOP=1',
        '-c',
        sql,
      ],
      { stdio: 'inherit' },
    );
  psql(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  psql(`CREATE DATABASE "${name}"`);

  // Only E2E_DATABASE_URL reaches Prisma; process env wins over apps/api/.env.
  const env = { ...process.env, DATABASE_URL: databaseUrl, E2E_DATABASE_URL: databaseUrl };
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const run = (args) =>
    execFileSync(npx, args, {
      cwd: apiDir,
      env,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
  run(['prisma', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma']);
  run(['tsx', 'prisma/seed-e2e.ts']);
}

const command = process.argv[2];
if (command === 'up') up();
else if (command === 'down') down();
else if (command === 'reset') reset();
else if (command !== undefined) {
  console.error(`Unknown command "${command}". Use up | reset | down.`);
  process.exit(1);
}
