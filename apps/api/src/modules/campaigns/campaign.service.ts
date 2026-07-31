import type { PrismaClient } from '@sales-ai/database';
import { campaignSchema } from '@sales-ai/validation';
import { campaignStatusFor, type CampaignAction } from './campaign.policy.js';

type CampaignInput = ReturnType<typeof campaignSchema.parse>;

export function createCampaign(
  prisma: PrismaClient,
  organizationId: string,
  userId: string,
  input: CampaignInput,
) {
  return prisma.campaign.create({
    data: { organizationId, createdBy: userId, ...input },
  });
}

export function updateDraftCampaign(
  prisma: PrismaClient,
  organizationId: string,
  id: string,
  input: Partial<CampaignInput>,
) {
  return prisma.campaign.updateMany({
    where: { id, organizationId, status: 'draft' },
    data: input,
  });
}

export async function transitionCampaign(
  prisma: PrismaClient,
  id: string,
  userId: string,
  action: CampaignAction,
) {
  const status = campaignStatusFor(action);
  const campaign = await prisma.campaign.update({
    where: { id },
    data: {
      status,
      ...(action === 'approve' ? { approvedBy: userId, approvedAt: new Date() } : {}),
      ...(action === 'start' ? { startedAt: new Date() } : {}),
      ...(action === 'pause' ? { pausedAt: new Date() } : {}),
    },
  });
  if (action === 'cancel')
    await prisma.campaignTarget.updateMany({
      where: { campaignId: id, status: { notIn: ['completed', 'excluded'] } },
      data: { status: 'cancelled' },
    });
  return campaign;
}
