import type { FastifyInstance } from 'fastify';

import {
  createProductController,
  type ProductControllerDependencies,
} from './product.controller.js';

export function registerProductRoutes(app: FastifyInstance, deps: ProductControllerDependencies) {
  const controller = createProductController(deps);
  app.get('/api/v1/products', controller.list);
  app.post('/api/v1/products', controller.create);
  app.get('/api/v1/products/:id', controller.detail);
  app.patch('/api/v1/products/:id', controller.update);
  app.post('/api/v1/products/:id/archive', controller.archive);
  app.post('/api/v1/products/:id/versions', controller.createVersion);
  app.post('/api/v1/product-versions/:id/publish', controller.publishVersion);
}
