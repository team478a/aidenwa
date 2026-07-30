import type { FastifyInstance } from 'fastify';
import { UserRole } from '@sales-ai/database';
import { incidentResolutionSchema } from '@sales-ai/validation';
import type { ProductionControllerDependencies } from './controller.types.js';

export function registerProductionIncidentRoutes(
  app: FastifyInstance,
  deps: ProductionControllerDependencies,
) {
  const { prisma } = deps;
  app.get('/api/v1/production-incidents', async (request, reply) => {
    const auth = await deps.authorize(request, reply, [
      UserRole.system_admin,
      UserRole.admin,
      UserRole.manager,
    ]);
    if (!auth) return;
    return {
      incidents: await prisma.productionIncident.findMany({
        where: { organizationId: auth.organizationId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    };
  });
  app.post('/api/v1/production-incidents/:id/resolve', async (request, reply) => {
    const auth = await deps.system(request, reply);
    if (!auth) return;
    const parsed = incidentResolutionSchema.safeParse(request.body);
    if (!parsed.success) return deps.error(reply, 400, 'REASON_REQUIRED', '解決理由が必要です');
    const id = (request.params as { id: string }).id;
    const result = await prisma.productionIncident.updateMany({
      where: { id, organizationId: auth.organizationId, status: { not: 'resolved' } },
      data: {
        status: 'resolved',
        resolvedBy: auth.userId,
        resolvedAt: new Date(),
        resolutionReason: parsed.data.reason,
      },
    });
    if (!result.count)
      return deps.error(reply, 404, 'INCIDENT_NOT_FOUND', '未解決incidentがありません');
    return { resolved: true };
  });
}
