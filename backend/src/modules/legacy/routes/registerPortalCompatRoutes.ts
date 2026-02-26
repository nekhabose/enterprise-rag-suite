import type { LegacyRouteDeps } from '../../app/routes/types';
import type { AuthRequest } from '../../../middleware/types';
import type { Response } from 'express';

export function registerPortalCompatRoutes(deps: LegacyRouteDeps) {
  const { app, pool, authMiddleware, requirePermission } = deps;

  app.get('/portal/courses', authMiddleware, requirePermission('COURSE_READ'), async (req: AuthRequest, res: Response) => {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(403).json({ error: 'Tenant context required' });
    try {
      const result = await pool.query(
        `SELECT id, title, description, subject, is_active, created_at
         FROM courses
         WHERE tenant_id = $1 AND is_active = true
         ORDER BY created_at DESC`,
        [tenantId],
      );
      return res.json({ courses: result.rows });
    } catch {
      return res.status(500).json({ error: 'Failed to fetch courses' });
    }
  });

  app.get('/portal/courses/:id', authMiddleware, requirePermission('COURSE_READ'), async (req: AuthRequest, res: Response) => {
    const tenantId = req.tenantId;
    const courseId = Number(req.params.id);
    if (!tenantId) return res.status(403).json({ error: 'Tenant context required' });
    if (!Number.isFinite(courseId) || courseId <= 0) return res.status(400).json({ error: 'Invalid course ID' });
    try {
      const result = await pool.query(
        `SELECT id, title, description, subject, is_active, created_at
         FROM courses
         WHERE id = $1 AND tenant_id = $2`,
        [courseId, tenantId],
      );
      if (!result.rows.length) return res.status(404).json({ error: 'Course not found' });
      return res.json(result.rows[0]);
    } catch {
      return res.status(500).json({ error: 'Failed to fetch course' });
    }
  });

  app.get('/portal/progress', authMiddleware, requirePermission('COURSE_READ'), async (req: AuthRequest, res: Response) => {
    const tenantId = req.tenantId;
    const userId = req.userId;
    if (!tenantId || !userId) return res.status(403).json({ error: 'Tenant context required' });
    try {
      const [coursesCompleted, assessmentsTaken, avgScore, chatMessages] = await Promise.all([
        pool.query(
          `SELECT COUNT(DISTINCT ce.course_id) AS count
           FROM course_enrollments ce
           JOIN courses c ON c.id = ce.course_id
           WHERE ce.user_id = $1 AND c.tenant_id = $2`,
          [userId, tenantId],
        ),
        pool.query(
          `SELECT COUNT(DISTINCT q.assessment_id) AS count
           FROM responses r
           JOIN questions q ON q.id = r.question_id
           JOIN assessments a ON a.id = q.assessment_id
           WHERE r.user_id = $1 AND a.tenant_id = $2`,
          [userId, tenantId],
        ),
        pool.query(
          `SELECT COALESCE(ROUND(AVG(r.ai_score)), 0) AS score
           FROM responses r
           JOIN questions q ON q.id = r.question_id
           JOIN assessments a ON a.id = q.assessment_id
           WHERE r.user_id = $1 AND a.tenant_id = $2`,
          [userId, tenantId],
        ),
        pool.query('SELECT COUNT(*) AS count FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.user_id = $1 AND c.tenant_id = $2', [userId, tenantId]),
      ]);

      return res.json({
        coursesCompleted: Number(coursesCompleted.rows[0]?.count ?? 0),
        assessmentsTaken: Number(assessmentsTaken.rows[0]?.count ?? 0),
        avgScore: Number(avgScore.rows[0]?.score ?? 0),
        chatMessages: Number(chatMessages.rows[0]?.count ?? 0),
      });
    } catch {
      return res.status(500).json({ error: 'Failed to fetch progress' });
    }
  });

  app.get('/portal/student-progress', authMiddleware, requirePermission('STUDENT_PROGRESS_READ'), async (req: AuthRequest, res: Response) => {
    const tenantId = req.tenantId;
    const facultyId = req.userId;
    if (!tenantId || !facultyId) return res.status(403).json({ error: 'Tenant context required' });
    try {
      const result = await pool.query(
        `SELECT
            u.id AS student_id,
            COALESCE(u.first_name || ' ' || u.last_name, u.email) AS student_name,
            c.title AS course_title,
            COUNT(DISTINCT m.id)::int AS chat_count,
            COALESCE(ROUND(AVG(r.ai_score)), 0)::int AS assessment_avg,
            MAX(COALESCE(m.created_at, r.submitted_at)) AS last_active
         FROM courses c
         JOIN course_enrollments ce ON ce.course_id = c.id
         JOIN users u ON u.id = ce.user_id
         LEFT JOIN conversations conv ON conv.user_id = u.id AND conv.tenant_id = c.tenant_id
         LEFT JOIN messages m ON m.conversation_id = conv.id
         LEFT JOIN responses r ON r.user_id = u.id
         WHERE c.tenant_id = $1
           AND c.faculty_id = $2
           AND u.role = 'STUDENT'
         GROUP BY u.id, u.first_name, u.last_name, u.email, c.title
         ORDER BY last_active DESC NULLS LAST`,
        [tenantId, facultyId],
      );

      return res.json({ students: result.rows });
    } catch {
      return res.status(500).json({ error: 'Failed to fetch student progress' });
    }
  });
}
