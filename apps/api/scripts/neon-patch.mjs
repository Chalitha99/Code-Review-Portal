// @ts-check
/**
 * Applies an additive SQL patch to the shared Neon database, which has no Prisma
 * migration history (so `prisma migrate` must never run there).
 *
 *   npm run db:neon-patch -w @sdp/api -- prisma/neon-patches/<file>.sql            (dry run)
 *   npm run db:neon-patch -w @sdp/api -- prisma/neon-patches/<file>.sql --apply
 *
 * Refuses any statement that could change or remove existing data, and proves
 * afterwards that the existing notification rows and the row counts are unchanged.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.join(apiDir, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const file = args.find((arg) => !arg.startsWith('--'));
if (!file) {
  console.error('Usage: neon-patch <file.sql> [--apply]');
  process.exit(2);
}
const sqlPath = path.resolve(apiDir, file);
const sql = readFileSync(sqlPath, 'utf8');

const code = sql.replace(/--[^\n]*/g, ' ');
const forbidden = [
  /\bUPDATE\b/i,
  /\bDELETE\b/i,
  /\bINSERT\b/i,
  /\bDROP\b/i,
  /\bTRUNCATE\b/i,
  /\bRENAME\b/i,
  /\bALTER\s+TYPE\b/i,
  /\bALTER\s+COLUMN\b/i,
  /\bNOT\s+NULL\b/i,
  /\bDEFAULT\b/i,
  /\bCREATE\s+(OR\s+REPLACE\s+)?(FUNCTION|TRIGGER|RULE)\b/i,
];
const hit = forbidden.find((pattern) => pattern.test(code));
if (hit) {
  console.error(`Refused: the patch matches ${hit}. Neon patches must be additive only.`);
  process.exit(1);
}

function directUrl() {
  if (process.env['DIRECT_URL']) return process.env['DIRECT_URL'];
  const pooled = process.env['DATABASE_URL'];
  if (!pooled) throw new Error('Set DIRECT_URL or DATABASE_URL');
  const url = new URL(pooled);
  url.hostname = url.hostname.replace('-pooler.', '.');
  url.searchParams.delete('pgbouncer');
  return url.toString();
}

const url = directUrl();
const prisma = new PrismaClient({ datasourceUrl: url });

async function fingerprint() {
  const [row] = /** @type {Array<Record<string, unknown>>} */ (
    await prisma.$queryRaw`
      SELECT
        (SELECT count(*) FROM "users")::int AS users,
        (SELECT count(*) FROM "tasks")::int AS tasks,
        (SELECT count(*) FROM "notifications")::int AS notifications,
        (SELECT md5(coalesce(string_agg(t::text, '|' ORDER BY t.id), ''))
           FROM (SELECT id, task_id, recipient_id, notification_type, title, message, is_read,
                        read_at, email_sent, email_sent_at, created_at
                   FROM "notifications") AS t) AS notifications_md5`
  );
  return row;
}

try {
  console.log(`Target: ${new URL(url).hostname}${new URL(url).pathname}`);
  const before = await fingerprint();
  console.log('Before:', before);
  if (!apply) {
    console.log('Dry run. Re-run with --apply to execute:\n');
    console.log(sql);
    process.exit(0);
  }

  const prismaCli = createRequire(import.meta.url).resolve('prisma/build/index.js');
  execFileSync(
    process.execPath,
    [prismaCli, 'db', 'execute', '--file', sqlPath, '--schema', 'prisma/schema.prisma'],
    { cwd: apiDir, stdio: 'inherit', env: { ...process.env, DATABASE_URL: url } },
  );

  const after = await fingerprint();
  console.log('After: ', after);
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    console.error('Existing data changed — investigate immediately (restore point recommended).');
    process.exit(1);
  }
  console.log('Patch applied. Existing rows and counts are unchanged.');
} finally {
  await prisma.$disconnect();
}
