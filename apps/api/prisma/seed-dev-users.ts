/**
 * Adds a few development accounts to an existing database — safely.
 *
 *   npm run prisma:seed:dev-users --workspace @sdp/api
 *
 * - Creates a user ONLY when no account with that email exists. Existing rows
 *   are never updated, re-roled or reactivated, so it is safe to run against a
 *   shared database (Neon) and safe to run twice.
 * - Accounts start INVITED, with no password. The script prints a one-time
 *   set-password link for each new account (24 h); open it to choose a
 *   password through the real Set Password screen.
 * - Creates no Super Admin: the database allows exactly one, owned by the
 *   bootstrap seed (`prisma/seed.ts`) and the Transfer action.
 *
 * The people are a subset of the frontend's demo directory
 * (apps/web/src/mocks/data/users.json).
 */
import { createHash, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { loadConfiguration } from '../src/config/configuration.js';

if (existsSync('.env')) process.loadEnvFile('.env');
const config = loadConfiguration();

const DEV_USERS = [
  { email: 'dheliya.kankanamge@sebsaworld.com', name: 'Dheliya Kankanamge', roles: ['DEVELOPER'] },
  { email: 'kavidu.dilshan@sebsaworld.com', name: 'Kavidu Dilshan', roles: ['REVIEWER'] },
  {
    email: 'pinsara.chandika@sebsaworld.com',
    name: 'Pinsara Chandika',
    roles: ['DEVELOPER', 'REVIEWER'],
  },
  { email: 'qa.admin@sebsaworld.com', name: 'QA Normal Admin', roles: ['ADMIN'] },
] as const;

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const created: { email: string; url: string }[] = [];
  const skipped: string[] = [];

  for (const person of DEV_USERS) {
    const existing = await prisma.user.findFirst({
      where: { email: { equals: person.email, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existing) {
      skipped.push(person.email);
      continue;
    }

    const roles = await prisma.role.findMany({
      where: { code: { in: [...person.roles] }, deletedAt: null },
      select: { id: true },
    });
    if (roles.length !== person.roles.length) {
      throw new Error(
        `Roles ${person.roles.join(', ')} are not all present. Run the main seed first.`,
      );
    }

    const token = randomBytes(32).toString('base64url');
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: person.email,
          fullName: person.name,
          status: 'INVITED',
          userRoles: { create: roles.map((role) => ({ roleId: role.id })) },
        },
        select: { id: true },
      });
      await tx.passwordLink.create({
        data: {
          userId: user.id,
          purpose: 'INVITE',
          tokenHash: createHash('sha256').update(token, 'utf8').digest('hex'),
          expiresAt: new Date(Date.now() + config.passwordLinks.inviteTtlMs),
          emailStatus: 'SENT',
        },
      });
    });
    created.push({ email: person.email, url: `${config.appBaseUrl}/set-password#token=${token}` });
  }

  // A CLI's output is its interface; stdout keeps it out of the error stream.
  const write = (line: string) => process.stdout.write(`${line}\n`);
  for (const email of skipped) write(`skipped (already exists): ${email}`);
  for (const { email, url } of created) write(`invited ${email}\n  ${url}`);
  if (created.length === 0) write('No new accounts were needed.');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
