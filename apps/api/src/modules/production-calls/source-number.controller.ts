import type { FastifyInstance } from 'fastify';
import { UserRole } from '@sales-ai/database';
import { incidentResolutionSchema, sourceNumberApprovalSchema } from '@sales-ai/validation';
import { sourceFingerprint } from './provider.js';
import type { ProductionControllerDependencies } from './controller.types.js';

export function registerSourceNumberRoutes(
  app: FastifyInstance,
  deps: ProductionControllerDependencies,
) {
  const { prisma, env } = deps;
  app.get('/api/v1/source-number-approvals', async (request, reply) => {
    const auth = await deps.authorize(request, reply, [UserRole.system_admin]);
    if (!auth) return;
    const rows = await prisma.sourceNumberApproval.findMany({
      where: { organizationId: auth.organizationId, provider: 'twilio' },
      orderBy: { createdAt: 'desc' },
    });
    return {
      approvals: rows.map(({ numberFingerprint, ...row }) => {
        void numberFingerprint;
        return { ...row, maskedNumber: `********${row.numberLastFour}` };
      }),
    };
  });
  app.post('/api/v1/source-number-approvals', async (request, reply) => {
    const auth = await deps.system(request, reply);
    if (!auth) return;
    const parsed = sourceNumberApprovalSchema.safeParse(request.body);
    if (!parsed.success) return deps.error(reply, 400, 'VALIDATION_ERROR', parsed.error.message);
    const fingerprint = sourceFingerprint(env, parsed.data.sourceNumberE164);
    const record = await prisma.sourceNumberApproval.upsert({
      where: {
        organizationId_provider_numberFingerprint: {
          organizationId: auth.organizationId,
          provider: 'twilio',
          numberFingerprint: fingerprint,
        },
      },
      create: {
        organizationId: auth.organizationId,
        provider: 'twilio',
        numberFingerprint: fingerprint,
        numberLastFour: parsed.data.sourceNumberE164.slice(-4),
        ownershipEvidenceRef: parsed.data.ownershipEvidenceRef,
        expiresAt: parsed.data.expiresAt,
        createdBy: auth.userId,
      },
      update: {
        ownershipEvidenceRef: parsed.data.ownershipEvidenceRef,
        expiresAt: parsed.data.expiresAt,
        verificationStatus: 'pending',
        active: false,
        verifiedBy: null,
        verifiedAt: null,
      },
    });
    await deps.audit(
      prisma,
      request,
      auth,
      auth.organizationId,
      'twilio_source_number.registered',
      record.id,
      {
        maskedNumber: `********${record.numberLastFour}`,
        evidenceRef: record.ownershipEvidenceRef,
        expiresAt: record.expiresAt,
      },
    );
    return reply.code(201).send({ approval: { ...record, numberFingerprint: undefined } });
  });
  app.post('/api/v1/source-number-approvals/:id/verify', async (request, reply) => {
    const auth = await deps.system(request, reply);
    if (!auth) return;
    const parsed = incidentResolutionSchema.safeParse(request.body);
    if (!parsed.success) return deps.error(reply, 400, 'REASON_REQUIRED', '確認理由が必要です');
    const id = (request.params as { id: string }).id;
    const before = await prisma.sourceNumberApproval.findFirst({
      where: { id, organizationId: auth.organizationId, expiresAt: { gt: new Date() } },
    });
    if (!before)
      return deps.error(reply, 404, 'SOURCE_NUMBER_NOT_FOUND', '有効な発信元承認がありません');
    const approval = await prisma.sourceNumberApproval.update({
      where: { id },
      data: {
        verificationStatus: 'verified',
        active: true,
        verifiedBy: auth.userId,
        verifiedAt: new Date(),
      },
    });
    await deps.audit(
      prisma,
      request,
      auth,
      auth.organizationId,
      'twilio_source_number.verified',
      id,
      { maskedNumber: `********${approval.numberLastFour}`, reason: parsed.data.reason },
    );
    return { approval: { ...approval, numberFingerprint: undefined } };
  });
  app.post('/api/v1/source-number-approvals/:id/revoke', async (request, reply) => {
    const auth = await deps.system(request, reply);
    if (!auth) return;
    const parsed = incidentResolutionSchema.safeParse(request.body);
    if (!parsed.success) return deps.error(reply, 400, 'REASON_REQUIRED', '取消理由が必要です');
    const id = (request.params as { id: string }).id;
    const result = await prisma.sourceNumberApproval.updateMany({
      where: { id, organizationId: auth.organizationId },
      data: { verificationStatus: 'revoked', active: false },
    });
    if (!result.count)
      return deps.error(reply, 404, 'SOURCE_NUMBER_NOT_FOUND', '発信元承認がありません');
    await prisma.productionTestAuthorization.updateMany({
      where: { organizationId: auth.organizationId, sourceNumberApprovalId: id, status: 'active' },
      data: { status: 'suspended', decisionReason: 'source_number_revoked' },
    });
    await deps.audit(
      prisma,
      request,
      auth,
      auth.organizationId,
      'twilio_source_number.revoked',
      id,
      { reason: parsed.data.reason },
    );
    return { revoked: true };
  });
}
