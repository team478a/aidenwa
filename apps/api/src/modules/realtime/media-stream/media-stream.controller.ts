import type { FastifyInstance } from 'fastify';
import type { RawData } from 'ws';
import { evaluateProductionGate, type PrismaClient } from '@sales-ai/database';
import type { ApiEnv } from '@sales-ai/validation';
import {
  normalizeTwilioStreamEvent,
  OpenAIRealtimeProvider,
  PcmuRealtimeBridge,
} from '@sales-ai/realtime';
import { buildPersistedRealtimePrompt } from '../realtime-simulation/realtime-simulation.service.js';
import { realtimeActivationBlockers } from './media-stream.policy.js';
import { auditMediaSession } from './media-stream-audit.service.js';
import { createMediaStreamTwimlController } from './media-stream-twiml.controller.js';
import { finishMediaSession, loadMediaGateContext } from './media-stream.repository.js';
import {
  createOpenAIRealtimeSocket,
  createServerSocketTransport,
} from './media-stream.transport.js';
import { realtimeRawDataText, sanitizeRealtimeCode } from '../protocol/realtime-protocol.js';
import { verifyMediaSessionToken } from '../token/realtime-token.policy.js';
import { validateTwilioMediaSignature } from '../token/realtime-token.policy.js';

export { realtimeActivationBlockers } from './media-stream.policy.js';

