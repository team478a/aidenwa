import type { FastifyReply, FastifyRequest } from 'fastify';
import { evaluateProductionGate, type PrismaClient } from '@sales-ai/database';
import type { ApiEnv } from '@sales-ai/validation';
import { validateTwilioMediaSignature } from '../token/realtime-token.policy.js';
import { auditMediaSession } from './media-stream-audit.service.js';
import { realtimeActivationBlockers } from './media-stream.policy.js';
import { loadMediaGateContext } from './media-stream.repository.js';

export function createMediaStreamPreValidation(deps: { prisma: PrismaClient; env: ApiEnv }) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const { prisma, env } = deps;
    const sessionId = (request.params as { sessionId: string }).sessionId;
    if (realtimeActivationBlockers(env).length) {
      await auditMediaSession(prisma, request, undefined, sessionId, 'realtime.gate_rejected');
      return reply.code(403).send();
    }
    const mediaBaseUrl = env.TWILIO_MEDIA_STREAM_BASE_URL;
    const signature = request.headers['x-twilio-signature'];
    if (
      !mediaBaseUrl ||
      typeof signature !== 'string' ||
      !validateTwilioMediaSignature(
        env,
        signature,
        new URL(`/api/v1/twilio/realtime/media/${sessionId}`, mediaBaseUrl).toString(),
      )
    ) {
      await auditMediaSession(prisma, request, undefined, sessionId, 'realtime.signature_invalid');
      return reply.code(403).send();
    }
    const session = await prisma.realtimeCallSession.findFirst({
      where: { id: sessionId, status: 'reserved' },
    });
    if (!session?.executionId) return reply.code(404).send();
    const context = await loadMediaGateContext(prisma, session.executionId);
    if (!context || context.execution.organizationId !== session.organizationId)
      return reply.code(403).send();
    const gate = await evaluateProductionGate(prisma, context.gateInput);
    if (!gate.allowed) {
      await auditMediaSession(
        prisma,
        request,
        session.organizationId,
        sessionId,
        'realtime.gate_rejected',
      );
      return reply.code(403).send();
    }
  };
}
