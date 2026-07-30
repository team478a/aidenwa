import type { PrismaClient } from '@sales-ai/database';

export async function rejectProductionCall(
  prisma: PrismaClient,
  id: string,
  organizationId: string,
  reason: string,
) {
  await prisma.realCallExecution.update({ where: { id }, data: { state: 'failed' } });
  await prisma.auditLog.create({
    data: {
      organizationId,
      action: 'twilio_call.rejected',
      entityType: 'real_call_execution',
      entityId: id,
      afterData: { reason },
    },
  });
}
