import { pathToFileURL } from 'node:url';
import { Prisma, PrismaClient, UserRole, UserStatus } from '@prisma/client';
import { hashPassword } from '@sales-ai/shared/security';
import { z } from 'zod';

export const BOOTSTRAP_CONFIRMATION = 'CREATE_INITIAL_ADMIN';

const bootstrapAdminSchema = z.object({
  DATABASE_URL: z.string().url().startsWith('postgresql://'),
  BOOTSTRAP_ADMIN_CONFIRM: z.literal(BOOTSTRAP_CONFIRMATION),
  BOOTSTRAP_ORGANIZATION_NAME: z.string().trim().min(1).max(200),
  BOOTSTRAP_ORGANIZATION_SLUG: z
    .string()
    .trim()
    .min(2)
    .max(63)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  BOOTSTRAP_ADMIN_NAME: z.string().trim().min(1).max(200),
  BOOTSTRAP_ADMIN_EMAIL: z
    .string()
    .trim()
    .email()
    .max(320)
    .transform((value) => value.toLowerCase()),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().min(12).max(200),
});

export type BootstrapAdminInput = z.infer<typeof bootstrapAdminSchema>;

export function parseBootstrapAdminInput(environment: NodeJS.ProcessEnv): BootstrapAdminInput {
  return bootstrapAdminSchema.parse(environment);
}

export async function bootstrapInitialAdmin(
  prisma: PrismaClient,
  input: BootstrapAdminInput,
): Promise<{ organizationId: string; userId: string }> {
  const passwordHash = await hashPassword(input.BOOTSTRAP_ADMIN_PASSWORD);

  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('sales-ai-initial-admin-bootstrap'))`;

      const existingUsers = await tx.user.count();
      if (existingUsers !== 0) {
        throw new Error(
          'Initial administrator bootstrap refused: one or more users already exist.',
        );
      }

      const existingOrganizations = await tx.organization.count();
      if (existingOrganizations !== 0) {
        throw new Error(
          'Initial administrator bootstrap refused: one or more organizations already exist.',
        );
      }

      const organization = await tx.organization.create({
        data: {
          name: input.BOOTSTRAP_ORGANIZATION_NAME,
          slug: input.BOOTSTRAP_ORGANIZATION_SLUG,
        },
      });
      const team = await tx.team.create({
        data: { organizationId: organization.id, name: '営業チーム' },
      });
      const user = await tx.user.create({
        data: {
          organizationId: organization.id,
          teamId: team.id,
          name: input.BOOTSTRAP_ADMIN_NAME,
          email: input.BOOTSTRAP_ADMIN_EMAIL,
          passwordHash,
          role: UserRole.admin,
          status: UserStatus.active,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: organization.id,
          userId: user.id,
          action: 'bootstrap.initial_admin_created',
          entityType: 'user',
          entityId: user.id,
          afterData: {
            organizationSlug: organization.slug,
            role: user.role,
            status: user.status,
          },
        },
      });

      return { organizationId: organization.id, userId: user.id };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

async function main(): Promise<void> {
  const input = parseBootstrapAdminInput(process.env);
  delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const prisma = new PrismaClient({ datasources: { db: { url: input.DATABASE_URL } } });
  try {
    const result = await bootstrapInitialAdmin(prisma, input);
    console.log(
      `Initial administrator created. organizationId=${result.organizationId} userId=${result.userId}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

const entryPoint = process.argv[1];
if (entryPoint && import.meta.url === pathToFileURL(entryPoint).href) {
  void main().catch((cause: unknown) => {
    const message = cause instanceof Error ? cause.message : 'Unknown bootstrap failure';
    console.error(message);
    process.exitCode = 1;
  });
}
