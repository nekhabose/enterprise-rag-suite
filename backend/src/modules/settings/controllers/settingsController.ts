import type { Response } from 'express';
import type { AuthRequest } from '../../../middleware/types';
import type { LegacyRouteDeps } from '../../app/routes/types';
import { createSettingsService } from '../services/settingsService';

export function createSettingsController(deps: LegacyRouteDeps) {
  const service = createSettingsService(deps);

  return {
    getSettings: (req: AuthRequest, res: Response) => service.getSettings(req, res),
    saveSettings: (req: AuthRequest, res: Response) => service.saveSettings(req, res),
    profile: (req: AuthRequest, res: Response) => service.profile(req, res),
  };
}
