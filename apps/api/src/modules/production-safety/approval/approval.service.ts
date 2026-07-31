import type { PrismaClient } from '@sales-ai/database';
import type { ApprovalInput } from '@sales-ai/validation';

import {
  approvalDecisionStatus,
  canTransitionApproval,
  type ApprovalDecision,
} from './approval.policy.js';

export function createApproval(
  prisma: PrismaClient,
  organizationId: string,
  userId: string,
  input: ApprovalInput,
) {
  return prisma.productionCallApproval.create({
    data: { ...input, organizationId, createdBy: userId, status: 'draft' },
  });
}

export function updateApproval(
  prisma: PrismaClient,
  organizationId: string,
  id: string,
  input: ApprovalInput,
) {
  return prisma.productionCallApproval.update({
    where: { id },
    data: { ...input, organizationId, status: 'draft', decisionReason: null },
  });
}

export function submitApproval(prisma: PrismaClient, id: string, userId: string) {
  return prisma.productionCallApproval.update({
    where: { id },
    data: { status: 'reviewing', requestedBy: userId, requestedAt: new Date() },
  });
}

export function decisionError(
  current: { status: string; expiresAt: Date | null },
  decision: ApprovalDecision,
  now: Date,
) {
  if (!canTransitionApproval(current.status, decision)) return 'INVALID_TRANSITION';
  if (decision === 'approve' && (!current.expiresAt || current.expiresAt <= now))
    return 'APPROVAL_INCOMPLETE';
  return null;
}

export function decideApproval(
  prisma: PrismaClient,
  id: string,
  userId: string,
  decision: ApprovalDecision,
  reason: string,
) {
  return prisma.productionCallApproval.update({
    where: { id },
    data: {
      status: approvalDecisionStatus[decision],
      decidedBy: userId,
      decidedAt: new Date(),
      decisionReason: reason,
    },
  });
}