export function registerMediaStreamControllers(
  app: FastifyInstance,
  deps: { prisma: PrismaClient; env: ApiEnv },
) {
  const { prisma, env } = deps;

  app.post('/api/v1/twilio/realtime/twiml/:executionId', createMediaStreamTwimlController(deps));

  app.get(
    '/api/v1/twilio/realtime/media/:sessionId',
    {
      websocket: true,
      preValidation: async (request, reply) => {
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
          await auditMediaSession(
            prisma,
            request,
            undefined,
            sessionId,
            'realtime.signature_invalid',
          );
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
      },
    },
    async (socket, request) => {
      const sessionId = (request.params as { sessionId: string }).sessionId;
      const fail = async (code: string) => {
        socket.close(1008, code);
        await auditMediaSession(prisma, request, undefined, sessionId, `realtime.${code}`);
      };
      const blockers = realtimeActivationBlockers(env);
      if (blockers.length) return fail('gate_rejected');
      const signature = request.headers['x-twilio-signature'];
      const externalUrl = new URL(
        `/api/v1/twilio/realtime/media/${sessionId}`,
        env.TWILIO_MEDIA_STREAM_BASE_URL,
      ).toString();
      if (
        typeof signature !== 'string' ||
        !validateTwilioMediaSignature(env, signature, externalUrl)
      )
        return fail('signature_invalid');
      const session = await prisma.realtimeCallSession.findFirst({
        where: { id: sessionId, status: 'reserved' },
      });
      if (!session?.executionId) return fail('session_invalid');
      const context = await loadMediaGateContext(prisma, session.executionId);
      if (!context || context.execution.organizationId !== session.organizationId)
        return fail('scope_invalid');
      const gate = await evaluateProductionGate(prisma, context.gateInput);
      if (!gate.allowed) return fail('gate_rejected');
      const [organizationActive, systemActive] = await Promise.all([
        prisma.realtimeCallSession.count({
          where: {
            organizationId: session.organizationId,
            status: { in: ['authenticating', 'connecting_twilio', 'connecting_openai', 'active'] },
            id: { not: session.id },
          },
        }),
        prisma.realtimeCallSession.count({
          where: {
            status: { in: ['authenticating', 'connecting_twilio', 'connecting_openai', 'active'] },
            id: { not: session.id },
          },
        }),
      ]);
      if (
        organizationActive >= env.REALTIME_MAX_CONCURRENT_SESSIONS ||
        systemActive >= env.REALTIME_MAX_CONCURRENT_SESSIONS
      )
        return fail('concurrency_limit');
      const claimed = await prisma.realtimeCallSession.updateMany({
        where: { id: session.id, status: 'reserved' },
        data: { status: 'authenticating', startedAt: new Date() },
      });
      if (!claimed.count) return fail('session_replayed');
      await prisma.realtimeCallSession.update({
        where: { id: session.id },
        data: { status: 'connecting_twilio' },
      });
      let bridge: PcmuRealtimeBridge | undefined;
      let finalReason: string | undefined;
      let tokenAccepted = false;
      let idleTimer: NodeJS.Timeout | undefined;
      const end = async (reason: string) => {
        if (finalReason) return;
        finalReason = reason;
        await finishMediaSession(prisma, session.id, reason);
        await auditMediaSession(
          prisma,
          request,
          session.organizationId,
          session.id,
          'realtime.session.ended',
        );
        await bridge?.close(reason);
      };
      const resetIdle = () => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => void end('idle_timeout'), env.REALTIME_IDLE_TIMEOUT_MS);
      };
      const handleMessage = async (data: RawData) => {
        try {
          resetIdle();
          const raw: unknown = JSON.parse(realtimeRawDataText(data));
          const event = normalizeTwilioStreamEvent(raw, env.REALTIME_EVENT_MAX_BYTES);
          if (event.type === 'start') {
            const token = event.customParameters.session_token;
            if (!token || !env.REALTIME_SESSION_TOKEN_SECRET)
              throw new Error('REALTIME_TOKEN_INVALID');
            const payload = verifyMediaSessionToken(token, env.REALTIME_SESSION_TOKEN_SECRET);
            if (
              payload.sessionId !== session.id ||
              payload.organizationId !== session.organizationId ||
              payload.executionId !== session.executionId
            )
              throw new Error('REALTIME_TOKEN_SCOPE_INVALID');
            tokenAccepted = true;
            const provider = new OpenAIRealtimeProvider(
              {
                enabled: env.REALTIME_AI_ENABLED,
                apiKey: env.OPENAI_API_KEY,
                model: env.OPENAI_REALTIME_MODEL,
                voice: env.OPENAI_REALTIME_VOICE,
                connectTimeoutMs: env.REALTIME_CONNECT_TIMEOUT_MS,
                maxEventBytes: env.REALTIME_EVENT_MAX_BYTES,
              },
              createOpenAIRealtimeSocket,
            );
            const instructions = await buildPersistedRealtimePrompt(prisma, {
              organizationId: session.organizationId,
              campaignId: context.execution.campaignId,
              companyId: context.execution.companyId,
            });
            await prisma.realtimeCallSession.update({
              where: { id: session.id },
              data: { status: 'connecting_openai', streamFingerprint: event.streamFingerprint },
            });
            const realtime = await provider.connect({
              sessionId: session.id,
              instructions,
              maxSeconds: env.REALTIME_SESSION_MAX_SECONDS,
            });
            bridge = new PcmuRealtimeBridge(realtime, createServerSocketTransport(socket), {
              maxPendingAudioBytes: env.REALTIME_MAX_PENDING_AUDIO_BYTES,
              maxMessagesPerSecond: env.REALTIME_MAX_MESSAGES_PER_SECOND,
              maxTwilioBufferedBytes: env.REALTIME_MAX_PENDING_AUDIO_BYTES,
            });
            bridge.setStream(event.streamSid);
            realtime.onEvent(
              (item) =>
                void bridge?.receiveRealtime(item).catch(() => bridge?.close('internal_error')),
            );
            await prisma.realtimeCallSession.update({
              where: { id: session.id },
              data: { status: 'active' },
            });
            await auditMediaSession(
              prisma,
              request,
              session.organizationId,
              session.id,
              'realtime.session.started',
            );
          } else if (!tokenAccepted || !bridge) throw new Error('STREAM_NOT_AUTHENTICATED');
          else if (event.type === 'media') await bridge.receiveTwilioMedia(event);
          else if (event.type === 'mark') bridge.acknowledgeMark(event.streamSid, event.name);
          else if (event.type === 'stop') await end('caller_hangup');
        } catch (cause) {
          await end(
            cause instanceof Error ? sanitizeRealtimeCode(cause.message) : 'internal_error',
          );
          socket.close(1008, 'invalid_media_event');
        }
      };
      socket.on('message', (data) => void handleMessage(data));
      socket.on('close', () => {
        if (idleTimer) clearTimeout(idleTimer);
        void end(finalReason ?? 'twilio_disconnected');
      });
      setTimeout(() => void end('max_duration'), env.REALTIME_SESSION_MAX_SECONDS * 1000);
    },
  );
}
