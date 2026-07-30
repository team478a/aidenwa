import type { Queue, Worker } from 'bullmq';
import type Redis from 'ioredis';
import type { PrismaClient } from '@sales-ai/database';

type ShutdownDependencies = {
  worker: Worker;
  redis: Redis;
  queue: Queue;
  prisma: PrismaClient;
  healthKey: string;
};

export function registerGracefulShutdown(deps: ShutdownDependencies) {
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    let failure: unknown;
    const close = async (action: () => Promise<unknown>) => {
      try {
        await action();
      } catch (cause) {
        failure ??= cause;
      }
    };
    try {
      await close(() => deps.worker.close());
      await close(() => deps.redis.del(deps.healthKey));
      await close(() => deps.queue.close());
      await close(() => deps.prisma.$disconnect());
    } finally {
      deps.redis.disconnect();
    }
    if (failure) throw failure instanceof Error ? failure : new Error('worker_shutdown_failed');
  };
  const requestShutdown = () => {
    void shutdown().catch((cause) => {
      console.error(
        JSON.stringify({
          event: 'worker_shutdown_failed',
          failureCode: cause instanceof Error ? cause.name : 'UnknownError',
        }),
      );
      process.exitCode = 1;
    });
  };
  process.once('SIGINT', requestShutdown);
  process.once('SIGTERM', requestShutdown);
  return shutdown;
}
