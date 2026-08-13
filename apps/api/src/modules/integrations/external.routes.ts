import { createHmac, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createExternalCallWebhook, Prisma, type PrismaClient } from '@sales-ai/database';
import { inCallableWindow } from '@sales-ai/shared';
import { normalizePhoneNumber } from '@sales-ai/shared/stage2';
import { enqueueOutbox } from '../../outbox.js';
import { externalCallSchema, type IntegrationScope } from './schemas.js';
import { idempotencyKeyPattern, runIdempotentAction } from './idempotency.js';
import { hashApiKey, requestFingerprint } from './security.js';

type ExternalDeps = { prisma: PrismaClient; phoneFingerprintKey: string };
type ClientContext = {
  id: string;
  organizationId: string;
  environment: 'sandbox' | 'production';
  allowedCallProfiles: string[];
};

function externalError(reply: FastifyReply, status: number, code: string, message: string) {
  const requestId = `req_${randomUUID().replaceAll('-', '')}`;
  reply.header('x-request-id', requestId);
  return reply.code(status).send({ error: { code, message, request_id: requestId } });
}

async function authenticate(
  deps: ExternalDeps,
  request: FastifyRequest,
  reply: FastifyReply,
  scope: IntegrationScope,
): Promise<ClientContext | undefined> {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) {
    externalError(reply, 401, 'UNAUTHENTICATED', 'API Keyが必要です');
    return;
  }
  const apiKey = authorization.slice(7);
  if (!/^aid_(test|live)_[A-Za-z0-9_-]{32,}$/u.test(apiKey)) {
    externalError(reply, 401, 'INVALID_API_KEY', 'API Keyが正しくありません');
    return;
  }
  const client = await deps.prisma.integrationClient.findUnique({
    where: { apiKeyHash: hashApiKey(apiKey) },
  });
  if (!client) {
    externalError(reply, 401, 'INVALID_API_KEY', 'API Keyが正しくありません');
    return;
  }
  if (client.status !== 'active') {
    externalError(reply, 403, 'INTEGRATION_SUSPENDED', '外部連携は停止中です');
    return;
  }
  const allowedScopes = client.allowedScopes as IntegrationScope[];
  if (!allowedScopes.includes(scope)) {
    externalError(reply, 403, 'FORBIDDEN_SCOPE', 'この操作は許可されていません');
    return;
  }
  const allowedIps = client.allowedIps as string[];
  if (allowedIps.length && !allowedIps.includes(request.ip)) {
    externalError(reply, 403, 'INVALID_API_KEY', '接続元が許可されていません');
    return;
  }
  return {
    id: client.id,
    organizationId: client.organizationId,
    environment: client.environment,
    allowedCallProfiles: client.allowedCallProfiles as string[],
  };
}

