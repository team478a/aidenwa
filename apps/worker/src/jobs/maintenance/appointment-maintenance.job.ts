import type { PrismaClient } from '@sales-ai/database';
import { maintainAppointments } from '../appointments/index.js';

export function runAppointmentMaintenanceJob(prisma: PrismaClient) {
  return maintainAppointments(prisma);
}
