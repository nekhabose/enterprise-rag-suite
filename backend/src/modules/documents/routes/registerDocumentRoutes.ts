import type { LegacyRouteDeps } from '../../app/routes/types';
import { createDocumentController } from '../controllers/documentController';

export function registerDocumentRoutes(deps: LegacyRouteDeps) {
  const { app, authMiddleware, requirePermission, upload } = deps;
  const controller = createDocumentController(deps);

  app.post('/documents/upload', authMiddleware, requirePermission('DOCUMENT_WRITE'), upload.single('file'), controller.upload);
  app.get('/documents', authMiddleware, requirePermission('DOCUMENT_READ'), controller.list);
  app.delete('/documents/:id', authMiddleware, requirePermission('DOCUMENT_DELETE'), controller.remove);
  app.get('/documents/:id/download', authMiddleware, requirePermission('DOCUMENT_READ'), controller.download);
}
