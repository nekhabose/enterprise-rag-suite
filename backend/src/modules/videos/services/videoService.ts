import type { AuthRequest } from '../../../middleware/types';
import type { Response } from 'express';
import type { LegacyRouteDeps } from '../../app/routes/types';
import { createVideoRepository } from '../repositories/videoRepository';

export function createVideoService(deps: LegacyRouteDeps) {
  const { ROLES, AI_SERVICE_URL, axios, logAudit } = deps;
  const repo = createVideoRepository(deps.pool);

  return {
    list: async (req: AuthRequest, res: Response) => {
      const { userId, tenantId, userRole } = req;

      try {
        let q = `SELECT v.id, v.title, v.youtube_url, v.subject, v.year, v.created_at as uploaded_at,
                        u.email as uploaded_by
                 FROM videos v
                 JOIN users u ON v.user_id = u.id
                 WHERE v.tenant_id = $1`;

        const params: unknown[] = [tenantId];

        if (userRole === ROLES.STUDENT) {
          q += ` AND (v.user_id = $2 OR v.course_id IN (SELECT course_id FROM course_enrollments WHERE user_id = $2))`;
          params.push(userId);
        } else if (userRole === ROLES.FACULTY) {
          q += ` AND (v.user_id = $2 OR v.course_id IN (SELECT id FROM courses WHERE faculty_id = $2 AND tenant_id = $1))`;
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
      const { youtube_url, title, subject, year, provider, model, chunking_strategy, course_id } = req.body;
      const userId = req.userId!;
      const tenantId = req.tenantId!;

      if (!youtube_url) {
        return res.status(400).json({ error: 'YouTube URL required' });
      }

      const ytRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[A-Za-z0-9_-]{6,}/;
      if (!ytRegex.test(youtube_url)) {
        return res.status(400).json({ error: 'Invalid YouTube URL' });
      }

      try {
        const normalizedCourseId = course_id ? Number(course_id) : null;
        if (req.userRole === ROLES.FACULTY) {
          if (!normalizedCourseId || !Number.isFinite(normalizedCourseId)) {
            return res.status(400).json({ error: 'Faculty video upload requires a valid course_id' });
          }
          const assigned = await repo.query(
            'SELECT id FROM courses WHERE id = $1 AND tenant_id = $2 AND faculty_id = $3',
            [normalizedCourseId, tenantId, userId],
          );
          if (!assigned.rows.length) {
            return res.status(403).json({ error: 'Faculty can upload videos only to assigned courses' });
          }
        }

        const result = await repo.query(
          `INSERT INTO videos (user_id, tenant_id, youtube_url, title, subject, year, course_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
          [userId, tenantId, youtube_url, title ?? 'Untitled Video', subject ?? null, year ?? null, normalizedCourseId],
        );

        const videoId = result.rows[0].id;

        try {
          const aiHeaders = req.headers.authorization
            ? { Authorization: req.headers.authorization as string }
            : undefined;

          let aiResponse: any = null;
          try {
            aiResponse = await axios.post(
              `${AI_SERVICE_URL}/api/ingest/youtube`,
              {
                tenant_id: tenantId,
                source_type: 'youtube',
                source_url: youtube_url,
                subject: subject ?? null,
                year: year ?? null,
              },
              { timeout: 600000, headers: aiHeaders },
            );
          } catch {
            try {
              aiResponse = await axios.post(
                `${AI_SERVICE_URL}/ai/ingest-youtube`,
                {
                  video_id: videoId,
                  youtube_url,
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

          await logAudit(userId, tenantId, 'video.upload', 'video', videoId, { youtube_url }, 'info', req);
          return res.json({ success: true, video_id: videoId, ...(aiResponse.data as object) });
        } catch (aiErr: any) {
          await repo.query('DELETE FROM videos WHERE id = $1', [videoId]);
          return res.status(500).json({ error: 'Failed to ingest video', details: aiErr.response?.data?.detail ?? aiErr.message });
        }
      } catch {
        return res.status(500).json({ error: 'Failed to save video' });
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
        const result = await repo.query(`DELETE FROM videos WHERE ${where} RETURNING id`, params);

        if (!result.rows.length) {
          return res.status(404).json({ error: 'Video not found' });
        }

        await logAudit(userId, tenantId, 'video.delete', 'video', videoId, {}, 'info', req);
        return res.json({ success: true });
      } catch {
        return res.status(500).json({ error: 'Failed to delete video' });
      }
    },
  };
}
