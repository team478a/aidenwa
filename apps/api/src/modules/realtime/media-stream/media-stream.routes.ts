import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@sales-ai/database';
import type { ApiEnv } from '@sales-ai/validation';
import { registerMediaStreamControllers } from './media-stream.controller.js';

export { realtimeActivationBlockers } from './media-stream.policy.js';

export function registerStage4B2MediaRoutes(
  app: FastifyInstance,
  deps: { prisma: PrismaClient; env: ApiEnv },
) {
  registerMediaStreamControllers(app, deps);
}
