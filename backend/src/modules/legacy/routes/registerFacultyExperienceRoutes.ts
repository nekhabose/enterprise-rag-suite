import type { LegacyRouteDeps } from '../../app/routes/types';
import type { AuthRequest } from '../../../middleware/types';
import type { Response } from 'express';

export function registerFacultyExperienceRoutes(deps: LegacyRouteDeps) {
  const { app, pool, authMiddleware, requirePermission, ROLES, AI_SERVICE_URL, axios, logAudit } = deps;

  const ensureFaculty = (req: AuthRequest, res: Response): boolean => {
    if (req.userRole !== ROLES.FACULTY) {
      res.status(403).json({ error: 'Faculty access only' });
      return false;
    }
    return true;
  };

  const ensureAssignedCourse = async (req: AuthRequest, res: Response, courseId: number): Promise<boolean> => {
    const tenantId = req.tenantId;
    const facultyId = req.userId;
    if (!tenantId || !facultyId) {
      res.status(403).json({ error: 'Tenant context required' });
      return false;
    }
    const found = await pool.query(
      `SELECT id, title, description, subject, created_at
       FROM courses
       WHERE id = $1 AND tenant_id = $2 AND faculty_id = $3`,
      [courseId, tenantId, facultyId],
    );
    if (!found.rows.length) {
      res.status(404).json({ error: 'Course not found or not assigned' });
      return false;
    }
    (req as AuthRequest & { course?: Record<string, unknown> }).course = found.rows[0];
    return true;
  };

  app.get('/faculty/dashboard', authMiddleware, requirePermission('COURSE_READ'), async (req: AuthRequest, res: Response) => {
    if (!ensureFaculty(req, res)) return;
    const tenantId = req.tenantId;
    const facultyId = req.userId;
    if (!tenantId || !facultyId) return res.status(403).json({ error: 'Tenant context required' });
    try {
      const [courses, pendingGrading, upcoming, recentActivity, messages] = await Promise.all([
        pool.query('SELECT COUNT(*)::int AS count FROM courses WHERE tenant_id = $1 AND faculty_id = $2', [tenantId, facultyId]),
        pool.query(
          `SELECT COUNT(*)::int AS count
           FROM assignment_submissions s
           JOIN assignments a ON a.id = s.assignment_id
           WHERE a.tenant_id = $1 AND a.faculty_id = $2 AND s.status = 'submitted' AND s.score IS NULL`,
          [tenantId, facultyId],
        ),
        pool.query(
          `SELECT a.id, a.title, a.due_at, c.title AS course_title
           FROM assignments a
           JOIN courses c ON c.id = a.course_id
           WHERE a.tenant_id = $1 AND a.faculty_id = $2 AND a.due_at IS NOT NULL
           ORDER BY a.due_at ASC
           LIMIT 10`,
          [tenantId, facultyId],
        ),
        pool.query(
          `SELECT al.action, al.resource_type, al.created_at, al.details
           FROM audit_logs al
           WHERE al.user_id = $1 AND al.tenant_id = $2
           ORDER BY al.created_at DESC
           LIMIT 20`,
          [facultyId, tenantId],
        ),
        pool.query(
          `SELECT COUNT(*)::int AS count
           FROM course_inbox_threads t
           JOIN courses c ON c.id = t.course_id
           WHERE t.tenant_id = $1 AND c.faculty_id = $2 AND t.status = 'open'`,
          [tenantId, facultyId],
        ),
      ]);

      return res.json({
        stats: {
          my_courses: courses.rows[0]?.count ?? 0,
          to_grade: pendingGrading.rows[0]?.count ?? 0,
          open_threads: messages.rows[0]?.count ?? 0,
        },
        upcoming_due: upcoming.rows,
        recent_activity: recentActivity.rows,
      });
    } catch {
      return res.status(500).json({ error: 'Failed to load faculty dashboard' });
    }
  });

  app.get('/faculty/courses', authMiddleware, requirePermission('COURSE_READ'), async (req: AuthRequest, res: Response) => {
    if (!ensureFaculty(req, res)) return;
    const tenantId = req.tenantId;
    const facultyId = req.userId;
    if (!tenantId || !facultyId) return res.status(403).json({ error: 'Tenant context required' });
    try {
      const result = await pool.query(
        `SELECT id, title, description, subject, is_active, created_at
         FROM courses
         WHERE tenant_id = $1 AND faculty_id = $2
         ORDER BY created_at DESC`,
        [tenantId, facultyId],
      );
      return res.json({ courses: result.rows });
    } catch {
      return res.status(500).json({ error: 'Failed to load faculty courses' });
    }
  });

  app.get('/faculty/courses/:courseId/home', authMiddleware, requirePermission('COURSE_READ'), async (req: AuthRequest, res: Response) => {
    if (!ensureFaculty(req, res)) return;
    const courseId = Number(req.params.courseId);
    if (!Number.isFinite(courseId) || courseId <= 0) return res.status(400).json({ error: 'Invalid course ID' });
    try {
      if (!(await ensureAssignedCourse(req, res, courseId))) return;
      const [students, modules, quizzes, assignments] = await Promise.all([
        pool.query('SELECT COUNT(*)::int AS count FROM course_enrollments ce JOIN users u ON u.id = ce.user_id WHERE ce.course_id = $1 AND u.role = \'STUDENT\'', [courseId]),
        pool.query('SELECT COUNT(*)::int AS count FROM course_modules WHERE course_id = $1', [courseId]),
        pool.query('SELECT COUNT(*)::int AS count FROM assessment_settings WHERE course_id = $1', [courseId]),
        pool.query('SELECT COUNT(*)::int AS count FROM assignments WHERE course_id = $1', [courseId]),
      ]);
      return res.json({
        course: (req as AuthRequest & { course?: Record<string, unknown> }).course ?? {},
        summary: {
          students: students.rows[0]?.count ?? 0,
          modules: modules.rows[0]?.count ?? 0,
          quizzes: quizzes.rows[0]?.count ?? 0,
          assignments: assignments.rows[0]?.count ?? 0,
        },
      });
    } catch {
      return res.status(500).json({ error: 'Failed to load course home' });
    }
  });

  app.get('/faculty/courses/:courseId/modules', authMiddleware, requirePermission('COURSE_WRITE'), async (req: AuthRequest, res: Response) => {
    if (!ensureFaculty(req, res)) return;
    const courseId = Number(req.params.courseId);
    if (!Number.isFinite(courseId) || courseId <= 0) return res.status(400).json({ error: 'Invalid course ID' });
    try {
      if (!(await ensureAssignedCourse(req, res, courseId))) return;
      const rows = await pool.query(
        `SELECT cm.id AS module_id, cm.title AS module_title, cm.description AS module_description,
                cm.position AS module_position, cm.is_published AS module_published,
                cmi.id AS module_item_id, cmi.item_type, cmi.title AS item_title, cmi.description AS item_description,
                cmi.position AS item_position, cmi.is_published AS item_published,
                cmi.document_id, cmi.quiz_id, cmi.video_id, cmi.link_url, cmi.due_at
         FROM course_modules cm
         LEFT JOIN course_module_items cmi ON cmi.module_id = cm.id
         WHERE cm.course_id = $1
         ORDER BY cm.position ASC, cm.id ASC, cmi.position ASC, cmi.id ASC`,
        [courseId],
      );

      const grouped = new Map<number, { id: number; title: string; description: string | null; position: number; is_published: boolean; items: Record<string, unknown>[] }>();
      for (const row of rows.rows) {
        const moduleId = Number(row.module_id);
        if (!grouped.has(moduleId)) {
          grouped.set(moduleId, {
            id: moduleId,
            title: row.module_title,
            description: row.module_description,
            position: Number(row.module_position ?? 0),
            is_published: Boolean(row.module_published),
            items: [],
          });
        }
        if (row.module_item_id) {
          grouped.get(moduleId)!.items.push({
            id: row.module_item_id,
            item_type: row.item_type,
            title: row.item_title,
            description: row.item_description,
            position: row.item_position,
            is_published: row.item_published,
            document_id: row.document_id,
            quiz_id: row.quiz_id,
            video_id: row.video_id,
            link_url: row.link_url,
            due_at: row.due_at,
          });
        }
      }
      return res.json({ modules: Array.from(grouped.values()) });
    } catch {
      return res.status(500).json({ error: 'Failed to load modules' });
    }
  });

  app.post('/faculty/courses/:courseId/modules', authMiddleware, requirePermission('COURSE_WRITE'), async (req: AuthRequest, res: Response) => {
    if (!ensureFaculty(req, res)) return;
    const courseId = Number(req.params.courseId);
    const title = String(req.body?.title ?? '').trim();
    const description = req.body?.description ? String(req.body.description) : null;
    if (!title) return res.status(400).json({ error: 'title required' });
    try {
      if (!(await ensureAssignedCourse(req, res, courseId))) return;
      const posResult = await pool.query('SELECT COALESCE(MAX(position), 0) + 1 AS next_pos FROM course_modules WHERE course_id = $1', [courseId]);
      const result = await pool.query(
        `INSERT INTO course_modules (course_id, title, description, position, created_by)
         VALUES ($1,$2,$3,$4,$5)
         RETURNING *`,
        [courseId, title, description, posResult.rows[0].next_pos, req.userId],
      );
      logAudit(req.userId, req.tenantId, 'faculty.module.create', 'course_module', result.rows[0].id, { course_id: courseId, title }, 'info', req);
      return res.status(201).json({ module: result.rows[0] });
    } catch {
      return res.status(500).json({ error: 'Failed to create module' });
    }
  });

  app.put('/faculty/courses/:courseId/modules/reorder', authMiddleware, requirePermission('COURSE_WRITE'), async (req: AuthRequest, res: Response) => {
    if (!ensureFaculty(req, res)) return;
    const courseId = Number(req.params.courseId);
    const moduleIds = Array.isArray(req.body?.module_ids) ? req.body.module_ids.map((id: unknown) => Number(id)).filter((id: number) => Number.isFinite(id)) : [];
    try {
      if (!(await ensureAssignedCourse(req, res, courseId))) return;
      for (let index = 0; index < moduleIds.length; index += 1) {
        await pool.query('UPDATE course_modules SET position = $1, updated_at = NOW() WHERE id = $2 AND course_id = $3', [index + 1, moduleIds[index], courseId]);
      }
      return res.json({ success: true });
    } catch {
      return res.status(500).json({ error: 'Failed to reorder modules' });
    }
  });

  app.put('/faculty/courses/:courseId/modules/:moduleId/toggle-publish', authMiddleware, requirePermission('COURSE_WRITE'), async (req: AuthRequest, res: Response) => {
    if (!ensureFaculty(req, res)) return;
    const courseId = Number(req.params.courseId);
    const moduleId = Number(req.params.moduleId);
    try {
      if (!(await ensureAssignedCourse(req, res, courseId))) return;
      const result = await pool.query(
        `UPDATE course_modules
         SET is_published = NOT is_published, updated_at = NOW()
         WHERE id = $1 AND course_id = $2
         RETURNING *`,
        [moduleId, courseId],
      );
      if (!result.rows.length) return res.status(404).json({ error: 'Module not found' });
      return res.json({ module: result.rows[0] });
    } catch {
      return res.status(500).json({ error: 'Failed to toggle module publish state' });
    }
  });

  app.post('/faculty/courses/:courseId/modules/:moduleId/items', authMiddleware, requirePermission('COURSE_WRITE'), async (req: AuthRequest, res: Response) => {
    if (!ensureFaculty(req, res)) return;
    const courseId = Number(req.params.courseId);
    const moduleId = Number(req.params.moduleId);
    const itemType = String(req.body?.item_type ?? '').toUpperCase();
    const title = String(req.body?.title ?? '').trim();
    if (!['DOCUMENT', 'QUIZ', 'ASSIGNMENT', 'LINK', 'VIDEO', 'PAGE'].includes(itemType)) return res.status(400).json({ error: 'Invalid item_type' });
    if (!title) return res.status(400).json({ error: 'title required' });
    try {
      if (!(await ensureAssignedCourse(req, res, courseId))) return;
      const moduleExists = await pool.query('SELECT id FROM course_modules WHERE id = $1 AND course_id = $2', [moduleId, courseId]);
      if (!moduleExists.rows.length) return res.status(404).json({ error: 'Module not found' });
      const nextPos = await pool.query('SELECT COALESCE(MAX(position), 0) + 1 AS next_pos FROM course_module_items WHERE module_id = $1', [moduleId]);
      const result = await pool.query(
        `INSERT INTO course_module_items
          (module_id, item_type, title, description, position, document_id, quiz_id, video_id, link_url, due_at, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
         RETURNING *`,
        [
          moduleId,
          itemType === 'PAGE' ? 'LINK' : itemType,
          title,
          req.body?.description ? String(req.body.description) : null,
          nextPos.rows[0].next_pos,
          req.body?.document_id ? Number(req.body.document_id) : null,
          req.body?.quiz_id ? Number(req.body.quiz_id) : null,
          req.body?.video_id ? Number(req.body.video_id) : null,
          req.body?.link_url ? String(req.body.link_url) : null,
          req.body?.due_at ? String(req.body.due_at) : null,
          JSON.stringify(itemType === 'PAGE' ? { page_content: req.body?.page_content ?? '' } : (req.body?.metadata ?? {})),
        ],
      );
      return res.status(201).json({ item: result.rows[0] });
    } catch {
      return res.status(500).json({ error: 'Failed to create module item' });
    }
  });

  app.put('/faculty/courses/:courseId/modules/:moduleId/items/:itemId', authMiddleware, requirePermission('COURSE_WRITE'), async (req: AuthRequest, res: Response) => {
    if (!ensureFaculty(req, res)) return;
    const courseId = Number(req.params.courseId);
    const moduleId = Number(req.params.moduleId);
    const itemId = Number(req.params.itemId);
    try {
      if (!(await ensureAssignedCourse(req, res, courseId))) return;
      const result = await pool.query(
        `UPDATE course_module_items cmi
         SET title = COALESCE($1, cmi.title),
             description = COALESCE($2, cmi.description),
             is_published = COALESCE($3, cmi.is_published),
             due_at = COALESCE($4, cmi.due_at),
             link_url = COALESCE($5, cmi.link_url),
             updated_at = NOW()
         FROM course_modules cm
         WHERE cmi.id = $6 AND cmi.module_id = cm.id AND cm.id = $7 AND cm.course_id = $8
         RETURNING cmi.*`,
        [
          req.body?.title ?? null,
          req.body?.description ?? null,
          req.body?.is_published ?? null,
          req.body?.due_at ?? null,
          req.body?.link_url ?? null,
          itemId,
          moduleId,
          courseId,
        ],
      );
      if (!result.rows.length) return res.status(404).json({ error: 'Module item not found' });
      return res.json({ item: result.rows[0] });
    } catch {
      return res.status(500).json({ error: 'Failed to update module item' });
    }
  });

  app.put('/faculty/courses/:courseId/modules/:moduleId/items/reorder', authMiddleware, requirePermission('COURSE_WRITE'), async (req: AuthRequest, res: Response) => {
    if (!ensureFaculty(req, res)) return;
    const courseId = Number(req.params.courseId);
    const moduleId = Number(req.params.moduleId);
    const itemIds = Array.isArray(req.body?.item_ids) ? req.body.item_ids.map((id: unknown) => Number(id)).filter((id: number) => Number.isFinite(id)) : [];
    try {
      if (!(await ensureAssignedCourse(req, res, courseId))) return;
      for (let index = 0; index < itemIds.length; index += 1) {
        await pool.query('UPDATE course_module_items SET position = $1, updated_at = NOW() WHERE id = $2 AND module_id = $3', [index + 1, itemIds[index], moduleId]);
      }
      return res.json({ success: true });
    } catch {
      return res.status(500).json({ error: 'Failed to reorder module items' });
    }
  });

  app.get('/faculty/courses/:courseId/files', authMiddleware, requirePermission('DOCUMENT_READ'), async (req: AuthRequest, res: Response) => {
    if (!ensureFaculty(req, res)) return;
    const courseId = Number(req.params.courseId);
    if (!Number.isFinite(courseId) || courseId <= 0) return res.status(400).json({ error: 'Invalid course ID' });
    try {
      if (!(await ensureAssignedCourse(req, res, courseId))) return;
      const [documents, videos] = await Promise.all([
        pool.query(
          `SELECT d.id, d.filename AS name, d.uploaded_at AS created, d.uploaded_at AS last_modified,
                  u.email AS modified_by, d.file_size_bytes AS size, d.is_indexed AS status,
                  'DOCUMENT'::text AS content_type
           FROM documents d
           LEFT JOIN users u ON u.id = d.user_id
           WHERE d.course_id = $1
           ORDER BY d.uploaded_at DESC`,
          [courseId],
        ),
        pool.query(
          `SELECT v.id, COALESCE(v.title, v.youtube_url, 'Video') AS name, v.created_at AS created, v.created_at AS last_modified,
                  u.email AS modified_by, NULL::bigint AS size, true AS status,
                  'VIDEO'::text AS content_type, v.youtube_url
           FROM videos v
           LEFT JOIN users u ON u.id = v.user_id
           WHERE v.course_id = $1
           ORDER BY v.created_at DESC`,
          [courseId],
        ),
      ]);
      return res.json({ items: [...documents.rows, ...videos.rows] });
    } catch {
      return res.status(500).json({ error: 'Failed to load files' });
    }
  });

  app.post('/faculty/courses/:courseId/files/attach', authMiddleware, requirePermission('COURSE_WRITE'), async (req: AuthRequest, res: Response) => {
    if (!ensureFaculty(req, res)) return;
    const courseId = Number(req.params.courseId);
    const moduleId = Number(req.body?.module_id);
    const contentType = String(req.body?.content_type ?? '').toUpperCase();
    const sourceId = Number(req.body?.source_id);
    if (!Number.isFinite(moduleId) || moduleId <= 0) return res.status(400).json({ error: 'module_id required' });
    if (!['DOCUMENT', 'VIDEO'].includes(contentType)) return res.status(400).json({ error: 'content_type must be DOCUMENT or VIDEO' });
    if (!Number.isFinite(sourceId) || sourceId <= 0) return res.status(400).json({ error: 'source_id required' });
    try {
      if (!(await ensureAssignedCourse(req, res, courseId))) return;
      const titleRow = contentType === 'DOCUMENT'
        ? await pool.query('SELECT filename AS title FROM documents WHERE id = $1 AND course_id = $2', [sourceId, courseId])
        : await pool.query('SELECT COALESCE(title, youtube_url, \'Video\') AS title FROM videos WHERE id = $1 AND course_id = $2', [sourceId, courseId]);
      if (!titleRow.rows.length) return res.status(404).json({ error: 'Source content not found in this course' });
      const nextPos = await pool.query('SELECT COALESCE(MAX(position), 0) + 1 AS next_pos FROM course_module_items WHERE module_id = $1', [moduleId]);
      const item = await pool.query(
        `INSERT INTO course_module_items (module_id, item_type, title, position, document_id, video_id)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING *`,
        [moduleId, contentType, titleRow.rows[0].title, nextPos.rows[0].next_pos, contentType === 'DOCUMENT' ? sourceId : null, contentType === 'VIDEO' ? sourceId : null],
      );
      return res.status(201).json({ item: item.rows[0] });
    } catch {
      return res.status(500).json({ error: 'Failed to attach file to module' });
    }
  });

  app.get('/faculty/courses/:courseId/quizzes', authMiddleware, requirePermission('ASSESSMENT_READ'), async (req: AuthRequest, res: Response) => {
    if (!ensureFaculty(req, res)) return;
    const courseId = Number(req.params.courseId);
    const search = String(req.query.search ?? '').trim().toLowerCase();
    try {
      if (!(await ensureAssignedCourse(req, res, courseId))) return;
      const result = await pool.query(
        `SELECT a.id, a.title, a.difficulty, a.created_at, s.due_at, s.time_limit_minutes, s.attempts_allowed,
                s.is_published, s.source_type, s.needs_review
         FROM assessment_settings s
         JOIN assessments a ON a.id = s.assessment_id
         WHERE s.course_id = $1
         ORDER BY a.created_at DESC`,
        [courseId],
      );
      const quizzes = result.rows.filter((q) => !search || String(q.title).toLowerCase().includes(search));
      return res.json({ quizzes });
    } catch {
      return res.status(500).json({ error: 'Failed to load quizzes' });
    }
  });

  app.post('/faculty/courses/:courseId/quizzes/manual', authMiddleware, requirePermission('ASSESSMENT_WRITE'), async (req: AuthRequest, res: Response) => {
    if (!ensureFaculty(req, res)) return;
    const courseId = Number(req.params.courseId);
    const title = String(req.body?.title ?? '').trim();
    const questions = Array.isArray(req.body?.questions) ? req.body.questions : [];
    if (!title) return res.status(400).json({ error: 'title required' });
    if (!questions.length) return res.status(400).json({ error: 'At least one question required' });
    try {
      if (!(await ensureAssignedCourse(req, res, courseId))) return;
      const assessment = await pool.query(
        `INSERT INTO assessments (user_id, tenant_id, title, assessment_type, difficulty)
         VALUES ($1,$2,$3,'quiz',$4)
         RETURNING *`,
        [req.userId, req.tenantId, title, req.body?.difficulty ?? 'medium'],
      );
      const assessmentId = assessment.rows[0].id as number;
      for (const q of questions) {
        const qText = String(q?.question_text ?? q?.title ?? '').trim();
        if (!qText) continue;
        await pool.query(
          `INSERT INTO questions (assessment_id, question_text, question_type, correct_answer, options, points)
           VALUES ($1,$2,$3,$4,$5::jsonb,$6)`,
          [
            assessmentId,
            qText,
            String(q?.question_type ?? 'mcq'),
            q?.correct_answer ?? null,
            JSON.stringify({ options: q?.options ?? [], citations: q?.citations ?? [] }),
            Number(q?.points ?? 1),
          ],
        );
      }
      await pool.query(
        `INSERT INTO assessment_settings (assessment_id, course_id, due_at, time_limit_minutes, attempts_allowed, is_published, source_type, needs_review, provenance, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,'MANUAL',false,$7::jsonb,NOW())
         ON CONFLICT (assessment_id) DO UPDATE SET
           due_at = EXCLUDED.due_at,
           time_limit_minutes = EXCLUDED.time_limit_minutes,
           attempts_allowed = EXCLUDED.attempts_allowed,
           is_published = EXCLUDED.is_published,
           updated_at = NOW()`,
        [
          assessmentId,
          courseId,
          req.body?.due_at ?? null,
          req.body?.time_limit_minutes ?? null,
          Number(req.body?.attempts_allowed ?? 1),
          Boolean(req.body?.is_published),
          JSON.stringify({ authoring: 'manual' }),
        ],
      );
      await pool.query(
        `INSERT INTO course_module_items (module_id, item_type, title, quiz_id, position, due_at)
         SELECT cm.id, 'QUIZ', $2, $1, COALESCE(MAX(cmi.position), 0) + 1, $3
         FROM course_modules cm
         LEFT JOIN course_module_items cmi ON cmi.module_id = cm.id
         WHERE cm.course_id = $4
         GROUP BY cm.id
         ORDER BY cm.position ASC
         LIMIT 1`,
        [assessmentId, title, req.body?.due_at ?? null, courseId],
      );
      logAudit(req.userId, req.tenantId, 'faculty.quiz.create_manual', 'assessment', assessmentId, { course_id: courseId }, 'info', req);
      return res.status(201).json({ assessment: assessment.rows[0] });
    } catch {
      return res.status(500).json({ error: 'Failed to create manual quiz' });
    }
  });

  app.post('/faculty/courses/:courseId/quizzes/generate', authMiddleware, requirePermission('ASSESSMENT_WRITE'), async (req: AuthRequest, res: Response) => {
    if (!ensureFaculty(req, res)) return;
    const courseId = Number(req.params.courseId);
    const title = String(req.body?.title ?? 'Generated Quiz').trim();
    const documentIds = Array.isArray(req.body?.document_ids) ? req.body.document_ids.map((id: unknown) => Number(id)).filter((id: number) => Number.isFinite(id)) : [];
    try {
      if (!(await ensureAssignedCourse(req, res, courseId))) return;
      const aiHeaders = req.headers.authorization ? { Authorization: req.headers.authorization as string } : undefined;
      let generatedQuestions: Record<string, unknown>[] = [];
      let provenance: Record<string, unknown> = {
        source_files: documentIds,
        model: req.body?.model ?? null,
        provider: req.body?.provider ?? 'groq',
        prompt_version: 'faculty-rag-v1',
      };

      try {
        const aiResult = await axios.post(
          `${AI_SERVICE_URL}/ai/create-assessment`,
          {
            title,
            document_ids: documentIds,
            question_count: Number(req.body?.question_count ?? 5),
            difficulty: req.body?.difficulty ?? 'medium',
            question_types: req.body?.question_types ?? ['multiple_choice', 'true_false', 'short_answer'],
            provider: req.body?.provider ?? 'groq',
            model: req.body?.model ?? null,
            learning_objectives: req.body?.learning_objectives ?? null,
          },
          { timeout: 180000, headers: aiHeaders },
        );
        generatedQuestions = Array.isArray(aiResult.data?.questions) ? aiResult.data.questions : [];
        provenance = { ...provenance, ai_response_meta: aiResult.data?.meta ?? {}, chunk_ids: aiResult.data?.chunk_ids ?? [] };
      } catch {
        generatedQuestions = [
          {
            question_text: `Generated question for "${title}"`,
            question_type: 'short_answer',
            correct_answer: null,
            options: [],
            points: 1,
            citations: [],
          },
        ];
        provenance = { ...provenance, warning: 'AI generation unavailable; fallback draft generated' };
      }

      const assessment = await pool.query(
        `INSERT INTO assessments (user_id, tenant_id, title, assessment_type, difficulty)
         VALUES ($1,$2,$3,'quiz',$4)
         RETURNING *`,
        [req.userId, req.tenantId, title, req.body?.difficulty ?? 'medium'],
      );
      const assessmentId = assessment.rows[0].id as number;
      let needsReview = false;

      for (const rawQ of generatedQuestions) {
        const questionText = String(rawQ?.question_text ?? rawQ?.question ?? '').trim();
        if (!questionText) continue;
        const citations = Array.isArray(rawQ?.citations) ? rawQ.citations : [];
        if (!citations.length) needsReview = true;
        await pool.query(
          `INSERT INTO questions (assessment_id, question_text, question_type, correct_answer, options, points)
           VALUES ($1,$2,$3,$4,$5::jsonb,$6)`,
          [
            assessmentId,
            questionText,
            String(rawQ?.question_type ?? 'mcq'),
            rawQ?.correct_answer ?? null,
            JSON.stringify({ options: rawQ?.options ?? [], citations }),
            Number(rawQ?.points ?? 1),
          ],
        );
      }

      await pool.query(
        `INSERT INTO assessment_settings (assessment_id, course_id, due_at, time_limit_minutes, attempts_allowed, is_published, source_type, needs_review, provenance, updated_at)
         VALUES ($1,$2,$3,$4,$5,false,'RAG',$6,$7::jsonb,NOW())
         ON CONFLICT (assessment_id) DO UPDATE SET
           due_at = EXCLUDED.due_at,
           time_limit_minutes = EXCLUDED.time_limit_minutes,
           attempts_allowed = EXCLUDED.attempts_allowed,
           needs_review = EXCLUDED.needs_review,
           provenance = EXCLUDED.provenance,
           updated_at = NOW()`,
        [
          assessmentId,
          courseId,
          req.body?.due_at ?? null,
          req.body?.time_limit_minutes ?? null,
          Number(req.body?.attempts_allowed ?? 1),
          needsReview,
          JSON.stringify(provenance),
        ],
      );

      await pool.query(
        `INSERT INTO course_module_items (module_id, item_type, title, quiz_id, position, due_at, metadata)
         SELECT cm.id, 'QUIZ', $2, $1, COALESCE(MAX(cmi.position), 0) + 1, $3, $4::jsonb
         FROM course_modules cm
         LEFT JOIN course_module_items cmi ON cmi.module_id = cm.id
         WHERE cm.course_id = $5
         GROUP BY cm.id
         ORDER BY cm.position ASC
         LIMIT 1`,
        [assessmentId, title, req.body?.due_at ?? null, JSON.stringify({ needs_review: needsReview }), courseId],
      );
      logAudit(req.userId, req.tenantId, 'faculty.quiz.generate_rag', 'assessment', assessmentId, provenance, 'info', req);
      return res.status(201).json({ assessment: assessment.rows[0], needs_review: needsReview, provenance });
    } catch {
      return res.status(500).json({ error: 'Failed to generate quiz draft' });
    }
  });

  app.put('/faculty/courses/:courseId/quizzes/:assessmentId/publish', authMiddleware, requirePermission('ASSESSMENT_WRITE'), async (req: AuthRequest, res: Response) => {
    if (!ensureFaculty(req, res)) return;
    const courseId = Number(req.params.courseId);
    const assessmentId = Number(req.params.assessmentId);
    const forceOverride = Boolean(req.body?.force_override);
    try {
      if (!(await ensureAssignedCourse(req, res, courseId))) return;
      const settings = await pool.query(
        'SELECT * FROM assessment_settings WHERE assessment_id = $1 AND course_id = $2',
        [assessmentId, courseId],
      );
      if (!settings.rows.length) return res.status(404).json({ error: 'Quiz settings not found' });
      if (settings.rows[0].needs_review && !forceOverride) {
        return res.status(400).json({ error: 'Quiz has questions without citations and needs review before publishing' });
      }
      const updated = await pool.query(
        `UPDATE assessment_settings
         SET is_published = true,
             due_at = COALESCE($1, due_at),
             time_limit_minutes = COALESCE($2, time_limit_minutes),
             attempts_allowed = COALESCE($3, attempts_allowed),
             needs_review = CASE WHEN $4 THEN false ELSE needs_review END,
             updated_at = NOW()
         WHERE assessment_id = $5 AND course_id = $6
         RETURNING *`,
        [req.body?.due_at ?? null, req.body?.time_limit_minutes ?? null, req.body?.attempts_allowed ?? null, forceOverride, assessmentId, courseId],
      );
      return res.json({ settings: updated.rows[0] });
    } catch {
      return res.status(500).json({ error: 'Failed to publish quiz' });
    }
  });

  app.get('/faculty/courses/:courseId/assignments', authMiddleware, requirePermission('ASSESSMENT_WRITE'), async (req: AuthRequest, res: Response) => {
    if (!ensureFaculty(req, res)) return;
    const courseId = Number(req.params.courseId);
    try {
      if (!(await ensureAssignedCourse(req, res, courseId))) return;
      const result = await pool.query(
        `SELECT id, title, description, due_at, is_published, created_at
         FROM assignments
         WHERE course_id = $1
         ORDER BY created_at DESC`,
        [courseId],
      );
      return res.json({ assignments: result.rows });
    } catch {
      return res.status(500).json({ error: 'Failed to load assignments' });
    }
  });

  app.post('/faculty/courses/:courseId/assignments', authMiddleware, requirePermission('ASSESSMENT_WRITE'), async (req: AuthRequest, res: Response) => {
    if (!ensureFaculty(req, res)) return;
    const courseId = Number(req.params.courseId);
    const title = String(req.body?.title ?? '').trim();
    if (!title) return res.status(400).json({ error: 'title required' });
    try {
      if (!(await ensureAssignedCourse(req, res, courseId))) return;
      const result = await pool.query(
        `INSERT INTO assignments (course_id, tenant_id, faculty_id, title, description, rubric, due_at, is_published)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)
         RETURNING *`,
        [
          courseId,
          req.tenantId,
          req.userId,
          title,
          req.body?.description ?? null,
          JSON.stringify(req.body?.rubric ?? {}),
          req.body?.due_at ?? null,
          Boolean(req.body?.is_published),
        ],
      );
      await pool.query(
        `INSERT INTO course_module_items (module_id, item_type, title, position, due_at, metadata)
         SELECT cm.id, 'ASSIGNMENT', $1, COALESCE(MAX(cmi.position), 0) + 1, $2, $3::jsonb
         FROM course_modules cm
         LEFT JOIN course_module_items cmi ON cmi.module_id = cm.id
         WHERE cm.course_id = $4
         GROUP BY cm.id
         ORDER BY cm.position ASC
         LIMIT 1`,
        [title, req.body?.due_at ?? null, JSON.stringify({ assignment_id: result.rows[0].id }), courseId],
      );
      return res.status(201).json({ assignment: result.rows[0] });
    } catch {
      return res.status(500).json({ error: 'Failed to create assignment' });
    }
  });

  app.get('/faculty/courses/:courseId/assignments/:assignmentId/submissions', authMiddleware, requirePermission('ASSESSMENT_WRITE'), async (req: AuthRequest, res: Response) => {
    if (!ensureFaculty(req, res)) return;
    const courseId = Number(req.params.courseId);
    const assignmentId = Number(req.params.assignmentId);
    try {
      if (!(await ensureAssignedCourse(req, res, courseId))) return;
      const result = await pool.query(
        `SELECT s.*, u.email, u.first_name, u.last_name
         FROM assignment_submissions s
         JOIN assignments a ON a.id = s.assignment_id
         JOIN users u ON u.id = s.student_id
         WHERE a.course_id = $1 AND s.assignment_id = $2
         ORDER BY s.submitted_at DESC`,
        [courseId, assignmentId],
      );
      return res.json({ submissions: result.rows });
    } catch {
      return res.status(500).json({ error: 'Failed to load submissions' });
    }
  });

  app.put('/faculty/courses/:courseId/assignments/submissions/:submissionId/grade', authMiddleware, requirePermission('ASSESSMENT_WRITE'), async (req: AuthRequest, res: Response) => {
    if (!ensureFaculty(req, res)) return;
    const courseId = Number(req.params.courseId);
    const submissionId = Number(req.params.submissionId);
    try {
      if (!(await ensureAssignedCourse(req, res, courseId))) return;
      const result = await pool.query(
        `UPDATE assignment_submissions s
         SET score = $1,
             feedback = $2,
             status = 'graded',
             graded_at = NOW()
         FROM assignments a
         WHERE s.id = $3 AND s.assignment_id = a.id AND a.course_id = $4
         RETURNING s.*`,
        [req.body?.score ?? null, req.body?.feedback ?? null, submissionId, courseId],
      );
      if (!result.rows.length) return res.status(404).json({ error: 'Submission not found' });
      return res.json({ submission: result.rows[0] });
    } catch {
      return res.status(500).json({ error: 'Failed to grade submission' });
    }
  });

  app.get('/faculty/courses/:courseId/gradebook', authMiddleware, requirePermission('STUDENT_PROGRESS_READ'), async (req: AuthRequest, res: Response) => {
    if (!ensureFaculty(req, res)) return;
    const courseId = Number(req.params.courseId);
    try {
      if (!(await ensureAssignedCourse(req, res, courseId))) return;
      const students = await pool.query(
        `SELECT u.id AS student_id, u.email, u.first_name, u.last_name
         FROM course_enrollments ce
         JOIN users u ON u.id = ce.user_id
         WHERE ce.course_id = $1 AND u.role = 'STUDENT'
         ORDER BY u.first_name NULLS LAST, u.email`,
        [courseId],
      );
      const quizCols = await pool.query(
        `SELECT a.id, a.title
         FROM assessment_settings s
         JOIN assessments a ON a.id = s.assessment_id
         WHERE s.course_id = $1 AND s.is_published = true
         ORDER BY a.created_at`,
        [courseId],
      );
      const assignmentCols = await pool.query(
        `SELECT id, title
         FROM assignments
         WHERE course_id = $1 AND is_published = true
         ORDER BY created_at`,
        [courseId],
      );
      const rows: Record<string, unknown>[] = [];
      for (const student of students.rows) {
        const quizScores = await pool.query(
          `SELECT q.assessment_id, COALESCE(ROUND(AVG(r.ai_score)), 0) AS score
           FROM responses r
           JOIN questions q ON q.id = r.question_id
           WHERE r.user_id = $1 AND q.assessment_id = ANY($2::int[])
           GROUP BY q.assessment_id`,
          [student.student_id, quizCols.rows.map((q) => q.id)],
        );
        const assignmentScores = await pool.query(
          `SELECT assignment_id, score, status
           FROM assignment_submissions
           WHERE student_id = $1 AND assignment_id = ANY($2::int[])`,
          [student.student_id, assignmentCols.rows.map((a) => a.id)],
        );
        const quizScoreMap = new Map<number, number>(quizScores.rows.map((r) => [Number(r.assessment_id), Number(r.score)]));
        const assignmentMap = new Map<number, { score: number | null; status: string }>(
          assignmentScores.rows.map((r) => [Number(r.assignment_id), { score: r.score !== null ? Number(r.score) : null, status: String(r.status) }]),
        );
        rows.push({
          student_id: student.student_id,
          student_name: `${student.first_name ?? ''} ${student.last_name ?? ''}`.trim() || student.email,
          quizzes: quizCols.rows.map((q) => ({ id: q.id, title: q.title, score: quizScoreMap.get(Number(q.id)) ?? null })),
          assignments: assignmentCols.rows.map((a) => ({ id: a.id, title: a.title, score: assignmentMap.get(Number(a.id))?.score ?? null, status: assignmentMap.get(Number(a.id))?.status ?? 'missing' })),
        });
      }
      return res.json({
        columns: {
          quizzes: quizCols.rows,
          assignments: assignmentCols.rows,
        },
        rows,
      });
    } catch {
      return res.status(500).json({ error: 'Failed to load gradebook' });
    }
  });

  app.get('/faculty/courses/:courseId/inbox/threads', authMiddleware, requirePermission('CHAT_USE'), async (req: AuthRequest, res: Response) => {
    if (!ensureFaculty(req, res)) return;
    const courseId = Number(req.params.courseId);
    try {
      if (!(await ensureAssignedCourse(req, res, courseId))) return;
      const threads = await pool.query(
        `SELECT t.id, t.title, t.status, t.target_user_id, t.updated_at,
                u.email AS target_email, u.first_name, u.last_name,
                (SELECT body FROM course_inbox_messages m WHERE m.thread_id = t.id ORDER BY m.created_at DESC LIMIT 1) AS snippet
         FROM course_inbox_threads t
         LEFT JOIN users u ON u.id = t.target_user_id
         WHERE t.course_id = $1
         ORDER BY t.updated_at DESC`,
        [courseId],
      );
      return res.json({ threads: threads.rows });
    } catch {
      return res.status(500).json({ error: 'Failed to load course inbox threads' });
    }
  });

  app.post('/faculty/courses/:courseId/inbox/threads', authMiddleware, requirePermission('CHAT_USE'), async (req: AuthRequest, res: Response) => {
    if (!ensureFaculty(req, res)) return;
    const courseId = Number(req.params.courseId);
    const title = String(req.body?.title ?? '').trim();
    const body = String(req.body?.body ?? '').trim();
    if (!title || !body) return res.status(400).json({ error: 'title and body required' });
    try {
      if (!(await ensureAssignedCourse(req, res, courseId))) return;
      const thread = await pool.query(
        `INSERT INTO course_inbox_threads (course_id, tenant_id, created_by, target_user_id, title, status, updated_at)
         VALUES ($1,$2,$3,$4,$5,'open',NOW())
         RETURNING *`,
        [courseId, req.tenantId, req.userId, req.body?.target_user_id ? Number(req.body.target_user_id) : null, title],
      );
      await pool.query(
        `INSERT INTO course_inbox_messages (thread_id, sender_id, body)
         VALUES ($1,$2,$3)`,
        [thread.rows[0].id, req.userId, body],
      );
      return res.status(201).json({ thread: thread.rows[0] });
    } catch {
      return res.status(500).json({ error: 'Failed to create thread' });
    }
  });

  app.get('/faculty/courses/:courseId/inbox/threads/:threadId', authMiddleware, requirePermission('CHAT_USE'), async (req: AuthRequest, res: Response) => {
    if (!ensureFaculty(req, res)) return;
    const courseId = Number(req.params.courseId);
    const threadId = Number(req.params.threadId);
    try {
      if (!(await ensureAssignedCourse(req, res, courseId))) return;
      const messages = await pool.query(
        `SELECT m.id, m.body, m.created_at, m.sender_id, u.email, u.first_name, u.last_name
         FROM course_inbox_messages m
         JOIN course_inbox_threads t ON t.id = m.thread_id
         LEFT JOIN users u ON u.id = m.sender_id
         WHERE t.id = $1 AND t.course_id = $2
         ORDER BY m.created_at ASC`,
        [threadId, courseId],
      );
      return res.json({ messages: messages.rows });
    } catch {
      return res.status(500).json({ error: 'Failed to load thread' });
    }
  });

  app.post('/faculty/courses/:courseId/inbox/threads/:threadId/messages', authMiddleware, requirePermission('CHAT_USE'), async (req: AuthRequest, res: Response) => {
    if (!ensureFaculty(req, res)) return;
    const courseId = Number(req.params.courseId);
    const threadId = Number(req.params.threadId);
    const body = String(req.body?.body ?? '').trim();
    if (!body) return res.status(400).json({ error: 'body required' });
    try {
      if (!(await ensureAssignedCourse(req, res, courseId))) return;
      const valid = await pool.query('SELECT id FROM course_inbox_threads WHERE id = $1 AND course_id = $2', [threadId, courseId]);
      if (!valid.rows.length) return res.status(404).json({ error: 'Thread not found' });
      const msg = await pool.query(
        `INSERT INTO course_inbox_messages (thread_id, sender_id, body)
         VALUES ($1,$2,$3)
         RETURNING *`,
        [threadId, req.userId, body],
      );
      await pool.query('UPDATE course_inbox_threads SET updated_at = NOW() WHERE id = $1', [threadId]);
      return res.status(201).json({ message: msg.rows[0] });
    } catch {
      return res.status(500).json({ error: 'Failed to send message' });
    }
  });

  app.get('/faculty/calendar', authMiddleware, requirePermission('COURSE_READ'), async (req: AuthRequest, res: Response) => {
    if (!ensureFaculty(req, res)) return;
    const tenantId = req.tenantId;
    const facultyId = req.userId;
    if (!tenantId || !facultyId) return res.status(403).json({ error: 'Tenant context required' });
    try {
      const events = await pool.query(
        `SELECT * FROM (
           SELECT a.due_at AS event_at, 'assignment'::text AS event_type, a.title, c.id AS course_id, c.title AS course_title
           FROM assignments a
           JOIN courses c ON c.id = a.course_id
           WHERE a.tenant_id = $1 AND c.faculty_id = $2 AND a.due_at IS NOT NULL
           UNION ALL
           SELECT s.due_at AS event_at, 'quiz'::text AS event_type, q.title, c.id AS course_id, c.title AS course_title
           FROM assessment_settings s
           JOIN assessments q ON q.id = s.assessment_id
           JOIN courses c ON c.id = s.course_id
           WHERE c.tenant_id = $1 AND c.faculty_id = $2 AND s.due_at IS NOT NULL
         ) t
         ORDER BY event_at ASC`,
        [tenantId, facultyId],
      );
      return res.json({ events: events.rows });
    } catch {
      return res.status(500).json({ error: 'Failed to load faculty calendar' });
    }
  });

  app.get('/faculty/inbox', authMiddleware, requirePermission('CHAT_USE'), async (req: AuthRequest, res: Response) => {
    if (!ensureFaculty(req, res)) return;
    const tenantId = req.tenantId;
    const facultyId = req.userId;
    const courseId = req.query.course_id ? Number(req.query.course_id) : null;
    if (!tenantId || !facultyId) return res.status(403).json({ error: 'Tenant context required' });
    try {
      const courses = await pool.query(
        `SELECT id, title
         FROM courses
         WHERE tenant_id = $1 AND faculty_id = $2
         ORDER BY title`,
        [tenantId, facultyId],
      );
      const params: unknown[] = [tenantId, facultyId];
      let where = 'WHERE t.tenant_id = $1 AND c.faculty_id = $2';
      if (courseId && Number.isFinite(courseId)) {
        params.push(courseId);
        where += ` AND t.course_id = $${params.length}`;
      }
      const threads = await pool.query(
        `SELECT t.id, t.course_id, c.title AS course_title, t.title, t.status, t.updated_at,
                (SELECT body FROM course_inbox_messages m WHERE m.thread_id = t.id ORDER BY m.created_at DESC LIMIT 1) AS snippet
         FROM course_inbox_threads t
         JOIN courses c ON c.id = t.course_id
         ${where}
         ORDER BY t.updated_at DESC`,
        params,
      );
      return res.json({ courses: courses.rows, threads: threads.rows });
    } catch {
      return res.status(500).json({ error: 'Failed to load faculty inbox' });
    }
  });

  app.get('/faculty/history', authMiddleware, requirePermission('COURSE_READ'), async (req: AuthRequest, res: Response) => {
    if (!ensureFaculty(req, res)) return;
    const tenantId = req.tenantId;
    const facultyId = req.userId;
    if (!tenantId || !facultyId) return res.status(403).json({ error: 'Tenant context required' });
    try {
      const result = await pool.query(
        `SELECT created_at, action, resource_type, resource_id, details
         FROM audit_logs
         WHERE user_id = $1 AND tenant_id = $2
         ORDER BY created_at DESC
         LIMIT 200`,
        [facultyId, tenantId],
      );
      return res.json({ items: result.rows });
    } catch {
      return res.status(500).json({ error: 'Failed to load faculty history' });
    }
  });
}
