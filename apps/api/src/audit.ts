import type { FastifyRequest } from 'fastify';
import type { Prisma, PrismaClient } from '@sales-ai/database';
import type { AuditInput } from './types.js';

const SECRET_KEYS = new Set([
  'password',
  'passwordhash',
  'currentpassword',
  'newpassword',
  'token',
  'tokenhash',
  'csrftoken',
  'csrftokenhash',
  'cookie',
  'authorization',
  'session',
  'sessionid',
  'sessiontoken',
  'rawdata',
  'normalizeddata',
  'csvdata',
  'filecontent',
  'rows',
  'signature',
  'twiliosignature',
  'authtoken',
  'apikey',
  'audio',
  'payload',
  'base64',
  'rawmessage',
  'callsid',
  'streamsid',
]);

function normalizeAuditKey(key: string) {
  return key.toLowerCase().replaceAll(/[^a-z0-9]/g, '');
}

export function sanitizeAudit(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeAudit);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !SECRET_KEYS.has(normalizeAuditKey(key)))
        .map(([key, item]) => [key, sanitizeAudit(item)]),
    );
  return value;
}

export function requestMetadata(request: FastifyRequest) {
  return { ipAddress: request.ip, userAgent: request.headers['user-agent'] };
}

export async function writeAudit(prisma: PrismaClient, input: AuditInput): Promise<void> {
  const beforeData =
    input.beforeData === undefined
      ? undefined
      : (sanitizeAudit(input.beforeData) as Prisma.InputJsonValue);
  const afterData =
    input.afterData === undefined
      ? undefined
      : (sanitizeAudit(input.afterData) as Prisma.InputJsonValue);
  const data: Prisma.AuditLogUncheckedCreateInput = {
    action: input.action,
    entityType: input.entityType,
    organizationId: input.organizationId ?? null,
    userId: input.userId ?? null,
    entityId: input.entityId ?? null,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
    ...(beforeData !== undefined ? { beforeData } : {}),
    ...(afterData !== undefined ? { afterData } : {}),
  };
  await prisma.auditLog.create({ data });
}
