import type { Request, Response } from 'express';
import type { LegacyRouteDeps } from '../../app/routes/types';
import { createHealthService } from '../services/healthService';

export function createHealthController(deps: LegacyRouteDeps) {
  const service = createHealthService(deps);

  return {
    root: (req: Request, res: Response) => service.root(req, res),
    health: (req: Request, res: Response) => service.health(req, res),
  };
}
