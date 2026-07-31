import { randomUUID } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { evaluateProductionGate, type PrismaClient } from '@sales-ai/database';
import type { ApiEnv } from '@sales-ai/validation';
import { buildTwilioMediaStreamTwiml, signRealtimeSessionToken } from '@sales-ai/realtime';
import { validateTwilioMediaSignature } from '../token/realtime-token.policy.js';
import { realtimeActivationBlockers } from './media-stream.policy.js';
import { loadMediaGateContext } from './media-stream.repository.js';

export function createMediaStreamTwimlController(deps: { prisma: PrismaClient; env: ApiEnv }) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const { prisma, env } = deps;
    const executionId = (request.params as { executionId: string }).executionId;
    const externalBase = env.TWILIO_TWIML_BASE_URL;
    const signature = request.headers['x-twilio-signature'];
    if (
      !externalBase ||
      typeof signature !== 'string' ||
      !validateTwilioMediaSignature(
        env,
        signature,
        `${externalBase}/api/v1/twilio/realtime/twiml/${executionId}`,
      )
    )
      return reply.code(403).send();
    if (realtimeActivationBlockers(env).length)
      return reply.code(409).send({ error: { code: 'REALTIME_DISABLED' } });
    const tokenSecret = env.REALTIME_SESSION_TOKEN_SECRET;
    const mediaBaseUrl = env.TWILIO_MEDIA_STREAM_BASE_URL;
    if (!tokenSecret || !mediaBaseUrl) return reply.code(409).send();
    const context = await loadMediaGateContext(prisma, executionId);
    if (!context) return reply.code(404).send();
    const gate = await evaluateProductionGate(prisma, context.gateInput);
    if (!gate.allowed) return reply.code(409).send({ error: { code: 'PRODUCTION_GATE_REJECTED' } });
    const session = await prisma.realtimeCallSession.upsert({
      where: { id: executionId },
      create: {
        id: executionId,
        organizationId: context.execution.organizationId,
        campaignId: context.execution.campaignId,
        executionId,
        provider: 'openai',
      },
      update: {},
    });
    const token = signRealtimeSessionToken(
      {
        sessionId: session.id,
        organizationId: session.organizationId,
        executionId,
        purpose: 'twilio_media_stream',
        expiresAt: Date.now() + 60_000,
        nonce: randomUUID(),
      },
      tokenSecret,
    );
    const streamUrl = new URL(
      `/api/v1/twilio/realtime/media/${session.id}`,
      mediaBaseUrl,
    ).toString();
    reply.type('text/xml');
    return buildTwilioMediaStreamTwiml({
      enabled: true,
      websocketUrl: streamUrl,
      sessionToken: token,
    });
  };
}
