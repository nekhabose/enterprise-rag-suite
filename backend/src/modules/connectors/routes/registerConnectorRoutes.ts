import type { LegacyRouteDeps } from '../../app/routes/types';
import { createConnectorController } from '../controllers/connectorController';

export function registerConnectorRoutes(deps: LegacyRouteDeps) {
  const { app, authMiddleware, requirePermission } = deps;
  const controller = createConnectorController(deps);

  app.get('/connectors', authMiddleware, requirePermission('CONNECTOR_CONFIGURE'), controller.list);
  app.post('/connectors/ingest', authMiddleware, requirePermission('CONNECTOR_CONFIGURE'), controller.ingest);
}
