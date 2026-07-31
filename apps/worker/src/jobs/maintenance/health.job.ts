import type Redis from 'ioredis';
import type { WorkerEnv } from '@sales-ai/validation';

export async function runHealthJob(redis: Redis, env: WorkerEnv) {
  await redis.set(
    env.WORKER_HEALTH_KEY,
    JSON.stringify({ service: 'worker', status: 'ok', timestamp: new Date().toISOString() }),
    'EX',
    15,
  );
}