export function registerExternalIntegrationRoutes(app: FastifyInstance, deps: ExternalDeps) {
  app.get('/api/external/v1/call-profiles', async (request, reply) => {
    const client = await authenticate(deps, request, reply, 'call-profiles:read');
    if (!client) return;
    const profiles = await deps.prisma.callProfile.findMany({
      where: {
        organizationId: client.organizationId,
        environment: client.environment,
        status: 'active',
        publicId: { in: client.allowedCallProfiles },
      },
      select: { publicId: true, name: true, description: true, environment: true },
      orderBy: { publicId: 'asc' },
    });
    return {
      profiles: profiles.map((profile) => ({
        id: profile.publicId,
        name: profile.name,
        description: profile.description,
        environment: profile.environment,
      })),
    };
  });

  app.post('/api/external/v1/calls', async (request, reply) => {
    const client = await authenticate(deps, request, reply, 'calls:create');
    if (!client) return;
    const idempotencyKey = request.headers['idempotency-key'];
    if (typeof idempotencyKey !== 'string' || !idempotencyKeyPattern.test(idempotencyKey))
      return externalError(reply, 400, 'VALIDATION_ERROR', 'Idempotency-Key UUIDが必要です');
    const parsed = externalCallSchema.safeParse(request.body);
    if (!parsed.success)
      return externalError(reply, 400, 'VALIDATION_ERROR', '入力内容を確認してください');
    const input = parsed.data;
    const hash = requestFingerprint(input);
    const prior = await deps.prisma.externalCallExecution.findUnique({
      where: {
        integrationClientId_idempotencyKey: {
          integrationClientId: client.id,
          idempotencyKey,
        },
      },
    });
    if (prior) {
      if (prior.requestHash !== hash)
        return externalError(
          reply,
          409,
          'IDEMPOTENCY_CONFLICT',
          '同じKeyで異なるRequestは送信できません',
        );
      return reply.code(202).send({
        call_id: prior.publicId,
        external_call_id: prior.externalCallId,
        status: 'accepted',
      });
    }
    if (!client.allowedCallProfiles.includes(input.call_profile_id))
      return externalError(
        reply,
        403,
        'CALL_PROFILE_NOT_AVAILABLE',
        'Call Profileを利用できません',
      );
    const profile = await deps.prisma.callProfile.findFirst({
      where: {
        organizationId: client.organizationId,
        publicId: input.call_profile_id,
        environment: client.environment,
        status: 'active',
      },
    });
    if (!profile)
      return externalError(
        reply,
        404,
        'CALL_PROFILE_NOT_AVAILABLE',
        'Call Profileを利用できません',
      );
    if (client.environment === 'production')
      return externalError(
        reply,
        403,
        'PRODUCTION_GATE_DENIED',
        'Production連携はまだ有効化されていません',
      );

    const normalized = normalizePhoneNumber(input.destination.phone);
    if (!normalized.isValid)
      return externalError(reply, 422, 'VALIDATION_ERROR', '電話番号が正しくありません');
    const executionAt =
      input.execution.mode === 'scheduled' ? new Date(input.execution.scheduled_at) : new Date();
    if (executionAt.getTime() < Date.now() - 60_000)
      return externalError(reply, 422, 'VALIDATION_ERROR', '過去の日時は指定できません');
    if (
      !inCallableWindow(
        executionAt,
        profile.callableWeekdays as number[],
        profile.callableStartTime,
        profile.callableEndTime,
        profile.timezone,
      )
    )
      return externalError(reply, 409, 'CALL_WINDOW_DENIED', '架電可能時間外です');

    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const [stop, optOut, dailyCalls, activeCalls, clientRecord] = await Promise.all([
      deps.prisma.emergencyStop.findFirst({
        where: {
          active: true,
          OR: [
            { scope: 'system' },
            { scope: 'organization', organizationId: client.organizationId },
          ],
        },
      }),
      deps.prisma.optOut.findFirst({
        where: {
          organizationId: client.organizationId,
          status: 'active',
          channel: { in: ['all', 'phone'] },
          normalizedPhoneSnapshot: normalized.normalizedNumber,
        },
      }),
      deps.prisma.externalCallExecution.count({
        where: { integrationClientId: client.id, acceptedAt: { gte: dayStart } },
      }),
      deps.prisma.externalCallExecution.count({
        where: {
          integrationClientId: client.id,
          status: { in: ['queued', 'calling', 'in_progress'] },
        },
      }),
      deps.prisma.integrationClient.findUniqueOrThrow({ where: { id: client.id } }),
    ]);
    if (stop) return externalError(reply, 409, 'EMERGENCY_STOP_ACTIVE', '緊急停止中です');
    if (optOut) return externalError(reply, 409, 'OPT_OUT', '発信禁止対象です');
    if (dailyCalls >= Math.min(clientRecord.dailyCallLimit, profile.dailyCallLimit))
      return externalError(reply, 429, 'CALL_LIMIT_EXCEEDED', '日次上限に達しました');
    if (activeCalls >= Math.min(clientRecord.concurrentCallLimit, profile.concurrentCallLimit))
      return externalError(reply, 429, 'CALL_LIMIT_EXCEEDED', '同時実行上限に達しました');

    const publicId = `aid_call_${randomUUID().replaceAll('-', '')}`;
    const phoneFingerprint = createHmac('sha256', deps.phoneFingerprintKey)
      .update(normalized.normalizedNumber)
      .digest('base64url');
    try {
      const call = await deps.prisma.$transaction(async (tx) => {
        const created = await tx.externalCallExecution.create({
          data: {
            publicId,
            organizationId: client.organizationId,
            integrationClientId: client.id,
            callProfileId: profile.id,
            externalCallId: input.external_call_id,
            externalCustomerId: input.external_customer_id,
            idempotencyKey,
            requestHash: hash,
            phoneFingerprint,
            phoneLast4: normalized.normalizedNumber.slice(-4),
            companyNameSnapshot: input.customer.company_name,
            contactNameSnapshot: input.customer.contact_name,
            contextSnapshot: input.context,
            status: input.execution.mode === 'scheduled' ? 'scheduled' : 'queued',
            scheduledAt: executionAt,
          },
        });
        await enqueueOutbox(tx, {
          organizationId: client.organizationId,
          eventType: 'external-call',
          aggregateType: 'external_call_execution',
          aggregateId: created.id,
          payload: { executionId: created.id, organizationId: client.organizationId },
          availableAt: executionAt,
        });
        await createExternalCallWebhook(tx, created, 'call.accepted', { status: 'accepted' });
        return created;
      });
      return reply.code(202).send({
        call_id: call.publicId,
        external_call_id: call.externalCallId,
        status: 'accepted',
      });
    } catch (cause) {
      if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === 'P2002') {
        const concurrent = await deps.prisma.externalCallExecution.findUnique({
          where: {
            integrationClientId_idempotencyKey: {
              integrationClientId: client.id,
              idempotencyKey,
            },
          },
        });
        if (concurrent?.requestHash === hash)
          return reply.code(202).send({
            call_id: concurrent.publicId,
            external_call_id: concurrent.externalCallId,
            status: 'accepted',
          });
        return externalError(reply, 409, 'IDEMPOTENCY_CONFLICT', '重複するRequestです');
      }
      throw cause;
    }
  });

  app.get<{ Params: { callId: string } }>(
    '/api/external/v1/calls/:callId',
    async (request, reply) => {
      const client = await authenticate(deps, request, reply, 'calls:read');
      if (!client) return;
      const call = await findClientCall(deps.prisma, client.id, request.params.callId);
      if (!call) return externalError(reply, 404, 'NOT_FOUND', 'Callが見つかりません');
      return {
        call_id: call.publicId,
        external_call_id: call.externalCallId,
        external_customer_id: call.externalCustomerId,
        status: call.status,
        accepted_at: call.acceptedAt.toISOString(),
        ...(call.startedAt ? { started_at: call.startedAt.toISOString() } : {}),
        ...(call.completedAt ? { completed_at: call.completedAt.toISOString() } : {}),
      };
    },
  );

  app.get<{ Params: { callId: string } }>(
    '/api/external/v1/calls/:callId/result',
    async (request, reply) => {
      const client = await authenticate(deps, request, reply, 'call-results:read');
      if (!client) return;
      const call = await findClientCall(deps.prisma, client.id, request.params.callId);
      if (!call) return externalError(reply, 404, 'NOT_FOUND', 'Callが見つかりません');
      if (
        !['completed', 'failed', 'skipped', 'cancelled', 'stopped', 'provider_unknown'].includes(
          call.status,
        )
      )
        return externalError(reply, 409, 'VALIDATION_ERROR', 'Call結果はまだ確定していません');
      return {
        call_id: call.publicId,
        external_call_id: call.externalCallId,
        status: call.status,
        result: call.result ?? resultFromTerminalStatus(call.status),
      };
    },
  );

  app.post<{ Params: { callId: string } }>(
    '/api/external/v1/calls/:callId/cancel',
    async (request, reply) =>
      handleCallAction(deps, request, reply, {
        scope: 'calls:cancel',
        operation: 'call.cancel',
        allowedStatuses: ['accepted', 'validating', 'scheduled', 'queued'],
        deniedCode: 'CALL_NOT_CANCELLABLE',
        targetStatus: 'cancelled',
      }),
  );

  app.post<{ Params: { callId: string } }>(
    '/api/external/v1/calls/:callId/stop',
    async (request, reply) =>
      handleCallAction(deps, request, reply, {
        scope: 'calls:stop',
        operation: 'call.stop',
        allowedStatuses: ['calling', 'in_progress'],
        deniedCode: 'CALL_NOT_STOPPABLE',
        targetStatus: 'stopped',
      }),
  );
}

