import type { Response } from 'express';
import type { AuthRequest } from '../../../middleware/types';
import type { LegacyRouteDeps } from '../../app/routes/types';
import { createDocumentService } from '../services/documentService';

export function createDocumentController(deps: LegacyRouteDeps) {
  const service = createDocumentService(deps);

  return {
    upload: (req: AuthRequest, res: Response) => service.upload(req, res),
    list: (req: AuthRequest, res: Response) => service.list(req, res),
    remove: (req: AuthRequest, res: Response) => service.remove(req, res),
    download: (req: AuthRequest, res: Response) => service.download(req, res),
    preview: (req: AuthRequest, res: Response) => service.preview(req, res),
  };
}
