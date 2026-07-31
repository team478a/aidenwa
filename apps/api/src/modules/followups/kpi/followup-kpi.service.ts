import type { PrismaClient } from '@sales-ai/database';

const TERMINAL = ['completed', 'cancelled'];

export async function followupDashboard(
  prisma: PrismaClient,
  organizationId: string,
  from: Date,
  to: Date,
) {
  const tasks = await prisma.humanFollowupTask.findMany({
    where: { organizationId, createdAt: { gte: from, lte: to } },
    select: {
      status: true,
      outcomeCode: true,
      createdAt: true,
      firstAttemptedAt: true,
      firstConnectedAt: true,
      assigneeUserId: true,
      dueAt: true,
    },
  });
  const attempted = tasks.filter((task) => task.firstAttemptedAt);
  const connected = tasks.filter((task) => task.firstConnectedAt);
  const appointments = tasks.filter((task) => task.outcomeCode === 'appointment_booked');
  const responseMs = attempted.map(
    (task) => task.firstAttemptedAt!.getTime() - task.createdAt.getTime(),
  );
  return {
    period: { from, to },
    total: tasks.length,
    unassigned: tasks.filter((task) => !task.assigneeUserId && !TERMINAL.includes(task.status))
      .length,
    overdue: tasks.filter(
      (task) => task.dueAt && task.dueAt < new Date() && !TERMINAL.includes(task.status),
    ).length,
    attempted: attempted.length,
    connected: connected.length,
    connectionRate: attempted.length ? connected.length / attempted.length : null,
    appointments: appointments.length,
    appointmentRate: connected.length ? appointments.length / connected.length : null,
    averageFirstAttemptMs: responseMs.length
      ? Math.round(responseMs.reduce((a, b) => a + b, 0) / responseMs.length)
      : null,
  };
}
