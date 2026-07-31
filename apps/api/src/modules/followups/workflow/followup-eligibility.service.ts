import type { PrismaClient } from '@sales-ai/database';
import { inCallableWindow } from '@sales-ai/shared';

const TERMINAL = ['completed', 'cancelled'];

export async function ensureHumanFollowupAllowed(
  prisma: PrismaClient,
  input: { organizationId: string; taskId: string; userId: string; now?: Date },
) {
  const now = input.now ?? new Date();
  const task = await prisma.humanFollowupTask.findFirst({
    where: { id: input.taskId, organizationId: input.organizationId },
  });
  if (!task || task.assigneeUserId !== input.userId) throw new Error('FOLLOWUP_NOT_ASSIGNED');
  if (TERMINAL.includes(task.status)) throw new Error('FOLLOWUP_TERMINAL');
  const phone = await prisma.phoneNumber.findFirst({
    where: { id: task.phoneNumberId, organizationId: input.organizationId, isDeleted: false },
  });
  if (!phone?.isCallable || !phone.isValid || phone.type === 'fax')
    throw new Error('PHONE_NOT_CALLABLE');
  const [optOut, stop, campaign] = await Promise.all([
    prisma.optOut.findFirst({
      where: {
        organizationId: input.organizationId,
        status: 'active',
        channel: { in: ['all', 'phone'] },
        OR: [
          { companyId: phone.companyId },
          { phoneNumberId: phone.id },
          ...(phone.contactId ? [{ contactId: phone.contactId }] : []),
          { normalizedPhoneSnapshot: phone.normalizedNumber },
        ],
      },
    }),
    prisma.emergencyStop.findFirst({
      where: {
        active: true,
        OR: [
          { scope: 'system' },
          { scope: 'organization', organizationId: input.organizationId },
          { scope: 'campaign', organizationId: input.organizationId, scopeId: task.campaignId },
          { scope: 'provider', organizationId: input.organizationId, scopeId: 'zoom_phone' },
        ],
      },
    }),
    prisma.campaign.findFirst({
      where: { id: task.campaignId, organizationId: input.organizationId },
    }),
  ]);
  if (optOut) throw new Error('OPT_OUT');
  if (stop) throw new Error('EMERGENCY_STOP_ACTIVE');
  if (
    !campaign ||
    !inCallableWindow(
      now,
      campaign.callableWeekdays as number[],
      campaign.callableStartTime,
      campaign.callableEndTime,
      campaign.timezone,
    )
  )
    throw new Error('OUTSIDE_CALLABLE_WINDOW');
  return { task, phone };
}
