import type { FastifyInstance } from 'fastify';
import type { ProductControllerDependencies } from '../products/product.controller.js';
import { createKnowledgeController } from './knowledge.controller.js';

export function registerKnowledgeRoutes(app: FastifyInstance, deps: ProductControllerDependencies) {
  const controller = createKnowledgeController(deps);
  app.get('/api/v1/knowledge-bases', controller.list);
  app.post('/api/v1/knowledge-bases', controller.create);
  app.get('/api/v1/knowledge-bases/:id', controller.detail);
  app.patch('/api/v1/knowledge-bases/:id', controller.update);
  app.post('/api/v1/knowledge-bases/:id/documents', controller.createDocument);
  app.post('/api/v1/knowledge-documents/:id/entries', controller.createEntry);
  app.patch('/api/v1/knowledge-documents/:id', controller.updateDocument);
  app.patch('/api/v1/knowledge-entries/:id', controller.updateEntry);
  app.post('/api/v1/knowledge-documents/:id/publish', controller.publishDocument);
  app.post('/api/v1/knowledge-bases/:id/search', controller.search);
}
