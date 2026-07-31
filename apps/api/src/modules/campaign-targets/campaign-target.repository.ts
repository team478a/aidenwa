import { type PrismaClient, UserRole } from '@sales-ai/database';

export function findDraftCampaign(prisma: PrismaClient, organizationId: string, id: string) {
  return prisma.campaign.findFirst({
    where: { id, organizationId, status: 'draft' },
  });
}

export function listSalesListMembers(prisma: PrismaClient, salesListId: string) {
  return prisma.salesListCompany.findMany({
    where: { salesListId, removedAt: null },
    include: {
      company: { include: { phoneNumbers: { where: { isPrimary: true, isDeleted: false } } } },
    },
    take: 10000,
  });
}

export function listCampaignTargets(
  prisma: PrismaClient,
  organizationId: string,
  campaignId: string,
  role: UserRole,
  userId: string,
) {
  return prisma.campaignTarget.findMany({
    where: {
      campaignId,
      organizationId,
      ...(role === UserRole.sales ? { ownerUserIdSnapshot: userId } : {}),
    },
    orderBy: { createdAt: 'asc' },
    take: 1000,
  });
}
