import type { Response } from 'express';
import type { AuthRequest } from '../../../middleware/types';
import type { LegacyRouteDeps } from '../../app/routes/types';
import { createVideoService } from '../services/videoService';

export function createVideoController(deps: LegacyRouteDeps) {
  const service = createVideoService(deps);

  return {
    list: (req: AuthRequest, res: Response) => service.list(req, res),
    upload: (req: AuthRequest, res: Response) => service.upload(req, res),
    remove: (req: AuthRequest, res: Response) => service.remove(req, res),
  };
}
