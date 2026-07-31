import type { PrismaClient } from '@sales-ai/database';
import { agentVersionSchema, resourceInputSchema } from '@sales-ai/validation';

import { nextAiAgentVersion } from './ai-agent.repository.js';

type ResourceInput = ReturnType<typeof resourceInputSchema.parse>;
type AgentVersionInput = ReturnType<typeof agentVersionSchema.parse>;

export function createAiAgent(
  prisma: PrismaClient,
  organizationId: string,
  userId: string,
  input: ResourceInput,
) {
  return prisma.aiAgent.create({
    data: { organizationId, name: input.name, createdBy: userId },
  });
}

export function updateAiAgent(
  prisma: PrismaClient,
  organizationId: string,
  id: string,
  name?: string,
) {
  return prisma.aiAgent.updateMany({ where: { id, organizationId }, data: { name } });
}

export function archiveAiAgent(prisma: PrismaClient, organizationId: string, id: string) {
  return prisma.aiAgent.updateMany({
    where: { id, organizationId },
    data: { status: 'archived', archivedAt: new Date() },
  });
}

export async function createAiAgentVersion(
  prisma: PrismaClient,
  organizationId: string,
  userId: string,
  aiAgentId: string,
  input: AgentVersionInput,
) {
  return prisma.aiAgentVersion.create({
    data: {
      organizationId,
      aiAgentId,
      versionNumber: await nextAiAgentVersion(prisma, aiAgentId),
      createdBy: userId,
      ...input,
    },
  });
}

export function publishAiAgentVersion(
  prisma: PrismaClient,
  organizationId: string,
  userId: string,
  id: string,
) {
  return prisma.aiAgentVersion.updateMany({
    where: { id, organizationId, status: 'draft' },
    data: { status: 'published', publishedBy: userId, publishedAt: new Date() },
  });
}
