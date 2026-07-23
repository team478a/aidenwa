import { PrismaClient, UserRole, UserStatus } from '@prisma/client';
import { hashPassword } from '@sales-ai/shared/security';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url:
        process.env.DATABASE_URL ??
        'postgresql://sales_ai:sales_ai_dev@localhost:5432/sales_ai?schema=public',
    },
  },
});

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for development seed`);
  return value;
}

const credentials = [
  {
    name: 'システム管理者',
    email: process.env.SEED_SYSTEM_ADMIN_EMAIL ?? 'system-admin@example.local',
    password: required('SEED_SYSTEM_ADMIN_PASSWORD'),
    role: UserRole.system_admin,
  },
  {
    name: '管理者',
    email: process.env.SEED_ADMIN_EMAIL ?? 'admin@example.local',
    password: required('SEED_ADMIN_PASSWORD'),
    role: UserRole.admin,
  },
  {
    name: 'マネージャー',
    email: process.env.SEED_MANAGER_EMAIL ?? 'manager@example.local',
    password: required('SEED_MANAGER_PASSWORD'),
    role: UserRole.manager,
  },
  {
    name: '営業担当',
    email: process.env.SEED_SALES_EMAIL ?? 'sales@example.local',
    password: required('SEED_SALES_PASSWORD'),
    role: UserRole.sales,
  },
] as const;

async function main() {
  const organization = await prisma.organization.upsert({
    where: { slug: process.env.DEFAULT_ORGANIZATION_SLUG ?? 'internal' },
    update: {},
    create: { name: '自社組織', slug: process.env.DEFAULT_ORGANIZATION_SLUG ?? 'internal' },
  });
  const team = await prisma.team.upsert({
    where: { organizationId_name: { organizationId: organization.id, name: '営業チーム' } },
    update: {},
    create: { organizationId: organization.id, name: '営業チーム' },
  });
  const users = new Map<UserRole, string>();
  for (const credential of credentials) {
    const passwordHash = await hashPassword(credential.password);
    const user = await prisma.user.upsert({
      where: {
        organizationId_email: {
          organizationId: organization.id,
          email: credential.email.toLowerCase(),
        },
      },
      update: {
        name: credential.name,
        role: credential.role,
        status: UserStatus.active,
        teamId: team.id,
        passwordHash,
      },
      create: {
        organizationId: organization.id,
        teamId: team.id,
        name: credential.name,
        email: credential.email.toLowerCase(),
        passwordHash,
        role: credential.role,
        status: UserStatus.active,
      },
    });
    users.set(credential.role, user.id);
  }
  const managerUserId = users.get(UserRole.manager);
  if (!managerUserId) throw new Error('Manager seed user was not created');
  await prisma.team.update({
    where: { id: team.id },
    data: { managerUserId },
  });
  console.log(
    `Seeded organization ${organization.slug} with ${credentials.length} development users.`,
  );
}

void main()
  .catch((cause: unknown) => {
    console.error(cause);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
