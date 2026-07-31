import type { FastifyRequest } from 'fastify';
import type { PrismaClient } from '@sales-ai/database';
import { requestMetadata, writeAudit } from '../../../audit.js';

export function auditMediaSession(
  prisma: PrismaClient,
  request: FastifyRequest,
  organizationId: string | undefined,
  id: string,
  action: string,
) {
  return writeAudit(prisma, {
    organizationId,
    action,
    entityType: 'realtime_call_session',
    entityId: id,
    afterData: { reasonCode: action },
    ...requestMetadata(request),
  });
}
