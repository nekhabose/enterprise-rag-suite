import type { AuthRequest } from '../../../middleware/types';
import type { Response } from 'express';
import type { LegacyRouteDeps } from '../../app/routes/types';
import { createVideoRepository } from '../repositories/videoRepository';
import fs from 'fs';

export function createVideoService(deps: LegacyRouteDeps) {
  const { ROLES, AI_SERVICE_URL, axios, logAudit } = deps;
  const repo = createVideoRepository(deps.pool);
  const aiCleanupHeaders = (req: AuthRequest, tenantId: number) => req.headers.authorization
    ? { Authorization: req.headers.authorization as string }
    : {
        'X-Internal-Secret': process.env.AI_SERVICE_SECRET || 'internal-service-secret-key',
        'X-Tenant-Id': String(tenantId),
      };

  return {
    list: async (req: AuthRequest, res: Response) => {
      const { userId, tenantId, userRole } = req;

      try {
        let q = `SELECT v.id, v.title, v.youtube_url, v.file_path, v.source_type, v.mime_type, v.file_size_bytes,
                        v.selected_store_name, v.selected_store_indexed, v.selected_store_error,
                        v.course_id,
                        v.subject, v.year, v.created_at as uploaded_at,
                        u.email as uploaded_by
                 FROM videos v
                 JOIN users u ON v.user_id = u.id
                 WHERE v.tenant_id = $1`;

        const params: unknown[] = [tenantId];

        if (userRole === ROLES.STUDENT) {
          q += ` AND (v.user_id = $2 OR v.course_id IN (SELECT course_id FROM course_enrollments WHERE user_id = $2))`;
          params.push(userId);
        } else if (userRole === ROLES.FACULTY) {
          q += ` AND (
                   v.user_id = $2
                   OR v.course_id IN (
                     SELECT c.id
                     FROM courses c
                     WHERE c.tenant_id = $1
                       AND (
                         c.faculty_id = $2
                         OR EXISTS (
                           SELECT 1 FROM course_instructors ci
                           WHERE ci.course_id = c.id AND ci.user_id = $2
                         )
                       )
                   )
                 )`;
          params.push(userId);
        }

        q += ' ORDER BY v.created_at DESC';
        const result = await repo.query(q, params);
        return res.json(result.rows);
      } catch {
        return res.status(500).json({ error: 'Failed to fetch videos' });
      }
    },

    upload: async (req: AuthRequest, res: Response) => {
      const { youtube_url, source_url, title, subject, year, provider, model, chunking_strategy, course_id } = req.body;
      const userId = req.userId!;
      const tenantId = req.tenantId!;
      const sourceUrl = String(source_url ?? youtube_url ?? '').trim();

      if (!sourceUrl) {
        return res.status(400).json({ error: 'Source URL required' });
      }

      const ytRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[A-Za-z0-9_-]{6,}/;
      const isYouTube = ytRegex.test(sourceUrl);
      const isWeb = /^https?:\/\//i.test(sourceUrl);
      if (!isYouTube && !isWeb) return res.status(400).json({ error: 'Invalid URL. Provide a YouTube or web URL' });

      try {
        const normalizedCourseId = course_id ? Number(course_id) : null;
        if (req.userRole === ROLES.FACULTY) {
          if (!normalizedCourseId || !Number.isFinite(normalizedCourseId)) {
            return res.status(400).json({ error: 'Faculty video upload requires a valid course_id' });
          }
          const assigned = await repo.query(
            `SELECT c.id
             FROM courses c
             WHERE c.id = $1 AND c.tenant_id = $2
               AND (
                 c.faculty_id = $3
                 OR EXISTS (
                   SELECT 1 FROM course_instructors ci
                   WHERE ci.course_id = c.id AND ci.user_id = $3
                 )
               )`,
            [normalizedCourseId, tenantId, userId],
          );
          if (!assigned.rows.length) {
            return res.status(403).json({ error: 'Faculty can upload videos only to assigned courses' });
          }
        }

        const result = await repo.query(
          `INSERT INTO videos (user_id, tenant_id, source_type, youtube_url, title, subject, year, course_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
          [userId, tenantId, isYouTube ? 'youtube' : 'web', sourceUrl, title ?? (isYouTube ? 'Untitled Video' : 'Web Resource'), subject ?? null, year ?? null, normalizedCourseId],
        );

        const videoId = result.rows[0].id;

        try {
          const aiHeaders = req.headers.authorization
            ? { Authorization: req.headers.authorization as string }
            : undefined;

          let aiResponse: any = null;
          try {
            if (isYouTube) {
              aiResponse = await axios.post(
                `${AI_SERVICE_URL}/ai/ingest-youtube`,
                {
                  tenant_id: tenantId,
                  source_type: 'youtube',
                  source_url: sourceUrl,
                  video_id: videoId,
                  course_id: normalizedCourseId,
                  title: title ?? 'Lecture Video',
                  subject: subject ?? null,
                  year: year ?? null,
                },
                { timeout: 600000, headers: aiHeaders },
              );
            } else {
              aiResponse = await axios.post(
                `${AI_SERVICE_URL}/ai/ingest-web`,
                {
                  tenant_id: tenantId,
                  course_id: normalizedCourseId,
                  url: sourceUrl,
                  video_id: videoId,
                  title: title ?? 'Web Resource',
                },
                { timeout: 180000, headers: aiHeaders },
              );
            }
          } catch {
            try {
              aiResponse = await axios.post(
                `${AI_SERVICE_URL}/ai/ingest-youtube`,
                {
                  video_id: videoId,
                  source_url: sourceUrl,
                  tenant_id: tenantId,
                  source_type: isYouTube ? 'youtube' : 'web',
                  course_id: normalizedCourseId,
                  provider: provider ?? 'groq',
                  model: model ?? null,
                  chunking_strategy: chunking_strategy ?? 'fixed_size',
                },
                { timeout: 600000, headers: aiHeaders },
              );
            } catch {
              aiResponse = { data: { warning: 'AI video ingestion endpoint unavailable; video metadata stored only.' } };
            }
          }

          await logAudit(userId, tenantId, 'video.upload', 'video', videoId, { source_url: sourceUrl, source_type: isYouTube ? 'youtube' : 'web' }, 'info', req);
          return res.json({ success: true, video_id: videoId, ...(aiResponse.data as object) });
        } catch (aiErr: any) {
          return res.status(202).json({
            success: true,
            video_id: videoId,
            warning: 'Video saved but ingestion is pending/failed. Retry ingestion after checking AI service logs.',
            details: aiErr.response?.data?.detail ?? aiErr.message,
          });
        }
      } catch {
        return res.status(500).json({ error: 'Failed to save video' });
      }
    },

    uploadLecture: async (req: AuthRequest, res: Response) => {
      const { title, subject, year, course_id } = req.body;
      const userId = req.userId!;
      const tenantId = req.tenantId!;
      const file = req.file;
      const normalizedCourseId = course_id ? Number(course_id) : null;

      if (!file) {
        return res.status(400).json({ error: 'Lecture file required' });
      }
      if (!normalizedCourseId || !Number.isFinite(normalizedCourseId)) {
        return res.status(400).json({ error: 'course_id required' });
      }

      try {
        if (req.userRole === ROLES.FACULTY) {
          const assigned = await repo.query(
            `SELECT c.id
             FROM courses c
             WHERE c.id = $1 AND c.tenant_id = $2
               AND (
                 c.faculty_id = $3
                 OR EXISTS (
                   SELECT 1 FROM course_instructors ci
                   WHERE ci.course_id = c.id AND ci.user_id = $3
                 )
               )`,
            [normalizedCourseId, tenantId, userId],
          );
          if (!assigned.rows.length) {
            return res.status(403).json({ error: 'Faculty can upload recordings only to assigned courses' });
          }
        }

        const result = await repo.query(
          `INSERT INTO videos
            (user_id, tenant_id, source_type, title, file_path, mime_type, file_size_bytes, subject, year, course_id)
           VALUES ($1,$2,'upload',$3,$4,$5,$6,$7,$8,$9)
           RETURNING id, title, source_type, file_path, mime_type, file_size_bytes, course_id`,
          [
            userId,
            tenantId,
            title ?? file.originalname ?? 'Lecture Recording',
            file.path,
            file.mimetype ?? null,
            file.size ?? null,
            subject ?? null,
            year ?? null,
            normalizedCourseId,
          ],
        );
        const videoId = Number(result.rows[0].id);
        try {
          const aiHeaders = req.headers.authorization
            ? { Authorization: req.headers.authorization as string }
            : undefined;
          await axios.post(
            `${AI_SERVICE_URL}/ai/index-video-upload`,
            {
              video_id: videoId,
              file_path: file.path,
              chunking_strategy: req.body?.chunking_strategy ?? null,
              embedding_model: req.body?.embedding_model ?? null,
            },
            { timeout: 600000, headers: aiHeaders },
          );
        } catch (e) {
          console.warn('[VIDEOS] Lecture indexing warning:', (e as any)?.message ?? e);
        }
        await logAudit(
          userId,
          tenantId,
          'video.upload_file',
          'video',
          result.rows[0].id,
          { course_id: normalizedCourseId, file_name: file.originalname, mime_type: file.mimetype, size: file.size },
          'info',
          req,
        );
        return res.status(201).json({ success: true, video: result.rows[0] });
      } catch {
        return res.status(500).json({ error: 'Failed to upload lecture recording' });
      }
    },

    remove: async (req: AuthRequest, res: Response) => {
      const videoId = parseInt(req.params.id);
      const tenantId = req.tenantId!;
      const userId = req.userId!;
      const isTenantAdmin = req.userRole === ROLES.TENANT_ADMIN || req.userRole === ROLES.SUPER_ADMIN;

      try {
        const where = isTenantAdmin ? 'id = $1 AND tenant_id = $2' : 'id = $1 AND tenant_id = $2 AND user_id = $3';
        const params = isTenantAdmin ? [videoId, tenantId] : [videoId, tenantId, userId];
        const existing = await repo.query(
          `SELECT id, course_id, selected_store_name, file_path
           FROM videos
           WHERE ${where}`,
          params,
        );

        if (!existing.rows.length) {
          return res.status(404).json({ error: 'Video not found' });
        }

        const row = existing.rows[0];

        try {
          await axios.post(
            `${AI_SERVICE_URL}/ai/delete-source`,
            {
              tenant_id: tenantId,
              source_kind: 'video',
              source_id: videoId,
              course_id: row.course_id ?? null,
              vector_store: row.selected_store_name ?? null,
            },
            { timeout: 30000, headers: aiCleanupHeaders(req, tenantId) },
          );
        } catch (cleanupErr) {
          console.warn('[VIDEOS] AI cleanup warning:', (cleanupErr as any)?.message ?? cleanupErr);
        }

        await repo.query(
          'DELETE FROM chunks WHERE tenant_id = $1 AND video_id = $2',
          [tenantId, videoId],
        );
        await repo.query(
          'DELETE FROM videos WHERE id = $1 AND tenant_id = $2',
          [videoId, tenantId],
        );
        if (row.file_path && fs.existsSync(row.file_path)) {
          fs.unlink(row.file_path, () => {});
        }

        await logAudit(userId, tenantId, 'video.delete', 'video', videoId, {}, 'info', req);
        return res.json({ success: true });
      } catch {
        return res.status(500).json({ error: 'Failed to delete video' });
      }
    },

    download: async (req: AuthRequest, res: Response) => {
      const videoId = Number(req.params.id);
      const tenantId = req.tenantId!;
      const userId = req.userId!;
      const userRole = req.userRole!;

      if (!Number.isFinite(videoId) || videoId <= 0) {
        return res.status(400).json({ error: 'Invalid video ID' });
      }

      try {
        let query = `SELECT v.id, v.title, v.file_path, v.source_type, v.course_id
                     FROM videos v
                     WHERE v.id = $1 AND v.tenant_id = $2`;
        const params: unknown[] = [videoId, tenantId];

        if (userRole === ROLES.STUDENT) {
          query += ` AND (
            v.course_id IN (SELECT course_id FROM course_enrollments WHERE user_id = $3)
            OR v.user_id = $3
          )`;
          params.push(userId);
        } else if (userRole === ROLES.FACULTY) {
          query += ` AND (
            v.user_id = $3
            OR EXISTS (
              SELECT 1 FROM courses c
              WHERE c.id = v.course_id
                AND c.tenant_id = $2
                AND (
                  c.faculty_id = $3
                  OR EXISTS (SELECT 1 FROM course_instructors ci WHERE ci.course_id = c.id AND ci.user_id = $3)
                )
            )
          )`;
          params.push(userId);
        }

        const result = await repo.query(query, params);
        if (!result.rows.length) return res.status(404).json({ error: 'Video not found' });
        const video = result.rows[0];
        if (video.source_type !== 'upload' || !video.file_path) {
          return res.status(400).json({ error: 'Only uploaded recordings can be downloaded from this endpoint' });
        }
        if (!fs.existsSync(video.file_path)) {
          return res.status(404).json({ error: 'Recording file not found on disk' });
        }
        const safeName = `${String(video.title ?? 'lecture-recording')}`.replace(/[^\w.\- ]+/g, '').trim() || 'lecture-recording';
        return res.download(video.file_path, safeName);
      } catch {
        return res.status(500).json({ error: 'Failed to download video file' });
      }
    },

    stream: async (req: AuthRequest, res: Response) => {
      const videoId = Number(req.params.id);
      const tenantId = req.tenantId!;
      const userId = req.userId!;
      const userRole = req.userRole!;

      if (!Number.isFinite(videoId) || videoId <= 0) {
        return res.status(400).json({ error: 'Invalid video ID' });
      }

      try {
        let query = `SELECT v.id, v.title, v.file_path, v.source_type, v.course_id, v.mime_type
                     FROM videos v
                     WHERE v.id = $1 AND v.tenant_id = $2`;
        const params: unknown[] = [videoId, tenantId];

        if (userRole === ROLES.STUDENT) {
          query += ` AND (
            v.course_id IN (SELECT course_id FROM course_enrollments WHERE user_id = $3)
            OR v.user_id = $3
          )`;
          params.push(userId);
        } else if (userRole === ROLES.FACULTY) {
          query += ` AND (
            v.user_id = $3
            OR EXISTS (
              SELECT 1 FROM courses c
              WHERE c.id = v.course_id
                AND c.tenant_id = $2
                AND (
                  c.faculty_id = $3
                  OR EXISTS (SELECT 1 FROM course_instructors ci WHERE ci.course_id = c.id AND ci.user_id = $3)
                )
            )
          )`;
          params.push(userId);
        }

        const result = await repo.query(query, params);
        if (!result.rows.length) return res.status(404).json({ error: 'Video not found' });
        const video = result.rows[0];
        if (video.source_type !== 'upload' || !video.file_path) {
          return res.status(400).json({ error: 'Only uploaded recordings can be streamed from this endpoint' });
        }
        if (!fs.existsSync(video.file_path)) {
          return res.status(404).json({ error: 'Recording file not found on disk' });
        }
        if (video.mime_type) {
          res.setHeader('Content-Type', String(video.mime_type));
        }
        return res.sendFile(video.file_path);
      } catch {
        return res.status(500).json({ error: 'Failed to stream video file' });
      }
    },
  };
}
