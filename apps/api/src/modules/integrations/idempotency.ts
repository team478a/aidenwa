import type { FastifyReply } from 'fastify';
import { Prisma, type PrismaClient } from '@sales-ai/database';
import { requestFingerprint } from './security.js';

export const idempotencyKeyPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function runIdempotentAction(
  prisma: PrismaClient,
  reply: FastifyReply,
  input: {
    integrationClientId: string;
    idempotencyKey: string;
    operation: string;
    request: unknown;
    execute: (
      tx: Prisma.TransactionClient,
    ) => Promise<{ statusCode: number; body: Prisma.InputJsonObject }>;
  },
) {
  const requestHash = requestFingerprint({ operation: input.operation, request: input.request });
  const replay = await prisma.externalIdempotencyRecord.findUnique({
    where: {
      integrationClientId_idempotencyKey: {
        integrationClientId: input.integrationClientId,
        idempotencyKey: input.idempotencyKey,
      },
    },
  });
  if (replay) {
    if (replay.operation !== input.operation || replay.requestHash !== requestHash)
      return undefined;
    return reply.code(replay.statusCode).send(replay.responseBody);
  }
  try {
    const result = await prisma.$transaction(async (tx) => {
      const value = await input.execute(tx);
      await tx.externalIdempotencyRecord.create({
        data: {
          integrationClientId: input.integrationClientId,
          idempotencyKey: input.idempotencyKey,
          operation: input.operation,
          requestHash,
          statusCode: value.statusCode,
          responseBody: value.body,
        },
      });
      return value;
    });
    return reply.code(result.statusCode).send(result.body);
  } catch (cause) {
    if (!(cause instanceof Prisma.PrismaClientKnownRequestError) || cause.code !== 'P2002')
      throw cause;
    const concurrent = await prisma.externalIdempotencyRecord.findUnique({
      where: {
        integrationClientId_idempotencyKey: {
          integrationClientId: input.integrationClientId,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (
      !concurrent ||
      concurrent.operation !== input.operation ||
      concurrent.requestHash !== requestHash
    )
      return undefined;
    return reply.code(concurrent.statusCode).send(concurrent.responseBody);
  }
}
