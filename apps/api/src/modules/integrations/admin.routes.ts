import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { Prisma, UserRole } from '@sales-ai/database';
import { requestMetadata, writeAudit } from '../../audit.js';
import type { ProductControllerDependencies } from '../products/product.controller.js';
import { createCallProfileSchema, createIntegrationClientSchema } from './schemas.js';
import { issueApiKey } from './security.js';
import { deriveWebhookSecret, hashWebhookSecret } from '@sales-ai/shared';
import { enqueueOutbox } from '../../outbox.js';

export function registerIntegrationAdminRoutes(
  app: FastifyInstance,
  deps: ProductControllerDependencies & { webhookMasterKey: string },
) {
  app.post('/api/v1/integrations/clients', async (request, reply) => {
    const auth = await deps.authorize(request, reply, [UserRole.admin]);
    if (!auth || !deps.verifyCsrf(request, reply, auth)) return;
    const input = createIntegrationClientSchema.parse(request.body);
    const key = issueApiKey(input.environment);
    const clientId = randomUUID();
    const webhookSecret = deriveWebhookSecret(deps.webhookMasterKey, clientId);
    const client = await deps.prisma.integrationClient.create({
      data: {
        id: clientId,
        organizationId: auth.organizationId,
        name: input.name,
        environment: input.environment,
        apiKeyHash: key.apiKeyHash,
        apiKeyPrefix: key.apiKeyPrefix,
        allowedScopes: input.allowedScopes,
        allowedCallProfiles: input.allowedCallProfiles,
        allowedIps: input.allowedIps,
        dailyCallLimit: input.dailyCallLimit,
        concurrentCallLimit: input.concurrentCallLimit,
        ...(input.webhookEndpoint
          ? {
              webhookEndpoint: input.webhookEndpoint,
              webhookSecretHash: hashWebhookSecret(webhookSecret),
            }
          : {}),
        createdBy: auth.userId,
      },
      select: {
        id: true,
        name: true,
        environment: true,
        status: true,
        apiKeyPrefix: true,
        allowedScopes: true,
        allowedCallProfiles: true,
        createdAt: true,
      },
    });
    await writeAudit(deps.prisma, {
      organizationId: auth.organizationId,
      userId: auth.userId,
      action: 'integration_client.created',
      entityType: 'integration_client',
      entityId: client.id,
      afterData: client,
      ...requestMetadata(request),
    });
    return reply.code(201).send({
      client,
      apiKey: key.apiKey,
      ...(input.webhookEndpoint ? { webhookSecret } : {}),
    });
  });

  app.post('/api/v1/integrations/call-profiles', async (request, reply) => {
    const auth = await deps.authorize(request, reply, [UserRole.admin]);
    if (!auth || !deps.verifyCsrf(request, reply, auth)) return;
    const input = createCallProfileSchema.parse(request.body);
    const [product, agent, scenario, knowledge] = await Promise.all([
      deps.prisma.productVersion.findFirst({
        where: {
          id: input.productVersionId,
          organizationId: auth.organizationId,
          status: 'published',
        },
      }),
      deps.prisma.aiAgentVersion.findFirst({
        where: {
          id: input.aiAgentVersionId,
          organizationId: auth.organizationId,
          status: 'published',
        },
      }),
      deps.prisma.scenarioVersion.findFirst({
        where: {
          id: input.scenarioVersionId,
          organizationId: auth.organizationId,
          status: 'published',
        },
      }),
      input.knowledgeBaseId
        ? deps.prisma.knowledgeBase.findFirst({
            where: { id: input.knowledgeBaseId, organizationId: auth.organizationId },
          })
        : Promise.resolve(null),
    ]);
    if (!product || !agent || !scenario || (input.knowledgeBaseId && !knowledge))
      return deps.error(reply, 400, 'VALIDATION_ERROR', '公開済みの内部設定を指定してください');
    const data: Prisma.CallProfileUncheckedCreateInput = {
      organizationId: auth.organizationId,
      publicId: input.publicId,
      name: input.name,
      description: input.description,
      environment: input.environment,
      productVersionId: input.productVersionId,
      aiAgentVersionId: input.aiAgentVersionId,
      scenarioVersionId: input.scenarioVersionId,
      ...(input.knowledgeBaseId ? { knowledgeBaseId: input.knowledgeBaseId } : {}),
      timezone: input.timezone,
      callableWeekdays: input.callableWeekdays,
      callableStartTime: input.callableStartTime,
      callableEndTime: input.callableEndTime,
      dailyCallLimit: input.dailyCallLimit,
      concurrentCallLimit: input.concurrentCallLimit,
      status: input.status,
      createdBy: auth.userId,
    };
    const profile = await deps.prisma.callProfile.create({ data });
    await writeAudit(deps.prisma, {
      organizationId: auth.organizationId,
      userId: auth.userId,
      action: 'call_profile.created',
      entityType: 'call_profile',
      entityId: profile.id,
      afterData: {
        publicId: profile.publicId,
        environment: profile.environment,
        status: profile.status,
      },
      ...requestMetadata(request),
    });
    return reply.code(201).send({ profile });
  });

  app.get('/api/v1/integrations/clients', async (request, reply) => {
    const auth = await deps.authorize(request, reply, [UserRole.admin]);
    if (!auth) return;
    return {
      clients: await deps.prisma.integrationClient.findMany({
        where: { organizationId: auth.organizationId },
        select: {
          id: true,
          name: true,
          environment: true,
          status: true,
          apiKeyPrefix: true,
          allowedScopes: true,
          dailyCallLimit: true,
          concurrentCallLimit: true,
          webhookEndpoint: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    };
  });

  app.get('/api/v1/integrations/call-profiles', async (request, reply) => {
    const auth = await deps.authorize(request, reply, [UserRole.admin]);
    if (!auth) return;
    return {
      profiles: await deps.prisma.callProfile.findMany({
        where: { organizationId: auth.organizationId },
        orderBy: { createdAt: 'desc' },
      }),
    };
  });

  app.get('/api/v1/integrations/webhook-deliveries', async (request, reply) => {
    const auth = await deps.authorize(request, reply, [UserRole.admin]);
    if (!auth) return;
    return {
      deliveries: await deps.prisma.externalWebhookDelivery.findMany({
        where: { webhookEvent: { organizationId: auth.organizationId } },
        include: {
          webhookEvent: { select: { publicId: true, eventType: true, createdAt: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    };
  });

  app.post<{ Params: { id: string } }>(
    '/api/v1/integrations/webhook-deliveries/:id/retry',
    async (request, reply) => {
      const auth = await deps.authorize(request, reply, [UserRole.admin]);
      if (!auth || !deps.verifyCsrf(request, reply, auth)) return;
      const delivery = await deps.prisma.externalWebhookDelivery.findFirst({
        where: { id: request.params.id, webhookEvent: { organizationId: auth.organizationId } },
        include: { webhookEvent: true },
      });
      if (!delivery) return deps.error(reply, 404, 'NOT_FOUND', 'Deliveryが見つかりません');
      await deps.prisma.$transaction(async (tx) => {
        await tx.externalWebhookDelivery.update({
          where: { id: delivery.id },
          data: { status: 'retrying', nextAttemptAt: new Date(), failureCode: null },
        });
        await enqueueOutbox(tx, {
          organizationId: auth.organizationId,
          eventType: 'webhook-delivery',
          aggregateType: 'external_webhook_delivery',
          aggregateId: `${delivery.id}:manual:${randomUUID()}`,
          payload: { deliveryId: delivery.id },
        });
      });
      return reply.code(202).send({ status: 'retrying' });
    },
  );
}
