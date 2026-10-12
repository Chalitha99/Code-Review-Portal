import { PrismaClient } from '@prisma/client';
import { argon2id, hash } from 'argon2';

const prisma = new PrismaClient();

const roles = [
  { code: 'DEVELOPER', name: 'Developer', description: 'Creates and submits development tasks.' },
  { code: 'REVIEWER', name: 'Reviewer', description: 'Reviews submitted development tasks.' },
  {
    code: 'ADMIN',
    name: 'Administrator',
    description: 'Administers users, assignments, and master data.',
  },
  {
    code: 'SUPER_ADMIN',
    name: 'Super Administrator',
    description: 'Manages portal users and grants all available roles.',
  },
];

const taskTypes = [
  { code: 'CUSTOMIZATION', name: 'Customization' },
  { code: 'CONFIGURATION', name: 'Configuration' },
  { code: 'LOBBY', name: 'Lobby' },
  { code: 'QUICK_REPORT', name: 'Quick Report' },
  { code: 'UPGRADE_SERVICE', name: 'Upgrade Service' },
];

async function main(): Promise<void> {
  await prisma.$transaction([
    ...roles.map((role) =>
      prisma.role.upsert({ where: { code: role.code }, update: role, create: role }),
    ),
    ...taskTypes.map((taskType) =>
      prisma.taskType.upsert({
        where: { code: taskType.code },
        update: { ...taskType, isActive: true },
        create: taskType,
      }),
    ),
  ]);

  const adminEmail = process.env['BOOTSTRAP_ADMIN_EMAIL']?.trim().toLowerCase();
  const adminPassword = process.env['BOOTSTRAP_ADMIN_PASSWORD'];
  const adminName = process.env['BOOTSTRAP_ADMIN_NAME']?.trim();
  if (adminEmail && adminPassword) {
    if (adminPassword.length < 12)
      throw new Error('BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters');
    const passwordHash = await hash(adminPassword, {
      type: argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
    const admin = await prisma.user.upsert({
      where: { email: adminEmail },
      update: { passwordHash, status: 'ACTIVE' },
      create: {
        email: adminEmail,
        fullName: adminName ?? 'Initial Administrator',
        passwordHash,
      },
    });
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: 'ADMIN' } });
    const developerRole = await prisma.role.findUniqueOrThrow({ where: { code: 'DEVELOPER' } });
    for (const role of [developerRole, adminRole]) {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: admin.id, roleId: role.id } },
        update: {},
        create: { userId: admin.id, roleId: role.id },
      });
    }
  }

  const superAdminEmail = process.env['BOOTSTRAP_SUPER_ADMIN_EMAIL']?.trim().toLowerCase();
  const superAdminPassword = process.env['BOOTSTRAP_SUPER_ADMIN_PASSWORD'];
  const superAdminName = process.env['BOOTSTRAP_SUPER_ADMIN_NAME']?.trim();
  if (superAdminEmail && superAdminPassword) {
    if (superAdminPassword.length < 12) {
      throw new Error('BOOTSTRAP_SUPER_ADMIN_PASSWORD must be at least 12 characters');
    }
    const passwordHash = await hash(superAdminPassword, {
      type: argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
    const superAdmin = await prisma.user.upsert({
      where: { email: superAdminEmail },
      update: { passwordHash, status: 'ACTIVE' },
      create: {
        email: superAdminEmail,
        fullName: superAdminName ?? 'Initial Super Administrator',
        passwordHash,
      },
    });
    const [adminRole, superAdminRole] = await Promise.all([
      prisma.role.findUniqueOrThrow({ where: { code: 'ADMIN' } }),
      prisma.role.findUniqueOrThrow({ where: { code: 'SUPER_ADMIN' } }),
    ]);
    await prisma.$transaction(async (tx) => {
      const alreadySuperAdmin = await tx.userRole.findUnique({
        where: { userId_roleId: { userId: superAdmin.id, roleId: superAdminRole.id } },
      });
      if (!alreadySuperAdmin) {
        await tx.userRole.upsert({
          where: { userId_roleId: { userId: superAdmin.id, roleId: adminRole.id } },
          update: {},
          create: { userId: superAdmin.id, roleId: adminRole.id },
        });
        await tx.userRole.create({
          data: { userId: superAdmin.id, roleId: superAdminRole.id },
        });
      }
      await tx.userRole.deleteMany({
        where: { userId: superAdmin.id, roleId: { not: superAdminRole.id } },
      });
    });
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
