import type { Request, Response } from 'express';
import type { AuthRequest } from '../../../middleware/types';
import type { LegacyRouteDeps } from '../../app/routes/types';
import { createConnectorService } from '../services/connectorService';

export function createConnectorController(deps: LegacyRouteDeps) {
  const service = createConnectorService(deps);

  return {
    list: (req: Request, res: Response) => service.list(req, res),
    ingest: (req: AuthRequest, res: Response) => service.ingest(req, res),
  };
}
