import type { LegacyRouteDeps } from '../../app/routes/types';
import { createProxyController } from '../controllers/proxyController';

export function registerProxyRoutes(deps: LegacyRouteDeps) {
  const { app, authMiddleware, requirePermission } = deps;
  const controller = createProxyController(deps);

  app.get('/admin/tenants', authMiddleware, requirePermission('TENANT_READ'), controller.listTenants);
  app.get('/llms/providers', authMiddleware, controller.llmProviders);
  app.get('/embeddings/providers', authMiddleware, controller.embeddingProviders);
}
