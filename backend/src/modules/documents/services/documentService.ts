import type { AuthRequest } from '../../../middleware/types';
import type { Response } from 'express';
import type { LegacyRouteDeps } from '../../app/routes/types';
import { createDocumentRepository } from '../repositories/documentRepository';

export function createDocumentService(deps: LegacyRouteDeps) {
  const { pool, ROLES, AI_SERVICE_URL, axios, fs, path, logAudit } = deps;
  const repo = createDocumentRepository(pool);

  return {
    async upload(req: AuthRequest, res: Response) {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

      const userId = req.userId!;
      const tenantId = req.tenantId!;
      const { provider, model, embedding_model, chunking_strategy, course_id, subject, year } = req.body;

      try {
        const ext = deps.path.extname(req.file.originalname || '').replace('.', '').toLowerCase();
        const fileType = ext || 'file';
        const normalizedCourseId = course_id ? Number(course_id) : null;
        if (req.userRole === ROLES.FACULTY) {
          if (!normalizedCourseId || !Number.isFinite(normalizedCourseId)) {
            return res.status(400).json({ error: 'Faculty upload requires a valid course_id' });
          }
          const assigned = await repo.query(
            'SELECT id FROM courses WHERE id = $1 AND tenant_id = $2 AND faculty_id = $3',
            [normalizedCourseId, tenantId, userId],
          );
          if (!assigned.rows.length) {
            return res.status(403).json({ error: 'Faculty can upload content only to assigned courses' });
          }
        }

        const absolutePath = path.resolve(req.file.path);
        const dbResult = await repo.query(
          `INSERT INTO documents (user_id, tenant_id, filename, file_path, file_type, file_size_bytes, subject, year, course_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
          [userId, tenantId, req.file.originalname, absolutePath,
            fileType, req.file.size, subject ?? null, year ? parseInt(year) : null, normalizedCourseId],
        );
        const documentId = dbResult.rows[0].id;

        try {
          const aiHeaders = req.headers.authorization
            ? { Authorization: req.headers.authorization as string }
            : undefined;

          let aiResponse: any = null;
          try {
            aiResponse = await axios.post(
              `${AI_SERVICE_URL}/ai/index-document`,
              {
                document_id: documentId,
                file_path: absolutePath,
                provider: provider ?? 'groq',
                model: model ?? null,
                embedding_model: embedding_model ?? null,
                chunking_strategy: chunking_strategy ?? 'semantic',
              },
              { timeout: 120000, headers: aiHeaders },
            );
          } catch {
            // Keep flow working with current AI service even when legacy endpoint is unavailable.
            aiResponse = { data: { chunks_created: 0, warning: 'AI indexing endpoint unavailable; stored document only.' } };
          }

          await repo.query('UPDATE documents SET is_indexed = true WHERE id = $1', [documentId]);

          logAudit(userId, tenantId, 'document.upload', 'document', documentId,
            { filename: req.file.originalname, provider, chunks: aiResponse.data?.chunks_created }, 'info', req);

          return res.json({
            success: true,
            document_id: documentId,
            filename: req.file.originalname,
            chunks_created: aiResponse.data?.chunks_created ?? 0,
            warning: aiResponse.data?.warning,
          });
        } catch (aiErr: any) {
          await repo.query('DELETE FROM documents WHERE id = $1', [documentId]);
          fs.unlink(absolutePath, () => {});
          return res.status(500).json({ error: 'Failed to index document', details: aiErr.response?.data?.detail });
        }
      } catch (err) {
        console.error('[DOCUMENTS] Upload error:', err);
        return res.status(500).json({ error: 'Failed to upload document' });
      }
    },

    async list(req: AuthRequest, res: Response) {
      const { userId, tenantId, userRole } = req;
      const { course_id } = req.query;

      try {
        const params: any[] = [tenantId];
        let q = `SELECT d.id, d.filename, d.subject, d.year, d.uploaded_at, d.is_indexed,
                        d.file_size_bytes, d.course_id, u.email as uploaded_by
                 FROM documents d JOIN users u ON d.user_id = u.id
                 WHERE d.tenant_id = $1`;

        if (userRole === ROLES.STUDENT) {
          q += ` AND (d.user_id = $2 OR d.course_id IN (
                   SELECT course_id FROM course_enrollments WHERE user_id = $2))`;
          params.push(userId);
        } else if (userRole === ROLES.FACULTY) {
          q += ` AND (d.user_id = $2 OR d.course_id IN (
                   SELECT id FROM courses WHERE faculty_id = $2 AND tenant_id = $1))`;
          params.push(userId);
        }

        if (course_id) {
          params.push(parseInt(course_id as string));
          q += ` AND d.course_id = $${params.length}`;
        }

        q += ' ORDER BY d.uploaded_at DESC';
        const result = await repo.query(q, params);
        return res.json(result.rows);
      } catch {
        return res.status(500).json({ error: 'Failed to fetch documents' });
      }
    },

    async remove(req: AuthRequest, res: Response) {
      const docId = parseInt(req.params.id);
      const tenantId = req.tenantId!;
      const userId = req.userId!;
      const isTenantAdmin = req.userRole === ROLES.TENANT_ADMIN || req.userRole === ROLES.SUPER_ADMIN;

      try {
        const where = isTenantAdmin
          ? 'id = $1 AND tenant_id = $2'
          : 'id = $1 AND tenant_id = $2 AND user_id = $3';
        const params = isTenantAdmin ? [docId, tenantId] : [docId, tenantId, userId];

        const result = await repo.query(
          `DELETE FROM documents WHERE ${where} RETURNING id, file_path`,
          params,
        );
        if (!result.rows.length) return res.status(404).json({ error: 'Document not found' });

        const filePath = result.rows[0].file_path;
        if (filePath && fs.existsSync(filePath)) fs.unlink(filePath, () => {});

        logAudit(userId, tenantId, 'document.delete', 'document', docId, {}, 'info', req);
        return res.json({ success: true });
      } catch {
        return res.status(500).json({ error: 'Failed to delete document' });
      }
    },

    async download(req: AuthRequest, res: Response) {
      const docId = parseInt(req.params.id);
      const tenantId = req.tenantId!;
      const userId = req.userId!;
      const userRole = req.userRole;

      try {
        const params: unknown[] = [docId, tenantId];
        let q = 'SELECT filename, file_path, course_id, user_id FROM documents WHERE id = $1 AND tenant_id = $2';
        if (userRole === ROLES.STUDENT) {
          params.push(userId);
          q += ` AND (user_id = $3 OR course_id IN (SELECT course_id FROM course_enrollments WHERE user_id = $3))`;
        } else if (userRole === ROLES.FACULTY) {
          params.push(userId);
          q += ` AND (user_id = $3 OR course_id IN (SELECT id FROM courses WHERE faculty_id = $3 AND tenant_id = $2))`;
        }
        const result = await repo.query(q, params);
        if (!result.rows.length) return res.status(404).json({ error: 'Document not found' });

        const { filename, file_path } = result.rows[0];
        if (!file_path || !fs.existsSync(file_path)) {
          return res.status(404).json({ error: 'File not found on disk' });
        }

        logAudit(userId, tenantId, 'document.download', 'document', docId, {}, 'info', req);
        return res.download(file_path, filename);
      } catch {
        return res.status(500).json({ error: 'Failed to download document' });
      }
    },
  };
}
