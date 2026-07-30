import { PrismaClient } from '@sales-ai/database';

export function createPrisma(databaseUrl: string) {
  return new PrismaClient({
    datasources: {
      db: { url: databaseUrl },
    },
  });
}
