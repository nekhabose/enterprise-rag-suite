import type { AuthRequest } from '../../../middleware/types';
import type { Response } from 'express';
import type { LegacyRouteDeps } from '../../app/routes/types';
import { createHealthRepository } from '../repositories/healthRepository';
export function createHealthService(deps: LegacyRouteDeps) {
  const repo = createHealthRepository(deps.pool);
  return {
    root: (_req: AuthRequest, res: Response) => res.json({ status: 'LMS Backend Running', timestamp: new Date().toISOString() }),
    health: async (_req: AuthRequest, res: Response) => {
      try { await repo.query('SELECT 1'); return res.json({ status: 'ok', db: 'connected' }); }
      catch { return res.status(503).json({ status: 'error', db: 'disconnected' }); }
    },
  };
}
