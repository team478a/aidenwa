import type { FastifyReply, FastifyRequest } from 'fastify';
import { providerConfigSchema } from '@sales-ai/validation';
import { requestMetadata, writeAudit } from '../../../audit.js';
import type { ProductControllerDependencies } from '../../products/product.controller.js';
import { resolveApprovalOrganization } from '../approval/approval.policy.js';
import {
  providerConfigurationAudit,
  providerConfigurationRoles,
} from './provider-configuration.policy.js';
import { saveProviderConfiguration } from './provider-configuration.service.js';

export function createProviderConfigurationController(deps: ProductControllerDependencies) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const auth = await deps.authorize(request, reply, providerConfigurationRoles);
    if (!auth || !deps.verifyCsrf(request, reply, auth)) return;
    const parsed = providerConfigSchema.safeParse(request.body);
    if (!parsed.success) return deps.error(reply, 400, 'VALIDATION_ERROR', parsed.error.message);
    const organizationId = resolveApprovalOrganization(auth, parsed.data.organizationId);
    const config = await saveProviderConfiguration(
      deps.prisma,
      organizationId,
      auth.userId,
      parsed.data,
    );
    await writeAudit(deps.prisma, {
      organizationId,
      userId: auth.userId,
      action: 'provider_configuration.updated',
      entityType: 'provider_configuration',
      entityId: config.id,
      afterData: providerConfigurationAudit(config),
      ...requestMetadata(request),
    });
    return {
      configuration: {
        ...config,
        secretReferenceKey: config.secretReferenceKey ? 'configured' : null,
      },
    };
  };
}
