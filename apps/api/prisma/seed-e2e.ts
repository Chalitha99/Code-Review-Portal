/**
 * Deterministic data for the end-to-end suites (API e2e + Playwright).
 *
 *   node scripts/e2e-db.mjs reset    (runs this after migrating)
 *
 * Runs ONLY against a local, disposable database whose name contains "e2e" —
 * it refuses anything else, so it can never write to the shared Neon database.
 * Every account shares one password (`E2E_PASSWORD`).
 */
import { PrismaClient } from '@prisma/client';
import { argon2id, hash } from 'argon2';
import { E2E_PASSWORD, E2E_USERS } from './e2e-fixtures.js';

function assertDisposableDatabase(url: string | undefined): void {
  if (!url) throw new Error('DATABASE_URL is not set');
  const { hostname, pathname } = new URL(url);
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname) || !pathname.includes('e2e')) {
    throw new Error(
      `seed-e2e refuses ${hostname}${pathname}: only a local *e2e* database may be seeded.`,
    );
  }
}

const roles = [
  { code: 'DEVELOPER', name: 'Developer', description: 'Creates and submits development tasks.' },
  { code: 'REVIEWER', name: 'Reviewer', description: 'Reviews submitted development tasks.' },
  { code: 'ADMIN', name: 'Administrator', description: 'Administers users and master data.' },
  { code: 'SUPER_ADMIN', name: 'Super Administrator', description: 'Owns the portal.' },
];

const taskTypes = [
  { code: 'CUSTOMIZATION', name: 'Customization', displayOrder: 1 },
  { code: 'CONFIGURATION', name: 'Configuration', displayOrder: 2 },
  { code: 'LOBBY', name: 'Lobby', displayOrder: 3 },
];

async function main(): Promise<void> {
  assertDisposableDatabase(process.env['DATABASE_URL']);
  const prisma = new PrismaClient();
  try {
    for (const role of roles) {
      await prisma.role.upsert({ where: { code: role.code }, update: role, create: role });
    }
    const types = [];
    for (const taskType of taskTypes) {
      types.push(
        await prisma.taskType.upsert({
          where: { code: taskType.code },
          update: { ...taskType, isActive: true },
          create: taskType,
        }),
      );
    }

    const passwordHash = await hash(E2E_PASSWORD, {
      type: argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
    const roleIds = new Map(
      (await prisma.role.findMany()).map((role) => [role.code, role.id] as const),
    );
    for (const person of Object.values(E2E_USERS)) {
      const user = await prisma.user.upsert({
        where: { email: person.email },
        update: { passwordHash, status: 'ACTIVE', fullName: person.name, deletedAt: null },
        create: { email: person.email, fullName: person.name, passwordHash, status: 'ACTIVE' },
      });
      // Super Admin is exclusive and guarded by deferred database triggers: it
      // is granted on top of Admin and every other role is removed in the same
      // transaction (as prisma/seed.ts does).
      const isSuperAdmin = (person.roles as readonly string[]).includes('SUPER_ADMIN');
      const codes: readonly string[] = isSuperAdmin ? ['ADMIN', 'SUPER_ADMIN'] : person.roles;
      await prisma.$transaction(async (tx) => {
        for (const code of codes) {
          const roleId = roleIds.get(code);
          if (roleId === undefined) throw new Error(`Role ${code} is missing`);
          await tx.userRole.upsert({
            where: { userId_roleId: { userId: user.id, roleId } },
            update: {},
            create: { userId: user.id, roleId },
          });
        }
        const superAdminRoleId = roleIds.get('SUPER_ADMIN');
        if (isSuperAdmin && superAdminRoleId !== undefined) {
          await tx.userRole.deleteMany({
            where: { userId: user.id, roleId: { not: superAdminRoleId } },
          });
        }
      });
    }

    await prisma.customer.upsert({
      where: { code: 'E2ECUS' },
      update: {},
      create: {
        code: 'E2ECUS',
        name: 'E2E Customer',
        color: '#2563eb',
        description: 'Playwright data',
      },
    });

    const section = await prisma.checklistSection.upsert({
      where: { id: '00000000-0000-4000-8000-0000000e2e01' },
      update: {},
      create: { id: '00000000-0000-4000-8000-0000000e2e01', name: 'Code Quality', displayOrder: 1 },
    });
    for (const [index, taskType] of types.entries()) {
      await prisma.taskTypeChecklistSection.upsert({
        where: { taskTypeId_sectionId: { taskTypeId: taskType.id, sectionId: section.id } },
        update: {},
        create: { taskTypeId: taskType.id, sectionId: section.id, displayOrder: index + 1 },
      });
    }
    const checklistQuestions = [
      { id: '00000000-0000-4000-8000-0000000e2e11', questionText: 'Is the code formatted?' },
      { id: '00000000-0000-4000-8000-0000000e2e12', questionText: 'Were unit tests added?' },
    ];
    for (const [index, question] of checklistQuestions.entries()) {
      await prisma.checklistQuestion.upsert({
        where: { id: question.id },
        update: {},
        create: { ...question, sectionId: section.id, displayOrder: index + 1 },
      });
    }

    const generalCheck = [
      {
        id: '00000000-0000-4000-8000-0000000e2e21',
        questionText: 'Does the change meet the requirement?',
      },
      { id: '00000000-0000-4000-8000-0000000e2e22', questionText: 'Is error handling adequate?' },
    ];
    for (const [index, question] of generalCheck.entries()) {
      await prisma.codeReviewQuestion.upsert({
        where: { id: question.id },
        update: {},
        create: { ...question, sectionName: 'General Check', displayOrder: index + 1 },
      });
    }
    process.stdout.write(
      `Seeded ${String(Object.keys(E2E_USERS).length)} e2e users, 1 customer, 1 checklist.\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
