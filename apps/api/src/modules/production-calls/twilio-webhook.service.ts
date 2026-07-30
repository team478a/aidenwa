import { createHash } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Prisma, type PrismaClient } from '@sales-ai/database';
import { twilioWebhookParamsSchema, type ApiEnv } from '@sales-ai/validation';
import { buildStage4B1Twiml } from '@sales-ai/voice-provider';
import { writeAudit } from '../../audit.js';
import { enqueueOutbox } from '../../outbox.js';
import { openProductionIncident } from './incident.service.js';
import { dtmfResult, mapTwilioState } from './production-call.policy.js';
import { productionProviderFromEnv } from './provider.js';

type WebhookDependencies = {
  prisma: PrismaClient;
  env: ApiEnv;
  error(reply: FastifyReply, code: number, key: string, message: string): unknown;
};

export function createTwilioWebhookHandler(deps: WebhookDependencies) {
  const { prisma, env } = deps;
  return (kind: 'twiml' | 'dtmf' | 'status') =>
    async (request: FastifyRequest, reply: FastifyReply) => {
      const executionId = (request.params as { executionId: string }).executionId;
      const execution = await prisma.realCallExecution.findUnique({ where: { id: executionId } });
      if (!execution)
        return deps.error(reply, 403, 'UNAPPROVED_CALL', '承認済み通話ではありません');
      const params = Object.fromEntries(
        Object.entries(request.body as Record<string, unknown>).filter(
          ([, value]) => typeof value === 'string',
        ),
      ) as Record<string, string>;
      const provider = productionProviderFromEnv(env);
      const signature = request.headers['x-twilio-signature'];
      const base =
        kind === 'status' ? env.TWILIO_STATUS_CALLBACK_BASE_URL : env.TWILIO_TWIML_BASE_URL;
      const url = `${base}${request.raw.url ?? ''}`;
      if (typeof signature !== 'string' || !provider.validateWebhook(signature, url, params)) {
        await writeAudit(prisma, {
          organizationId: execution.organizationId,
          action: 'twilio_webhook.signature_error',
          entityType: 'real_call_execution',
          entityId: execution.id,
          afterData: { kind },
        });
        await openProductionIncident(prisma, {
          organizationId: execution.organizationId,
          category: 'webhook_signature_invalid',
          entityType: 'real_call_execution',
          entityId: execution.id,
          summary: 'Twilio Webhook署名検証に失敗しました',
          details: { kind },
        });
        return deps.error(reply, 403, 'INVALID_SIGNATURE', 'Twilio署名が不正です');
      }
      const parsed = twilioWebhookParamsSchema.safeParse(params);
      if (
        !parsed.success ||
        (execution.providerCallId && parsed.data.CallSid !== execution.providerCallId)
      )
        return deps.error(reply, 403, 'INVALID_PROVIDER_EVENT', '通話相関が不正です');
      if (!execution.providerCallId && kind !== 'status') {
        if (!['reserved', 'provider_unknown'].includes(execution.state))
          return deps.error(reply, 403, 'INVALID_PROVIDER_EVENT', 'Call SIDを関連付けできません');
        await prisma.realCallExecution.update({
          where: { id: execution.id },
          data: {
            providerCallId: parsed.data.CallSid,
            providerCallIdFingerprint: `${parsed.data.CallSid.slice(0, 4)}…${parsed.data.CallSid.slice(-4)}`,
          },
        });
      }
      if (kind === 'twiml') {
        reply.type('application/xml');
        return reply.send(
          buildStage4B1Twiml(
            `${env.TWILIO_TWIML_BASE_URL}/api/v1/twilio/dtmf/${execution.id}?retry=0`,
            env.TWILIO_VOICE_NAME,
          ),
        );
      }
      if (kind === 'dtmf') {
        const result = dtmfResult(parsed.data.Digits);
        const retry = (request.query as { retry?: string }).retry === '1';
        if (result === 'test_no_input' && !retry) {
          reply.type('application/xml');
          return reply.send(
            buildStage4B1Twiml(
              `${env.TWILIO_TWIML_BASE_URL}/api/v1/twilio/dtmf/${execution.id}?retry=1`,
              env.TWILIO_VOICE_NAME,
              true,
            ),
          );
        }
        await prisma.$transaction(async (tx) => {
          await tx.realCallExecution.update({
            where: { id: execution.id },
            data: { dtmfResult: result },
          });
          if (result === 'test_stop_requested') {
            await tx.testCallAllowlist.update({
              where: { id: execution.allowlistId },
              data: { active: false },
            });
            await tx.realCallExecution.updateMany({
              where: { allowlistId: execution.allowlistId, state: 'reserved' },
              data: { state: 'canceled' },
            });
          }
        });
        reply.type('application/xml');
        return reply.send(
          '<Response><Say language="ja-JP">入力を記録しました。テストを終了します。</Say><Hangup/></Response>',
        );
      }
      const state = mapTwilioState(parsed.data.CallStatus);
      const fingerprint = createHash('sha256')
        .update(
          JSON.stringify({
            status: parsed.data.CallStatus ?? 'unknown',
            sequence: parsed.data.SequenceNumber ?? 0,
            duration: parsed.data.CallDuration ?? null,
            price: parsed.data.Price ?? null,
            currency: parsed.data.PriceUnit ?? null,
          }),
        )
        .digest('hex')
        .slice(0, 24);
      const eventKey = `${parsed.data.CallSid}:${parsed.data.CallStatus ?? 'unknown'}:${parsed.data.SequenceNumber ?? 0}:${fingerprint}`;
      const finalCost = parsed.data.Price
        ? Math.ceil(Math.abs(Number(parsed.data.Price)) * 100)
        : undefined;
      try {
        await prisma.$transaction(async (tx) => {
          const event = await tx.providerWebhookEvent.create({
            data: {
              organizationId: execution.organizationId,
              provider: 'twilio',
              providerEventId: eventKey,
              eventType: `twilio.${parsed.data.CallStatus ?? 'unknown'}`,
              eventTimestamp: new Date(),
              sequenceNumber: parsed.data.SequenceNumber ?? null,
              normalizedData: {
                executionId: execution.id,
                callSid: parsed.data.CallSid,
                state,
                callFingerprint: `${parsed.data.CallSid.slice(0, 4)}…${parsed.data.CallSid.slice(-4)}`,
                ...(finalCost !== undefined ? { priceMinor: finalCost } : {}),
                ...(parsed.data.PriceUnit ? { currency: parsed.data.PriceUnit } : {}),
              },
              processingStatus: 'received',
            },
          });
          await enqueueOutbox(tx, {
            organizationId: execution.organizationId,
            eventType: 'provider-webhook',
            aggregateType: 'provider_webhook_event',
            aggregateId: event.id,
            payload: { eventId: event.id },
          });
        });
      } catch (cause) {
        if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === 'P2002')
          return reply.code(204).send();
        throw cause;
      }
      return reply.code(204).send();
    };
}
