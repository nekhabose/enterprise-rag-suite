import type { LegacyRouteDeps } from '../../app/routes/types';
import { createSettingsController } from '../controllers/settingsController';

export function registerSettingsRoutes(deps: LegacyRouteDeps) {
  const { app, authMiddleware } = deps;
  const controller = createSettingsController(deps);

  app.get('/settings', authMiddleware, controller.getSettings);
  app.post('/settings', authMiddleware, controller.saveSettings);
  app.get('/profile', authMiddleware, controller.profile);
}
