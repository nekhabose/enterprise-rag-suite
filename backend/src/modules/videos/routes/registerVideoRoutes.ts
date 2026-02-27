import type { LegacyRouteDeps } from '../../app/routes/types';
import { createVideoController } from '../controllers/videoController';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export function registerVideoRoutes(deps: LegacyRouteDeps) {
  const { app, authMiddleware, requirePermission } = deps;
  const controller = createVideoController(deps);
  const uploadsDir = path.resolve('uploads', 'videos');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const lectureUpload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, uploadsDir),
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `${Date.now()}-${crypto.randomUUID()}${ext}`);
      },
    }),
    limits: { fileSize: 1024 * 1024 * 1024 }, // 1 GB
  });

  app.get('/videos', authMiddleware, requirePermission('VIDEO_READ'), controller.list);
  app.get('/videos/:id/download', authMiddleware, requirePermission('VIDEO_READ'), controller.download);
  app.get('/videos/:id/stream', authMiddleware, requirePermission('VIDEO_READ'), controller.stream);
  app.post('/videos/upload', authMiddleware, requirePermission('VIDEO_WRITE'), controller.upload);
  app.post('/videos/upload-file', authMiddleware, requirePermission('VIDEO_WRITE'), lectureUpload.single('file'), controller.uploadLecture);
  app.delete('/videos/:id', authMiddleware, requirePermission('VIDEO_DELETE'), controller.remove);
}
