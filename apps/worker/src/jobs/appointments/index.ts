import type { PrismaClient } from '@sales-ai/database';
import { expireAppointmentHolds } from './expiration.job.js';
import { createUpcomingAppointmentNotifications } from './notification.job.js';
import { cleanupAppointmentEvents } from './cleanup.job.js';

export async function maintainAppointments(
  prisma: PrismaClient,
  now = new Date(),
  batchSize = 500,
) {
  const expired = await expireAppointmentHolds(prisma, now, batchSize);
  const upcoming = await createUpcomingAppointmentNotifications(prisma, now, batchSize);
  const deletedEvents = await cleanupAppointmentEvents(prisma, now, batchSize);
  return { expired, upcoming, deletedEvents };
}
