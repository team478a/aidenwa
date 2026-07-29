import type { FastifyReply } from 'fastify';
import { Prisma } from '@sales-ai/database';
import { DomainError } from './domain-error.js';

type PublicError = {
  statusCode: number;
  body: {
    error: {
      code: string;
      message: string;
    };
  };
  logCause: boolean;
};

export function toPublicError(cause: unknown): PublicError {
  if (cause instanceof DomainError) {
    return {
      statusCode: cause.httpStatus,
      body: { error: { code: cause.code, message: cause.message } },
      logCause: cause.httpStatus >= 500,
    };
  }
  if (typeof cause === 'object' && cause !== null && 'issues' in cause) {
    return {
      statusCode: 400,
      body: { error: { code: 'VALIDATION_ERROR', message: '入力内容を確認してください' } },
      logCause: false,
    };
  }
  if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === 'P2002') {
    return {
      statusCode: 409,
      body: {
        error: { code: 'DUPLICATE', message: '同じ一意項目を持つデータが既に存在します' },
      },
      logCause: false,
    };
  }
  return {
    statusCode: 500,
    body: { error: { code: 'INTERNAL_ERROR', message: '処理に失敗しました' } },
    logCause: true,
  };
}

export function sendPublicError(reply: FastifyReply, cause: unknown) {
  const mapped = toPublicError(cause);
  return reply.code(mapped.statusCode).send(mapped.body);
}
