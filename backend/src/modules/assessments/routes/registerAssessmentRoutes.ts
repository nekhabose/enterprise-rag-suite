import type { LegacyRouteDeps } from '../../app/routes/types';
import { createAssessmentController } from '../controllers/assessmentController';

export function registerAssessmentRoutes(deps: LegacyRouteDeps) {
  const { app, authMiddleware, requirePermission } = deps;
  const controller = createAssessmentController(deps);

  app.get('/assessments', authMiddleware, requirePermission('ASSESSMENT_READ'), controller.list);
  app.post('/assessments/create', authMiddleware, requirePermission('ASSESSMENT_WRITE'), controller.create);
  app.get('/assessments/:id', authMiddleware, requirePermission('ASSESSMENT_READ'), controller.getById);
  app.post('/assessments/:id/submit', authMiddleware, requirePermission('ASSESSMENT_READ'), controller.submit);
  app.delete('/assessments/:id', authMiddleware, requirePermission('ASSESSMENT_WRITE'), controller.remove);
}
