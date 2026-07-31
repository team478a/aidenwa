import { Prisma, type PrismaClient } from '@sales-ai/database';

export function findRunningCampaign(
  prisma: PrismaClient,
  organizationId: string,
  campaignId: string,
) {
  return prisma.campaign.findFirst({
    where: { id: campaignId, organizationId, status: 'running' },
  });
}

export function findNextEligibleTarget(
  prisma: PrismaClient,
  organizationId: string,
  campaignId: string,
) {
  return prisma.campaignTarget.findFirst({
    where: {
      campaignId,
      organizationId,
      status: { in: ['pending', 'retry_wait'] },
      eligibilityStatus: 'eligible',
    },
    orderBy: { priority: 'asc' },
  });
}

function callJobScope(organizationId: string, ownerUserId?: string): Prisma.CallJobWhereInput {
  return {
    organizationId,
    ...(ownerUserId ? { target: { ownerUserIdSnapshot: ownerUserId } } : {}),
  };
}

export function listCallJobs(prisma: PrismaClient, organizationId: string, ownerUserId?: string) {
  return prisma.callJob.findMany({
    where: callJobScope(organizationId, ownerUserId),
    include: { attempts: true, target: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
}

export function findCallJob(
  prisma: PrismaClient,
  organizationId: string,
  id: string,
  ownerUserId?: string,
) {
  return prisma.callJob.findFirst({
    where: { ...callJobScope(organizationId, ownerUserId), id },
    include: { attempts: { include: { events: true } }, target: true },
  });
}

export function findCallAttempt(
  prisma: PrismaClient,
  organizationId: string,
  id: string,
  ownerUserId?: string,
) {
  return prisma.callAttempt.findFirst({
    where: {
      id,
      organizationId,
      ...(ownerUserId ? { job: { target: { ownerUserIdSnapshot: ownerUserId } } } : {}),
    },
    include: { events: true, job: true },
  });
}
