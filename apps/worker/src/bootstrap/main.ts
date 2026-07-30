import { workerEnvSchema } from '@sales-ai/validation/env';
import { createPrisma } from './create-prisma.js';
import { createJobQueue, createRedis } from './create-redis.js';
import { registerGracefulShutdown } from './graceful-shutdown.js';
import { registerSchedulers } from './register-schedulers.js';
import { registerWorker } from './register-workers.js';

export async function main() {
  const env = workerEnvSchema.parse(process.env);
  const prisma = createPrisma(env.DATABASE_URL);
  const redis = createRedis(env.REDIS_URL);
  const queue = createJobQueue(redis);
  queue.on('error', (cause) => {
    console.error(
      JSON.stringify({
        event: 'queue_error',
        failureCode: cause.name,
      }),
    );
  });
  const worker = registerWorker({ prisma, redis, queue, env });
  await registerSchedulers(queue);
  registerGracefulShutdown({
    worker,
    redis,
    queue,
    prisma,
    healthKey: env.WORKER_HEALTH_KEY,
  });
}
