import { UserRole, type PrismaClient } from '@sales-ai/database';

export function listEmergencyStops(
  prisma: PrismaClient,
  auth: { role: UserRole; organizationId: string },
) {
  return prisma.emergencyStop.findMany({
    where:
      auth.role === UserRole.system_admin
        ? {}
        : { OR: [{ scope: 'system' }, { organizationId: auth.organizationId }] },
    orderBy: { activatedAt: 'desc' },
  });
}

export function findEmergencyStop(prisma: PrismaClient, id: string) {
  return prisma.emergencyStop.findUnique({ where: { id } });
}

export function releaseEmergencyStop(
  prisma: PrismaClient,
  id: string,
  userId: string,
  reason: string,
) {
  return prisma.emergencyStop.update({
    where: { id },
    data: {
      active: false,
      releasedBy: userId,
      releasedAt: new Date(),
      releaseReason: reason,
    },
  });
}
