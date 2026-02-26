import type { LegacyRouteDeps } from '../../app/routes/types';
import { createVideoController } from '../controllers/videoController';

export function registerVideoRoutes(deps: LegacyRouteDeps) {
  const { app, authMiddleware, requirePermission } = deps;
  const controller = createVideoController(deps);

  app.get('/videos', authMiddleware, requirePermission('VIDEO_READ'), controller.list);
  app.post('/videos/upload', authMiddleware, requirePermission('VIDEO_WRITE'), controller.upload);
  app.delete('/videos/:id', authMiddleware, requirePermission('VIDEO_DELETE'), controller.remove);
}