async function findClientCall(prisma: PrismaClient, integrationClientId: string, publicId: string) {
  return prisma.externalCallExecution.findFirst({ where: { integrationClientId, publicId } });
}

async function handleCallAction(
  deps: ExternalDeps,
  request: FastifyRequest<{ Params: { callId: string } }>,
  reply: FastifyReply,
  action: {
    scope: IntegrationScope;
    operation: string;
    allowedStatuses: Array<
      'accepted' | 'validating' | 'scheduled' | 'queued' | 'calling' | 'in_progress'
    >;
    deniedCode: 'CALL_NOT_CANCELLABLE' | 'CALL_NOT_STOPPABLE';
    targetStatus: 'cancelled' | 'stopped';
  },
) {
  const client = await authenticate(deps, request, reply, action.scope);
  if (!client) return;
  if (
    request.body !== undefined &&
    (typeof request.body !== 'object' || request.body === null || Object.keys(request.body).length)
  )
    return externalError(reply, 400, 'VALIDATION_ERROR', 'この操作にRequest Bodyは指定できません');
  const idempotencyKey = request.headers['idempotency-key'];
  if (typeof idempotencyKey !== 'string' || !idempotencyKeyPattern.test(idempotencyKey))
    return externalError(reply, 400, 'VALIDATION_ERROR', 'Idempotency-Key UUIDが必要です');
  const replay = await runIdempotentAction(deps.prisma, reply, {
    integrationClientId: client.id,
    idempotencyKey,
    operation: action.operation,
    request: { callId: request.params.callId },
    execute: async (tx) => {
      const call = await tx.externalCallExecution.findFirst({
        where: { integrationClientId: client.id, publicId: request.params.callId },
      });
      if (!call) return { statusCode: 404, body: errorBody('NOT_FOUND', 'Callが見つかりません') };
      if (!action.allowedStatuses.includes(call.status as (typeof action.allowedStatuses)[number]))
        return {
          statusCode: 409,
          body: errorBody(action.deniedCode, '現在の状態では操作できません'),
        };
      const providerStateUnknown =
        action.targetStatus === 'stopped' && client.environment === 'production';
      const status = providerStateUnknown ? 'provider_unknown' : action.targetStatus;
      const updated = await tx.externalCallExecution.updateMany({
        where: { id: call.id, status: { in: action.allowedStatuses } },
        data: {
          status,
          completedAt: new Date(),
          ...(providerStateUnknown ? { errorCode: 'PROVIDER_STATE_UNKNOWN' } : {}),
        },
      });
      if (updated.count !== 1)
        return {
          statusCode: 409,
          body: errorBody(action.deniedCode, '現在の状態では操作できません'),
        };
      await createExternalCallWebhook(tx, call, `call.${status}`, { status });
      return {
        statusCode: 200,
        body: { call_id: call.publicId, external_call_id: call.externalCallId, status },
      };
    },
  });
  if (replay !== undefined) return replay;
  return externalError(
    reply,
    409,
    'IDEMPOTENCY_CONFLICT',
    '同じKeyで異なるRequestは送信できません',
  );
}

function errorBody(code: string, message: string): Prisma.InputJsonObject {
  return {
    error: { code, message, request_id: `req_${randomUUID().replaceAll('-', '')}` },
  };
}

function resultFromTerminalStatus(status: string) {
  if (status === 'failed' || status === 'provider_unknown') return 'failed';
  return null;
}
