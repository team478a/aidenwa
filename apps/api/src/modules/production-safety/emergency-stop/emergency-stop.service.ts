import type { PrismaClient } from '@sales-ai/database';
import type { EmergencyStopInput } from '@sales-ai/validation';

import { enqueueOutbox } from '../../../outbox.js';

export function activateEmergencyStop(
  prisma: PrismaClient,
  organizationId: string | null,
  userId: string,
  input: EmergencyStopInput,
) {
  return prisma.$transaction(async (tx) => {
    const stop = await tx.emergencyStop.create({
      data: {
        organizationId,
        scope: input.scope,
        scopeId: input.scopeId ?? null,
        reason: input.reason,
        activatedBy: userId,
      },
    });
    await tx.callJob.updateMany({
      where: {
        ...(organizationId ? { organizationId } : {}),
        status: { in: ['queued', 'reserved', 'dispatching'] },
      },
      data: {
        status: 'skipped',
        errorCode: 'emergency_stop',
        errorMessage: 'Stage 4A safety stop',
      },
    });
    await enqueueOutbox(tx, {
      organizationId,
      eventType: 'twilio-emergency-stop',
      aggregateType: 'emergency_stop',
      aggregateId: stop.id,
      payload: {
        organizationId,
        scope: stop.scope,
        scopeId: stop.scopeId,
        emergencyStopId: stop.id,
      },
    });
    return stop;
  });
}
