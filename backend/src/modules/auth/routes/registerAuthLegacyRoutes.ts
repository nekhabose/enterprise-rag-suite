import type { LegacyRouteDeps } from '../../app/routes/types';
import { createAuthLegacyController } from '../controllers/authLegacyController';

export function registerAuthLegacyRoutes(deps: LegacyRouteDeps) {
  const { app, authLimiter, authMiddleware } = deps;
  const controller = createAuthLegacyController(deps);

  app.post('/auth/login', authLimiter, controller.login);
  app.post('/auth/refresh', controller.refresh);
  app.post('/auth/logout', controller.logout);
  app.get('/auth/me', authMiddleware, controller.me);
  app.post('/auth/signup', authLimiter, controller.signup);
  app.post('/auth/change-password', authMiddleware, controller.changePassword);
}
