import type { PrismaClient } from '@sales-ai/database';
import type { AuthContext } from '../../types.js';
import { appointmentScope } from './appointment.policy.js';

export function createAppointmentRepository(prisma: PrismaClient) {
  return {
    list(auth: AuthContext) {
      return prisma.appointment.findMany({
        where: appointmentScope(auth),
        orderBy: { startAt: 'asc' },
        take: 200,
      });
    },
    findScoped(auth: AuthContext, id: string) {
      return prisma.appointment.findFirst({ where: appointmentScope(auth, id) });
    },
    listEvents(organizationId: string, appointmentId: string) {
      return prisma.appointmentEvent.findMany({
        where: { organizationId, appointmentId },
        orderBy: { occurredAt: 'asc' },
      });
    },
    groupStatus(organizationId: string) {
      return prisma.appointment.groupBy({
        by: ['status'],
        where: { organizationId },
        _count: true,
      });
    },
  };
}
