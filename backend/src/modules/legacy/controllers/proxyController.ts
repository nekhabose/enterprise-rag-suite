import type { Request, Response } from 'express';
import type { AuthRequest } from '../../../middleware/types';
import type { LegacyRouteDeps } from '../../app/routes/types';
import { createProxyService } from '../services/proxyService';

export function createProxyController(deps: LegacyRouteDeps) {
  const service = createProxyService(deps);

  return {
    listTenants: (req: AuthRequest, res: Response) => service.listTenants(req, res),
    llmProviders: (req: Request, res: Response) => service.llmProviders(req, res),
    embeddingProviders: (req: Request, res: Response) => service.embeddingProviders(req, res),
  };
}
