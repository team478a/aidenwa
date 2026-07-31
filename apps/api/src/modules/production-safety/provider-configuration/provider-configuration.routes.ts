import type { FastifyInstance } from 'fastify';
import type { ProductControllerDependencies } from '../../products/product.controller.js';
import { createProviderConfigurationController } from './provider-configuration.controller.js';

export function registerProviderConfigurationRoutes(
  app: FastifyInstance,
  deps: ProductControllerDependencies,
) {
  app.put('/api/v1/provider-configurations', createProviderConfigurationController(deps));
}
