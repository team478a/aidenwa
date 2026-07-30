import { Queue } from 'bullmq';
import Redis from 'ioredis';

export function createRedis(redisUrl: string) {
  return new Redis(redisUrl, { maxRetriesPerRequest: null });
}

export function createJobQueue(connection: Redis) {
  return new Queue('sales-ai-jobs', { connection });
}
