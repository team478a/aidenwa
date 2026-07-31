import type { FastifyReply, FastifyRequest } from 'fastify';
import { type PrismaClient, type UserRole } from '@sales-ai/database';
import { realtimeTerminateSchema } from '@sales-ai/validation';
import { requestMetadata, writeAudit } from '../../../audit.js';
import type { AuthContext } from '../../../types.js';
import {
  realtimeSessionReadRoles,
  realtimeSessionTerminateRoles,
} from './realtime-session.policy.js';
import {
  findRealtimeSession,
  listRealtimeEvents,
  listRealtimeSessions,
  terminateRealtimeSession,
} from './realtime-session.repository.js';

export type RealtimeSessionDependencies = {
  prisma: PrismaClient;
  authorize(
    request: FastifyRequest,
    reply: FastifyReply,
    roles: readonly UserRole[],
  ): Promise<AuthContext | undefined>;
  verifyCsrf(request: FastifyRequest, reply: FastifyReply, auth: AuthContext): boolean;
  error(reply: FastifyReply, code: number, key: string, message: string): unknown;
};

export function createRealtimeSessionController(deps: RealtimeSessionDependencies) {
  return {
    list: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await deps.authorize(request, reply, realtimeSessionReadRoles);
      if (!auth) return;
      return { sessions: await listRealtimeSessions(deps.prisma, auth.organizationId) };
    },
    detail: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await deps.authorize(request, reply, realtimeSessionReadRoles);
      if (!auth) return;
      const id = (request.params as { id: string }).id;
      const session = await findRealtimeSession(deps.prisma, auth.organizationId, id);
      if (!session) return deps.error(reply, 404, 'NOT_FOUND', 'セッションがありません');
      return {
        session,
        events: await listRealtimeEvents(deps.prisma, auth.organizationId, id),
      };
    },
    terminate: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = await deps.authorize(request, reply, realtimeSessionTerminateRoles);
      if (!auth || !deps.verifyCsrf(request, reply, auth)) return;
      const parsed = realtimeTerminateSchema.safeParse(request.body);
      if (!parsed.success) return deps.error(reply, 400, 'VALIDATION_ERROR', parsed.error.message);
      const id = (request.params as { id: string }).id;
      const result = await terminateRealtimeSession(deps.prisma, auth.organizationId, id);
      if (!result.count)
        return deps.error(reply, 404, 'NOT_FOUND', '終了可能なセッションがありません');
      await writeAudit(deps.prisma, {
        organizationId: auth.organizationId,
        userId: auth.userId,
        action: 'realtime.session.terminated',
        entityType: 'realtime_call_session',
        entityId: id,
        afterData: { reason: parsed.data.reason, redialScheduled: false },
        ...requestMetadata(request),
      });
      return { terminated: true, redialScheduled: false };
    },
  };
}
