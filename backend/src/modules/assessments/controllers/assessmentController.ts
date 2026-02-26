import type { Response } from 'express';
import type { AuthRequest } from '../../../middleware/types';
import type { LegacyRouteDeps } from '../../app/routes/types';
import { createAssessmentService } from '../services/assessmentService';

export function createAssessmentController(deps: LegacyRouteDeps) {
  const service = createAssessmentService(deps);

  return {
    list: (req: AuthRequest, res: Response) => service.list(req, res),
    create: (req: AuthRequest, res: Response) => service.create(req, res),
    getById: (req: AuthRequest, res: Response) => service.getById(req, res),
    submit: (req: AuthRequest, res: Response) => service.submit(req, res),
    remove: (req: AuthRequest, res: Response) => service.remove(req, res),
  };
}
