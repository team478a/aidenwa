import { type PrismaClient, UserRole } from '@sales-ai/database';

export function listCampaigns(prisma: PrismaClient, organizationId: string) {
  return prisma.campaign.findMany({
    where: { organizationId },
    orderBy: { updatedAt: 'desc' },
    take: 100,
  });
}

export function findCampaign(
  prisma: PrismaClient,
  organizationId: string,
  id: string,
  role?: UserRole,
  userId?: string,
) {
  return prisma.campaign.findFirst({
    where: { id, organizationId },
    include: {
      targets: {
        where: role === UserRole.sales ? { ownerUserIdSnapshot: userId } : {},
        take: 1000,
      },
      jobs: { include: { attempts: true }, take: 100 },
    },
  });
}

export async function campaignReferencesAreValid(
  prisma: PrismaClient,
  organizationId: string,
  input: {
    productVersionId: string;
    aiAgentVersionId: string;
    scenarioVersionId: string;
    salesListId: string;
    knowledgeBaseId?: string | null;
  },
) {
  const [product, agent, scenario, list, knowledge] = await Promise.all([
    prisma.productVersion.count({
      where: { id: input.productVersionId, organizationId, status: 'published' },
    }),
    prisma.aiAgentVersion.count({
      where: { id: input.aiAgentVersionId, organizationId, status: 'published' },
    }),
    prisma.scenarioVersion.count({
      where: {
        id: input.scenarioVersionId,
        organizationId,
        status: 'published',
        validationStatus: 'valid',
      },
    }),
    prisma.salesList.count({
      where: { id: input.salesListId, organizationId, isDeleted: false },
    }),
    input.knowledgeBaseId
      ? prisma.knowledgeBase.count({ where: { id: input.knowledgeBaseId, organizationId } })
      : Promise.resolve(1),
  ]);
  return product * agent * scenario * list * knowledge > 0;
}
