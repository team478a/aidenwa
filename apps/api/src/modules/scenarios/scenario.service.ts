import { Prisma, type PrismaClient } from '@sales-ai/database';
import { graphSchema, resourceInputSchema } from '@sales-ai/validation';

import { nextScenarioVersion } from './scenario.repository.js';
import { simulateScenario } from './scenario-simulator.js';
import { validateScenario } from './scenario-validator.js';

type ResourceInput = ReturnType<typeof resourceInputSchema.parse>;
type GraphInput = ReturnType<typeof graphSchema.parse>;

export function createScenario(
  prisma: PrismaClient,
  organizationId: string,
  userId: string,
  input: ResourceInput,
) {
  return prisma.conversationScenario.create({
    data: {
      organizationId,
      name: input.name,
      purpose: input.purpose ?? '',
      createdBy: userId,
    },
  });
}

export function updateScenario(
  prisma: PrismaClient,
  organizationId: string,
  id: string,
  name?: string,
) {
  return prisma.conversationScenario.updateMany({
    where: { id, organizationId },
    data: { name },
  });
}

export async function createScenarioVersion(
  prisma: PrismaClient,
  organizationId: string,
  userId: string,
  scenarioId: string,
) {
  return prisma.scenarioVersion.create({
    data: {
      organizationId,
      scenarioId,
      versionNumber: await nextScenarioVersion(prisma, scenarioId),
      createdBy: userId,
    },
  });
}

export async function saveScenarioGraph(
  prisma: PrismaClient,
  organizationId: string,
  id: string,
  graph: GraphInput,
) {
  const version = await prisma.scenarioVersion.findFirst({
    where: { id, organizationId, status: 'draft' },
  });
  if (!version) return false;
  await prisma.$transaction([
    prisma.scenarioEdge.deleteMany({ where: { scenarioVersionId: id } }),
    prisma.scenarioNode.deleteMany({ where: { scenarioVersionId: id } }),
  ]);
  await prisma.scenarioNode.createMany({
    data: graph.nodes.map((node) => ({
      organizationId,
      scenarioVersionId: id,
      ...node,
      extractionSchema: node.extractionSchema as Prisma.InputJsonObject,
      config: node.config as Prisma.InputJsonObject,
    })),
  });
  await prisma.scenarioEdge.createMany({
    data: graph.edges.map((edge) => ({ organizationId, scenarioVersionId: id, ...edge })),
  });
  await prisma.scenarioVersion.update({
    where: { id },
    data: {
      validationStatus: 'unvalidated',
      validationErrors: [],
      startNodeKey: graph.nodes.find((node) => node.nodeType === 'start')?.nodeKey,
    },
  });
  return true;
}

export function evaluateScenario(
  nodes: Parameters<typeof validateScenario>[0],
  edges: Parameters<typeof validateScenario>[1],
  intents?: string[],
) {
  const errors = validateScenario(nodes, edges);
  return { errors, simulation: intents ? simulateScenario(nodes, edges, intents) : undefined };
}

export function recordScenarioAction(
  prisma: PrismaClient,
  id: string,
  userId: string,
  action: 'validate' | 'publish',
  errors: string[],
) {
  return prisma.scenarioVersion.update({
    where: { id },
    data:
      action === 'publish' && !errors.length
        ? {
            validationStatus: 'valid',
            validationErrors: [],
            status: 'published',
            publishedBy: userId,
            publishedAt: new Date(),
          }
        : { validationStatus: errors.length ? 'invalid' : 'valid', validationErrors: errors },
  });
}
