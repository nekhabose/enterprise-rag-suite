import type { LegacyRouteDeps } from '../../app/routes/types';
import type { AuthRequest } from '../../../middleware/types';
import type { Response } from 'express';

export function registerStudentExperienceRoutes(deps: LegacyRouteDeps) {
  const { app, pool, authMiddleware, requirePermission } = deps;

  const ensureStudent = (req: AuthRequest, res: Response): boolean => {
    if (req.userRole !== 'STUDENT') {
      res.status(403).json({ error: 'Student access only' });
      return false;
    }
    return true;
  };

  app.get('/student/dashboard', authMiddleware, requirePermission('COURSE_READ'), async (req: AuthRequest, res: Response) => {
    if (!ensureStudent(req, res)) return;
    const tenantId = req.tenantId;
    const userId = req.userId;
    if (!tenantId || !userId) return res.status(403).json({ error: 'Tenant context required' });
    try {
      const events = await pool.query(
        `WITH enrolled_courses AS (
           SELECT c.id, c.title
           FROM courses c
           JOIN course_enrollments ce ON ce.course_id = c.id
           WHERE ce.user_id = $1 AND c.tenant_id = $2
         )
         SELECT * FROM (
           SELECT d.uploaded_at AS activity_at,
                  'announcement'::text AS activity_type,
                  COALESCE(d.filename, 'Course document uploaded') AS title,
                  ec.title AS course_title,
                  d.id AS resource_id
           FROM documents d
           JOIN enrolled_courses ec ON ec.id = d.course_id
           UNION ALL
           SELECT v.created_at AS activity_at,
                  'lecture'::text AS activity_type,
                  COALESCE(v.title, 'New lecture recording') AS title,
                  ec.title AS course_title,
                  v.id AS resource_id
           FROM videos v
           JOIN enrolled_courses ec ON ec.id = v.course_id
           UNION ALL
           SELECT a.created_at AS activity_at,
                  'quiz'::text AS activity_type,
                  COALESCE(a.title, 'Assessment published') AS title,
                  NULL::text AS course_title,
                  a.id AS resource_id
           FROM assessments a
           WHERE a.tenant_id = $2
           UNION ALL
           SELECT r.submitted_at AS activity_at,
                  'submission'::text AS activity_type,
                  'Submission received'::text AS title,
                  NULL::text AS course_title,
                  r.id AS resource_id
           FROM responses r
           WHERE r.user_id = $1
         ) t
         ORDER BY activity_at DESC
         LIMIT 200`,
        [userId, tenantId],
      );
      return res.json({ items: events.rows });
    } catch {
      return res.status(500).json({ error: 'Failed to load student dashboard feed' });
    }
  });

  app.get('/student/courses', authMiddleware, requirePermission('COURSE_READ'), async (req: AuthRequest, res: Response) => {
    if (!ensureStudent(req, res)) return;
    const tenantId = req.tenantId;
    const userId = req.userId;
    if (!tenantId || !userId) return res.status(403).json({ error: 'Tenant context required' });
    try {
      const result = await pool.query(
        `SELECT c.id, c.title, c.description, c.subject, c.is_active, c.created_at,
                u.first_name, u.last_name, u.email AS faculty_email
         FROM courses c
         JOIN course_enrollments ce ON ce.course_id = c.id
         LEFT JOIN users u ON u.id = c.faculty_id
         WHERE ce.user_id = $1 AND c.tenant_id = $2
         ORDER BY c.created_at DESC`,
        [userId, tenantId],
      );
      return res.json({ courses: result.rows });
    } catch {
      return res.status(500).json({ error: 'Failed to load student courses' });
    }
  });

  const ensureEnrolledCourse = async (req: AuthRequest, res: Response, courseId: number): Promise<boolean> => {
    const tenantId = req.tenantId;
    const userId = req.userId;
    if (!tenantId || !userId) {
      res.status(403).json({ error: 'Tenant context required' });
      return false;
    }
    const enrolled = await pool.query(
      `SELECT c.id, c.title, c.description, c.subject, c.created_at
       FROM courses c
       JOIN course_enrollments ce ON ce.course_id = c.id
       WHERE c.id = $1 AND c.tenant_id = $2 AND ce.user_id = $3`,
      [courseId, tenantId, userId],
    );
    if (!enrolled.rows.length) {
      res.status(404).json({ error: 'Course not found or not enrolled' });
      return false;
    }
    (req as AuthRequest & { course?: Record<string, unknown> }).course = enrolled.rows[0];
    return true;
  };

  app.get('/student/courses/:courseId/home', authMiddleware, requirePermission('COURSE_READ'), async (req: AuthRequest, res: Response) => {
    if (!ensureStudent(req, res)) return;
    const courseId = Number(req.params.courseId);
    if (!Number.isFinite(courseId) || courseId <= 0) return res.status(400).json({ error: 'Invalid course ID' });
    try {
      if (!(await ensureEnrolledCourse(req, res, courseId))) return;
      const course = (req as AuthRequest & { course?: Record<string, unknown> }).course ?? {};
      const [docs, videos, quizzes] = await Promise.all([
        pool.query('SELECT COUNT(*)::int AS count FROM documents WHERE course_id = $1', [courseId]),
        pool.query('SELECT COUNT(*)::int AS count FROM videos WHERE course_id = $1', [courseId]),
        pool.query('SELECT COUNT(*)::int AS count FROM course_module_items cmi JOIN course_modules cm ON cm.id = cmi.module_id WHERE cm.course_id = $1 AND cmi.item_type = \'QUIZ\'', [courseId]),
      ]);
      return res.json({
        course,
        summary: {
          documents: docs.rows[0]?.count ?? 0,
          videos: videos.rows[0]?.count ?? 0,
          quizzes: quizzes.rows[0]?.count ?? 0,
        },
      });
    } catch {
      return res.status(500).json({ error: 'Failed to load course home' });
    }
  });

  app.get('/student/courses/:courseId/modules', authMiddleware, requirePermission('COURSE_READ'), async (req: AuthRequest, res: Response) => {
    if (!ensureStudent(req, res)) return;
    const courseId = Number(req.params.courseId);
    if (!Number.isFinite(courseId) || courseId <= 0) return res.status(400).json({ error: 'Invalid course ID' });
    try {
      if (!(await ensureEnrolledCourse(req, res, courseId))) return;
      const userId = req.userId!;

      // Backfill a default authored module if this course predates the module tables.
      const moduleCount = await pool.query('SELECT COUNT(*)::int AS count FROM course_modules WHERE course_id = $1', [courseId]);
      if ((moduleCount.rows[0]?.count ?? 0) === 0) {
        const [docs, vids] = await Promise.all([
          pool.query(
            `SELECT id, filename AS title
             FROM documents
             WHERE course_id = $1
             ORDER BY uploaded_at ASC`,
            [courseId],
          ),
          pool.query(
            `SELECT id, COALESCE(title, youtube_url, 'Video') AS title
             FROM videos
             WHERE course_id = $1
             ORDER BY created_at ASC`,
            [courseId],
          ),
        ]);

        if (docs.rows.length || vids.rows.length) {
          const createdModule = await pool.query(
            `INSERT INTO course_modules (course_id, title, description, position, created_by)
             VALUES ($1, 'Course Content', 'Auto-generated from existing course assets', 1, $2)
             RETURNING id`,
            [courseId, userId],
          );
          const moduleId = createdModule.rows[0].id as number;
          let position = 1;
          for (const d of docs.rows) {
            await pool.query(
              `INSERT INTO course_module_items (module_id, item_type, title, position, document_id)
               VALUES ($1, 'DOCUMENT', $2, $3, $4)`,
              [moduleId, d.title, position++, d.id],
            );
          }
          for (const v of vids.rows) {
            await pool.query(
              `INSERT INTO course_module_items (module_id, item_type, title, position, video_id)
               VALUES ($1, 'VIDEO', $2, $3, $4)`,
              [moduleId, v.title, position++, v.id],
            );
          }
        }
      }

      const result = await pool.query(
        `SELECT cm.id AS module_id,
                cm.title AS module_title,
                cm.description AS module_description,
                cm.position AS module_position,
                cmi.id AS module_item_id,
                LOWER(cmi.item_type) AS item_type,
                cmi.title AS item_title,
                cmi.description AS item_description,
                cmi.position AS item_position,
                cmi.document_id,
                cmi.quiz_id,
                cmi.video_id,
                v.youtube_url AS video_youtube_url,
                COALESCE(v.source_type, 'youtube') AS video_source_type,
                cmi.link_url,
                cmi.due_at,
                COALESCE(smp.status, 'NOT_STARTED') AS progress_status,
                COALESCE(smp.status = 'COMPLETED', false) AS completed
         FROM course_modules cm
         LEFT JOIN course_module_items cmi ON cmi.module_id = cm.id AND cmi.is_published = true
         LEFT JOIN videos v ON v.id = cmi.video_id
         LEFT JOIN student_module_item_progress smp
           ON smp.module_item_id = cmi.id AND smp.user_id = $2
         WHERE cm.course_id = $1 AND cm.is_published = true
         ORDER BY cm.position ASC, cm.id ASC, cmi.position ASC, cmi.id ASC`,
        [courseId, userId],
      );

      const modulesById = new Map<number, { id: number; title: string; description: string | null; items: Record<string, unknown>[] }>();
      for (const row of result.rows) {
        const moduleId = Number(row.module_id);
        if (!modulesById.has(moduleId)) {
          modulesById.set(moduleId, {
            id: moduleId,
            title: row.module_title,
            description: row.module_description,
            items: [],
          });
        }
        if (row.module_item_id) {
          modulesById.get(moduleId)!.items.push({
            module_item_id: row.module_item_id,
            item_type: row.item_type,
            title: row.item_title,
            description: row.item_description,
            position: row.item_position,
            document_id: row.document_id,
            quiz_id: row.quiz_id,
            video_id: row.video_id,
            youtube_url: row.video_youtube_url,
            source_type: row.video_source_type,
            link_url: row.link_url,
            due_at: row.due_at,
            completed: row.completed,
            status: row.progress_status,
            key: `module_item:${row.module_item_id}`,
          });
        }
      }

      return res.json({ modules: Array.from(modulesById.values()) });
    } catch {
      return res.status(500).json({ error: 'Failed to load modules' });
    }
  });

  app.post('/student/courses/:courseId/modules/complete', authMiddleware, requirePermission('COURSE_READ'), async (req: AuthRequest, res: Response) => {
    if (!ensureStudent(req, res)) return;
    const courseId = Number(req.params.courseId);
    const itemKey = String(req.body?.item_key ?? '').trim();
    const inputModuleItemId = Number(req.body?.module_item_id);
    const completed = Boolean(req.body?.completed);
    if (!Number.isFinite(courseId) || courseId <= 0) return res.status(400).json({ error: 'Invalid course ID' });
    let moduleItemId = Number.isFinite(inputModuleItemId) && inputModuleItemId > 0 ? inputModuleItemId : null;
    if (!moduleItemId && itemKey.startsWith('module_item:')) {
      const parsed = Number(itemKey.split(':')[1]);
      if (Number.isFinite(parsed) && parsed > 0) moduleItemId = parsed;
    }
    if (!moduleItemId) return res.status(400).json({ error: 'module_item_id required' });
    try {
      if (!(await ensureEnrolledCourse(req, res, courseId))) return;
      const userId = req.userId!;
      const ownsItem = await pool.query(
        `SELECT cmi.id
         FROM course_module_items cmi
         JOIN course_modules cm ON cm.id = cmi.module_id
         WHERE cmi.id = $1 AND cm.course_id = $2`,
        [moduleItemId, courseId],
      );
      if (!ownsItem.rows.length) return res.status(404).json({ error: 'Module item not found in this course' });

      await pool.query(
        `INSERT INTO student_module_item_progress (module_item_id, user_id, status, completed_at, last_viewed_at, updated_at)
         VALUES ($1,$2,$3,CASE WHEN $4 THEN NOW() ELSE NULL END,NOW(),NOW())
         ON CONFLICT (module_item_id, user_id)
         DO UPDATE SET
           status = EXCLUDED.status,
           completed_at = CASE WHEN EXCLUDED.status = 'COMPLETED' THEN NOW() ELSE NULL END,
           last_viewed_at = NOW(),
           updated_at = NOW()`,
        [moduleItemId, userId, completed ? 'COMPLETED' : 'NOT_STARTED', completed],
      );

      return res.json({
        success: true,
        module_item_id: moduleItemId,
        item_key: itemKey || `module_item:${moduleItemId}`,
        completed,
        status: completed ? 'COMPLETED' : 'NOT_STARTED',
      });
    } catch {
      return res.status(500).json({ error: 'Failed to update completion state' });
    }
  });

  app.get('/student/courses/:courseId/quizzes', authMiddleware, requirePermission('ASSESSMENT_READ'), async (req: AuthRequest, res: Response) => {
    if (!ensureStudent(req, res)) return;
    const courseId = Number(req.params.courseId);
    const search = String(req.query.search ?? '').toLowerCase().trim();
    if (!Number.isFinite(courseId) || courseId <= 0) return res.status(400).json({ error: 'Invalid course ID' });
    try {
      if (!(await ensureEnrolledCourse(req, res, courseId))) return;
      const quizzes = await pool.query(
        `SELECT a.id,
                COALESCE(cmi.title, a.title, 'Quiz') AS title,
                a.difficulty,
                a.created_at,
                cmi.id AS module_item_id,
                COALESCE(smp.status, 'NOT_STARTED') AS status
         FROM course_module_items cmi
         JOIN course_modules cm ON cm.id = cmi.module_id
         JOIN assessments a ON a.id = cmi.quiz_id
         LEFT JOIN student_module_item_progress smp
           ON smp.module_item_id = cmi.id AND smp.user_id = $2
         WHERE cm.course_id = $1 AND cmi.item_type = 'QUIZ' AND cmi.is_published = true
         ORDER BY cmi.position ASC, cmi.id ASC`,
        [courseId, req.userId],
      );
      const filtered = quizzes.rows.filter((q) => !search || String(q.title).toLowerCase().includes(search));
      return res.json({
        quizzes: filtered.map((q) => ({ ...q, points: 100, status: String(q.status).toLowerCase() })),
      });
    } catch {
      return res.status(500).json({ error: 'Failed to load quizzes' });
    }
  });

  app.get('/student/courses/:courseId/files', authMiddleware, requirePermission('DOCUMENT_READ'), async (req: AuthRequest, res: Response) => {
    if (!ensureStudent(req, res)) return;
    const courseId = Number(req.params.courseId);
    if (!Number.isFinite(courseId) || courseId <= 0) return res.status(400).json({ error: 'Invalid course ID' });

    const search = String(req.query.search ?? '').trim().toLowerCase();
    const page = Math.max(1, Number(req.query.page ?? 1) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 10) || 10));
    const sortBy = String(req.query.sort_by ?? 'uploaded_at');
    const sortDir = String(req.query.sort_dir ?? 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const offset = (page - 1) * limit;

    try {
      if (!(await ensureEnrolledCourse(req, res, courseId))) return;
      const [documents, videos] = await Promise.all([
        pool.query(
          `SELECT d.id, d.filename AS name, d.uploaded_at AS created, d.uploaded_at AS last_modified,
                  u.email AS modified_by, d.file_size_bytes AS size, d.is_indexed AS status,
                  d.selected_store_name, d.selected_store_indexed, d.selected_store_error,
                  COALESCE(dc.chunk_count, 0)::int AS chunk_count,
                  CASE
                    WHEN d.selected_store_indexed = true THEN 'Indexed'
                    WHEN d.selected_store_indexed = false THEN 'Failed'
                    WHEN COALESCE(dc.chunk_count, 0) > 0 THEN 'Indexed'
                    WHEN d.uploaded_at > NOW() - INTERVAL '5 minutes' THEN 'Processing'
                    ELSE 'Failed'
                  END AS index_status,
                  'DOCUMENT'::text AS content_type,
                  NULL::text AS youtube_url,
                  'upload'::text AS source_type
           FROM documents d
           LEFT JOIN users u ON u.id = d.user_id
           LEFT JOIN (
             SELECT document_id, COUNT(*) AS chunk_count
             FROM chunks
             WHERE document_id IS NOT NULL
             GROUP BY document_id
           ) dc ON dc.document_id = d.id
           WHERE d.course_id = $1`,
          [courseId],
        ),
        pool.query(
          `SELECT v.id, COALESCE(v.title, v.youtube_url, 'Video') AS name, v.created_at AS created, v.created_at AS last_modified,
                  u.email AS modified_by, v.file_size_bytes AS size, true AS status,
                  v.selected_store_name, v.selected_store_indexed, v.selected_store_error,
                  COALESCE(vc.chunk_count, 0)::int AS chunk_count,
                  CASE
                    WHEN v.selected_store_indexed = true THEN 'Indexed'
                    WHEN v.selected_store_indexed = false THEN 'Failed'
                    WHEN COALESCE(vc.chunk_count, 0) > 0 THEN 'Indexed'
                    WHEN v.created_at > NOW() - INTERVAL '10 minutes' THEN 'Processing'
                    ELSE 'Failed'
                  END AS index_status,
                  'VIDEO'::text AS content_type,
                  v.youtube_url,
                  COALESCE(v.source_type, 'youtube') AS source_type
           FROM videos v
           LEFT JOIN users u ON u.id = v.user_id
           LEFT JOIN (
             SELECT video_id, COUNT(*) AS chunk_count
             FROM chunks
             WHERE video_id IS NOT NULL
             GROUP BY video_id
           ) vc ON vc.video_id = v.id
           WHERE v.course_id = $1`,
          [courseId],
        ),
      ]);

      const combined = [...documents.rows, ...videos.rows].filter((row) => (
        !search || String(row.name ?? '').toLowerCase().includes(search)
      ));

      const valueForSort = (row: Record<string, unknown>): string | number => {
        if (sortBy === 'name') return String(row.name ?? '').toLowerCase();
        if (sortBy === 'created') return new Date(String(row.created ?? 0)).getTime();
        if (sortBy === 'last_modified') return new Date(String(row.last_modified ?? 0)).getTime();
        if (sortBy === 'modified_by') return String(row.modified_by ?? '').toLowerCase();
        if (sortBy === 'size') return Number(row.size ?? 0);
        if (sortBy === 'status') return String(row.index_status ?? '').toLowerCase();
        return new Date(String(row.created ?? 0)).getTime();
      };

      combined.sort((a, b) => {
        const av = valueForSort(a as Record<string, unknown>);
        const bv = valueForSort(b as Record<string, unknown>);
        if (typeof av === 'number' && typeof bv === 'number') {
          return sortDir === 'ASC' ? av - bv : bv - av;
        }
        const cmp = String(av).localeCompare(String(bv));
        return sortDir === 'ASC' ? cmp : -cmp;
      });

      const totalCount = combined.length;
      const pageItems = combined.slice(offset, offset + limit);
      return res.json({
        items: pageItems,
        pagination: {
          page,
          limit,
          total: totalCount,
        },
      });
    } catch {
      return res.status(500).json({ error: 'Failed to load files' });
    }
  });

  app.get('/student/courses/:courseId/files/:contentType/:sourceId/chunks', authMiddleware, requirePermission('DOCUMENT_READ'), async (req: AuthRequest, res: Response) => {
    if (!ensureStudent(req, res)) return;
    const courseId = Number(req.params.courseId);
    const sourceId = Number(req.params.sourceId);
    const contentType = String(req.params.contentType || '').toUpperCase();
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 30) || 30));
    if (!Number.isFinite(courseId) || courseId <= 0 || !Number.isFinite(sourceId) || sourceId <= 0) {
      return res.status(400).json({ error: 'Invalid course or source id' });
    }
    if (!['DOCUMENT', 'VIDEO'].includes(contentType)) {
      return res.status(400).json({ error: 'contentType must be DOCUMENT or VIDEO' });
    }
    try {
      if (!(await ensureEnrolledCourse(req, res, courseId))) return;
      const sourceQuery = contentType === 'DOCUMENT'
        ? await pool.query('SELECT id, filename AS name FROM documents WHERE id = $1 AND course_id = $2', [sourceId, courseId])
        : await pool.query("SELECT id, COALESCE(title, youtube_url, 'Video') AS name FROM videos WHERE id = $1 AND course_id = $2", [sourceId, courseId]);
      if (!sourceQuery.rows.length) return res.status(404).json({ error: 'Source not found in this course' });
      const tenantId = req.tenantId!;
      const chunks = contentType === 'DOCUMENT'
        ? await pool.query(
            `SELECT chunk_index, content, metadata
             FROM chunks
             WHERE tenant_id = $1 AND document_id = $2
             ORDER BY chunk_index ASC
             LIMIT $3`,
            [tenantId, sourceId, limit],
          )
        : await pool.query(
            `SELECT chunk_index, content, metadata
             FROM chunks
             WHERE tenant_id = $1 AND video_id = $2
             ORDER BY chunk_index ASC
             LIMIT $3`,
            [tenantId, sourceId, limit],
          );
      return res.json({
        source: {
          id: sourceId,
          type: contentType,
          name: sourceQuery.rows[0].name,
          course_id: courseId,
        },
        chunk_count: chunks.rows.length,
        chunks: chunks.rows.map((row) => {
          const content = String(row.content ?? '');
          return {
            chunk_index: Number(row.chunk_index ?? 0),
            preview: content.slice(0, 600),
            size_chars: content.length,
            size_words: content.trim() ? content.trim().split(/\s+/).length : 0,
            metadata: typeof row.metadata === 'object' && row.metadata !== null ? row.metadata : {},
          };
        }),
      });
    } catch {
      return res.status(500).json({ error: 'Failed to load chunks' });
    }
  });

  app.get('/student/courses/:courseId/assignments', authMiddleware, requirePermission('ASSESSMENT_READ'), async (req: AuthRequest, res: Response) => {
    if (!ensureStudent(req, res)) return;
    const courseId = Number(req.params.courseId);
    if (!Number.isFinite(courseId) || courseId <= 0) return res.status(400).json({ error: 'Invalid course ID' });
    try {
      if (!(await ensureEnrolledCourse(req, res, courseId))) return;
      const userId = req.userId!;
      const result = await pool.query(
        `SELECT a.id, a.title, a.description, a.due_at, a.is_published,
                s.id AS submission_id, s.status AS submission_status, s.score, s.feedback, s.submitted_at, s.graded_at
         FROM assignments a
         LEFT JOIN assignment_submissions s ON s.assignment_id = a.id AND s.student_id = $2
         WHERE a.course_id = $1 AND a.is_published = true
         ORDER BY a.due_at NULLS LAST, a.created_at DESC`,
        [courseId, userId],
      );
      return res.json({ assignments: result.rows });
    } catch {
      return res.status(500).json({ error: 'Failed to load assignments' });
    }
  });

  app.post('/student/courses/:courseId/assignments/:assignmentId/submit', authMiddleware, requirePermission('ASSESSMENT_READ'), async (req: AuthRequest, res: Response) => {
    if (!ensureStudent(req, res)) return;
    const courseId = Number(req.params.courseId);
    const assignmentId = Number(req.params.assignmentId);
    if (!Number.isFinite(courseId) || courseId <= 0 || !Number.isFinite(assignmentId) || assignmentId <= 0) {
      return res.status(400).json({ error: 'Invalid course or assignment ID' });
    }
    try {
      if (!(await ensureEnrolledCourse(req, res, courseId))) return;
      const userId = req.userId!;
      const assignment = await pool.query(
        'SELECT id FROM assignments WHERE id = $1 AND course_id = $2 AND is_published = true',
        [assignmentId, courseId],
      );
      if (!assignment.rows.length) return res.status(404).json({ error: 'Assignment not found' });
      const result = await pool.query(
        `INSERT INTO assignment_submissions (assignment_id, student_id, submission_text, submission_url, status, submitted_at)
         VALUES ($1,$2,$3,$4,'submitted',NOW())
         ON CONFLICT (assignment_id, student_id)
         DO UPDATE SET
           submission_text = EXCLUDED.submission_text,
           submission_url = EXCLUDED.submission_url,
           status = 'submitted',
           submitted_at = NOW(),
           feedback = NULL,
           graded_at = NULL
         RETURNING *`,
        [
          assignmentId,
          userId,
          req.body?.submission_text ? String(req.body.submission_text) : null,
          req.body?.submission_url ? String(req.body.submission_url) : null,
        ],
      );
      return res.json({ submission: result.rows[0] });
    } catch {
      return res.status(500).json({ error: 'Failed to submit assignment' });
    }
  });

  app.get('/student/courses/:courseId/inbox/threads', authMiddleware, requirePermission('CHAT_USE'), async (req: AuthRequest, res: Response) => {
    if (!ensureStudent(req, res)) return;
    const courseId = Number(req.params.courseId);
    if (!Number.isFinite(courseId) || courseId <= 0) return res.status(400).json({ error: 'Invalid course ID' });
    try {
      if (!(await ensureEnrolledCourse(req, res, courseId))) return;
      const userId = req.userId!;
      const threads = await pool.query(
        `SELECT t.id, t.title, t.status, t.updated_at, t.created_by, t.target_user_id,
                (SELECT body FROM course_inbox_messages m WHERE m.thread_id = t.id ORDER BY m.created_at DESC LIMIT 1) AS snippet
         FROM course_inbox_threads t
         WHERE t.course_id = $1
           AND (t.target_user_id IS NULL OR t.target_user_id = $2 OR t.created_by = $2)
         ORDER BY t.updated_at DESC`,
        [courseId, userId],
      );
      return res.json({ threads: threads.rows });
    } catch {
      return res.status(500).json({ error: 'Failed to load course inbox threads' });
    }
  });

  app.post('/student/courses/:courseId/inbox/threads', authMiddleware, requirePermission('CHAT_USE'), async (req: AuthRequest, res: Response) => {
    if (!ensureStudent(req, res)) return;
    const courseId = Number(req.params.courseId);
    const title = String(req.body?.title ?? '').trim();
    const body = String(req.body?.body ?? '').trim();
    if (!Number.isFinite(courseId) || courseId <= 0) return res.status(400).json({ error: 'Invalid course ID' });
    if (!title || !body) return res.status(400).json({ error: 'title and body required' });
    try {
      if (!(await ensureEnrolledCourse(req, res, courseId))) return;
      const userId = req.userId!;
      const tenantId = req.tenantId!;
      const faculty = await pool.query(
        'SELECT faculty_id FROM courses WHERE id = $1 AND tenant_id = $2',
        [courseId, tenantId],
      );
      if (!faculty.rows.length) return res.status(404).json({ error: 'Course not found' });
      const thread = await pool.query(
        `INSERT INTO course_inbox_threads (course_id, tenant_id, created_by, target_user_id, title, status, updated_at)
         VALUES ($1,$2,$3,$4,$5,'open',NOW())
         RETURNING *`,
        [courseId, tenantId, userId, faculty.rows[0].faculty_id ?? null, title],
      );
      await pool.query(
        `INSERT INTO course_inbox_messages (thread_id, sender_id, body)
         VALUES ($1,$2,$3)`,
        [thread.rows[0].id, userId, body],
      );
      return res.status(201).json({ thread: thread.rows[0] });
    } catch {
      return res.status(500).json({ error: 'Failed to create course thread' });
    }
  });

  app.get('/student/courses/:courseId/inbox/threads/:threadId', authMiddleware, requirePermission('CHAT_USE'), async (req: AuthRequest, res: Response) => {
    if (!ensureStudent(req, res)) return;
    const courseId = Number(req.params.courseId);
    const threadId = Number(req.params.threadId);
    if (!Number.isFinite(courseId) || courseId <= 0 || !Number.isFinite(threadId) || threadId <= 0) {
      return res.status(400).json({ error: 'Invalid course or thread ID' });
    }
    try {
      if (!(await ensureEnrolledCourse(req, res, courseId))) return;
      const userId = req.userId!;
      const thread = await pool.query(
        `SELECT id
         FROM course_inbox_threads
         WHERE id = $1 AND course_id = $2
           AND (target_user_id IS NULL OR target_user_id = $3 OR created_by = $3)`,
        [threadId, courseId, userId],
      );
      if (!thread.rows.length) return res.status(404).json({ error: 'Thread not found' });
      const messages = await pool.query(
        `SELECT m.id, m.body, m.created_at, m.sender_id, u.email, u.first_name, u.last_name, u.role
         FROM course_inbox_messages m
         LEFT JOIN users u ON u.id = m.sender_id
         WHERE m.thread_id = $1
         ORDER BY m.created_at ASC`,
        [threadId],
      );
      return res.json({ messages: messages.rows });
    } catch {
      return res.status(500).json({ error: 'Failed to load thread messages' });
    }
  });

  app.post('/student/courses/:courseId/inbox/threads/:threadId/messages', authMiddleware, requirePermission('CHAT_USE'), async (req: AuthRequest, res: Response) => {
    if (!ensureStudent(req, res)) return;
    const courseId = Number(req.params.courseId);
    const threadId = Number(req.params.threadId);
    const body = String(req.body?.body ?? '').trim();
    if (!Number.isFinite(courseId) || courseId <= 0 || !Number.isFinite(threadId) || threadId <= 0) {
      return res.status(400).json({ error: 'Invalid course or thread ID' });
    }
    if (!body) return res.status(400).json({ error: 'body required' });
    try {
      if (!(await ensureEnrolledCourse(req, res, courseId))) return;
      const userId = req.userId!;
      const thread = await pool.query(
        `SELECT id
         FROM course_inbox_threads
         WHERE id = $1 AND course_id = $2
           AND (target_user_id IS NULL OR target_user_id = $3 OR created_by = $3)`,
        [threadId, courseId, userId],
      );
      if (!thread.rows.length) return res.status(404).json({ error: 'Thread not found' });
      const msg = await pool.query(
        `INSERT INTO course_inbox_messages (thread_id, sender_id, body)
         VALUES ($1,$2,$3)
         RETURNING *`,
        [threadId, userId, body],
      );
      await pool.query('UPDATE course_inbox_threads SET updated_at = NOW() WHERE id = $1', [threadId]);
      return res.status(201).json({ message: msg.rows[0] });
    } catch {
      return res.status(500).json({ error: 'Failed to send reply' });
    }
  });

  app.get('/student/calendar', authMiddleware, requirePermission('COURSE_READ'), async (req: AuthRequest, res: Response) => {
    if (!ensureStudent(req, res)) return;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const courseId = req.query.course_id ? Number(req.query.course_id) : null;
    if (!tenantId || !userId) return res.status(403).json({ error: 'Tenant context required' });
    try {
      const params: unknown[] = [userId, tenantId];
      let courseFilter = '';
      if (courseId && Number.isFinite(courseId)) {
        params.push(courseId);
        courseFilter = ` AND ec.id = $${params.length}`;
      }
      const result = await pool.query(
        `WITH enrolled_courses AS (
           SELECT c.id, c.title
           FROM courses c
           JOIN course_enrollments ce ON ce.course_id = c.id
           WHERE ce.user_id = $1 AND c.tenant_id = $2 ${courseFilter}
         )
         SELECT * FROM (
           SELECT d.uploaded_at AS event_at, 'content'::text AS event_type, COALESCE(d.filename, 'Document uploaded') AS title, ec.id AS course_id, ec.title AS course_title
           FROM documents d JOIN enrolled_courses ec ON ec.id = d.course_id
           UNION ALL
           SELECT v.created_at AS event_at, 'lecture'::text AS event_type, COALESCE(v.title, 'Lecture posted') AS title, ec.id AS course_id, ec.title AS course_title
           FROM videos v JOIN enrolled_courses ec ON ec.id = v.course_id
           UNION ALL
           SELECT a.created_at AS event_at, 'quiz'::text AS event_type, COALESCE(a.title, 'Assessment available') AS title, NULL::int AS course_id, NULL::text AS course_title
           FROM assessments a WHERE a.tenant_id = $2
         ) t
         ORDER BY event_at DESC`,
        params,
      );
      return res.json({ events: result.rows });
    } catch {
      return res.status(500).json({ error: 'Failed to load calendar events' });
    }
  });

  app.get('/student/inbox', authMiddleware, requirePermission('CHAT_USE'), async (req: AuthRequest, res: Response) => {
    if (!ensureStudent(req, res)) return;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const selectedConversationId = req.query.conversation_id ? Number(req.query.conversation_id) : null;
    if (!tenantId || !userId) return res.status(403).json({ error: 'Tenant context required' });
    try {
      const list = await pool.query(
        `SELECT c.id, c.title, c.created_at,
                MAX(m.created_at) AS last_message_at,
                COALESCE((ARRAY_AGG(m.content ORDER BY m.created_at DESC))[1], '') AS snippet
         FROM conversations c
         LEFT JOIN messages m ON m.conversation_id = c.id
         WHERE c.user_id = $1 AND c.tenant_id = $2
         GROUP BY c.id
         ORDER BY COALESCE(MAX(m.created_at), c.created_at) DESC`,
        [userId, tenantId],
      );

      const conversationId = selectedConversationId ?? (list.rows[0]?.id as number | undefined);
      let messages: unknown[] = [];
      if (conversationId && Number.isFinite(conversationId)) {
        const msg = await pool.query(
          `SELECT id, role, content, created_at, sources
           FROM messages
           WHERE conversation_id = $1
           ORDER BY created_at ASC`,
          [conversationId],
        );
        messages = msg.rows;
      }
      return res.json({ conversations: list.rows, selected_conversation_id: conversationId ?? null, messages });
    } catch {
      return res.status(500).json({ error: 'Failed to load inbox' });
    }
  });

  app.get('/student/history', authMiddleware, requirePermission('COURSE_READ'), async (req: AuthRequest, res: Response) => {
    if (!ensureStudent(req, res)) return;
    const userId = req.userId;
    const tenantId = req.tenantId;
    if (!userId || !tenantId) return res.status(403).json({ error: 'Tenant context required' });
    try {
      const result = await pool.query(
        `SELECT created_at, action, resource_type, resource_id, details
         FROM audit_logs
         WHERE user_id = $1 AND tenant_id = $2 AND created_at >= NOW() - INTERVAL '30 days'
         ORDER BY created_at DESC
         LIMIT 200`,
        [userId, tenantId],
      );
      return res.json({ items: result.rows });
    } catch {
      return res.status(500).json({ error: 'Failed to load history' });
    }
  });

  app.get('/student/account', authMiddleware, async (req: AuthRequest, res: Response) => {
    if (!ensureStudent(req, res)) return;
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const profile = await pool.query(
        `SELECT id, email, first_name, last_name, role, created_at, last_login_at
         FROM users
         WHERE id = $1`,
        [userId],
      );
      const settings = await pool.query(
        `SELECT settings, updated_at FROM user_settings WHERE user_id = $1`,
        [userId],
      );
      return res.json({
        profile: profile.rows[0] ?? null,
        settings: settings.rows[0]?.settings ?? {},
      });
    } catch {
      return res.status(500).json({ error: 'Failed to load account' });
    }
  });
}
