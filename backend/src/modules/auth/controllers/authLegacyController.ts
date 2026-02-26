import type { Request, Response } from 'express';
import type { AuthRequest } from '../../../middleware/types';
import type { LegacyRouteDeps } from '../../app/routes/types';
import { createAuthLegacyService } from '../services/authLegacyService';

export function createAuthLegacyController(deps: LegacyRouteDeps) {
  const service = createAuthLegacyService(deps);

  return {
    login: (req: Request, res: Response) => service.login(req, res),
    refresh: (req: Request, res: Response) => service.refresh(req, res),
    logout: (req: AuthRequest, res: Response) => service.logout(req, res),
    me: (req: AuthRequest, res: Response) => service.me(req, res),
    signup: (req: Request, res: Response) => service.signup(req, res),
    changePassword: (req: AuthRequest, res: Response) => service.changePassword(req, res),
  };
}
