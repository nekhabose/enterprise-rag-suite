import type { AuthRequest } from '../../../middleware/types';
import type { Response } from 'express';
import type { LegacyRouteDeps } from '../../app/routes/types';
import { createTenantAdminRepository } from '../repositories/tenantAdminRepository';

export function createTenantAdminService(deps: LegacyRouteDeps) {
  const { pool, ROLES, bcrypt, crypto, logAudit } = deps;
  const repo = createTenantAdminRepository(pool);

  return {
    async dashboard(req: AuthRequest, res: Response) {
      const tenantId = req.tenantId!;
      try {
        const [users, docs, videos, courses, conversations, aiSettings] = await Promise.all([
          repo.query('SELECT COUNT(*) as total, role FROM users WHERE tenant_id = $1 GROUP BY role', [tenantId]),
          repo.query('SELECT COUNT(*) as total FROM documents WHERE tenant_id = $1', [tenantId]),
          repo.query('SELECT COUNT(*) as total FROM videos WHERE tenant_id = $1', [tenantId]),
          repo.query('SELECT COUNT(*) as total FROM courses WHERE tenant_id = $1', [tenantId]),
          repo.query('SELECT COUNT(*) as total FROM conversations WHERE tenant_id = $1', [tenantId]),
          repo.query('SELECT * FROM tenant_ai_settings WHERE tenant_id = $1', [tenantId]),
        ]);

        const recentActivity = await repo.query(
          `SELECT al.action, al.resource_type, al.created_at, u.email
           FROM audit_logs al
           LEFT JOIN users u ON al.user_id = u.id
           WHERE al.tenant_id = $1
           ORDER BY al.created_at DESC LIMIT 20`,
          [tenantId],
        );

        return res.json({
          users: users.rows,
          documents: { total: parseInt(docs.rows[0]?.total ?? '0') },
          videos: { total: parseInt(videos.rows[0]?.total ?? '0') },
          courses: { total: parseInt(courses.rows[0]?.total ?? '0') },
          conversations: { total: parseInt(conversations.rows[0]?.total ?? '0') },
          ai_settings: aiSettings.rows[0] ?? {},
          recent_activity: recentActivity.rows,
        });
      } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Failed to fetch tenant dashboard' });
      }
    },

    async listUsers(req: AuthRequest, res: Response) {
      const tenantId = req.tenantId!;
      const { search, role } = req.query;

      try {
        const params: any[] = [tenantId];
        const where: string[] = ['u.tenant_id = $1'];

        if (search) { params.push(`%${search}%`); where.push(`(u.email ILIKE $${params.length} OR u.first_name ILIKE $${params.length} OR u.last_name ILIKE $${params.length})`); }
        if (role) { params.push(role); where.push(`u.role = $${params.length}`); }

        const result = await repo.query(
          `SELECT u.id, u.email, u.role, u.first_name, u.last_name, u.is_active,
                  u.last_login_at, u.created_at,
                  COUNT(DISTINCT d.id) as document_count,
                  COUNT(DISTINCT c.id) as conversation_count
           FROM users u
           LEFT JOIN documents d ON d.user_id = u.id
           LEFT JOIN conversations c ON c.user_id = u.id
           WHERE ${where.join(' AND ')}
           GROUP BY u.id ORDER BY u.created_at DESC`,
          params,
        );

        return res.json({ users: result.rows, total: result.rows.length });
      } catch {
        return res.status(500).json({ error: 'Failed to fetch users' });
      }
    },

    async createUser(req: AuthRequest, res: Response) {
      const { email, password, role = 'STUDENT', first_name, last_name } = req.body;
      const tenantId = req.tenantId!;

      if (!email || !password) return res.status(400).json({ error: 'email and password required' });

      const tenantRoles = [ROLES.STUDENT, ROLES.FACULTY, ROLES.TENANT_ADMIN];
      if (!tenantRoles.includes(role)) {
        return res.status(400).json({ error: `Role must be one of: ${tenantRoles.join(', ')}` });
      }

      try {
        const hash = await bcrypt.hash(password, 12);
        const result = await repo.query(
          `INSERT INTO users (email, password_hash, role, tenant_id, first_name, last_name)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, email, role, first_name, last_name`,
          [email.trim().toLowerCase(), hash, role, tenantId, first_name, last_name],
        );
        logAudit(req.userId, tenantId, 'tenant_user.create', 'user', result.rows[0].id, { email, role }, 'info', req);
        return res.status(201).json({ user: result.rows[0] });
      } catch (err: any) {
        if (err.code === '23505') return res.status(400).json({ error: 'Email already exists' });
        return res.status(500).json({ error: 'Failed to create user' });
      }
    },

    async updateUser(req: AuthRequest, res: Response) {
      const userId = parseInt(req.params.id);
      const tenantId = req.tenantId!;
      const { role, is_active, first_name, last_name } = req.body;

      try {
        const result = await repo.query(
          `UPDATE users SET
             role = COALESCE($1, role),
             is_active = COALESCE($2, is_active),
             first_name = COALESCE($3, first_name),
             last_name = COALESCE($4, last_name),
             updated_at = NOW()
           WHERE id = $5 AND tenant_id = $6 RETURNING *`,
          [role, is_active, first_name, last_name, userId, tenantId],
        );
        if (!result.rows.length) return res.status(404).json({ error: 'User not found in this tenant' });
        logAudit(req.userId, tenantId, 'tenant_user.update', 'user', userId, req.body, 'info', req);
        return res.json({ user: result.rows[0] });
      } catch {
        return res.status(500).json({ error: 'Failed to update user' });
      }
    },

    async invite(req: AuthRequest, res: Response) {
      const { email, role = 'STUDENT' } = req.body;
      const tenantId = req.tenantId!;

      if (!email) return res.status(400).json({ error: 'Email required' });

      try {
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        const result = await repo.query(
          `INSERT INTO invitations (tenant_id, invited_by, email, role, token, expires_at)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
          [tenantId, req.userId, email, role, token, expiresAt],
        );
        logAudit(req.userId, tenantId, 'invitation.create', 'invitation', result.rows[0].id, { email, role }, 'info', req);
        const frontendBase = process.env.FRONTEND_URL || 'http://localhost:3000';
        return res.json({ invitation: result.rows[0], invitation_link: `${frontendBase}/signup?token=${token}` });
      } catch {
        return res.status(500).json({ error: 'Failed to create invitation' });
      }
    },

    async listCourses(req: AuthRequest, res: Response) {
      const tenantId = req.tenantId!;
      try {
        const result = await repo.query(
          `SELECT c.*, u.email as faculty_email, u.first_name, u.last_name,
                  COUNT(DISTINCT e.id) as enrollment_count
           FROM courses c
           LEFT JOIN users u ON c.faculty_id = u.id
           LEFT JOIN course_enrollments e ON e.course_id = c.id
           WHERE c.tenant_id = $1
           GROUP BY c.id, u.email, u.first_name, u.last_name
           ORDER BY c.created_at DESC`,
          [tenantId],
        );
        return res.json({ courses: result.rows });
      } catch {
        return res.status(500).json({ error: 'Failed to fetch courses' });
      }
    },

    async createCourse(req: AuthRequest, res: Response) {
      const { title, description, faculty_id } = req.body;
      const tenantId = req.tenantId!;
      if (!title) return res.status(400).json({ error: 'Title required' });

      try {
        const result = await repo.query(
          `INSERT INTO courses (tenant_id, title, description, faculty_id)
           VALUES ($1,$2,$3,$4) RETURNING *`,
          [tenantId, title, description, faculty_id ?? req.userId],
        );
        logAudit(req.userId, tenantId, 'course.create', 'course', result.rows[0].id, { title }, 'info', req);
        return res.status(201).json({ course: result.rows[0] });
      } catch {
        return res.status(500).json({ error: 'Failed to create course' });
      }
    },

    async updateCourse(req: AuthRequest, res: Response) {
      const courseId = parseInt(req.params.id);
      const tenantId = req.tenantId!;
      const { title, description, is_active, faculty_id } = req.body;

      try {
        const result = await repo.query(
          `UPDATE courses SET
             title = COALESCE($1, title),
             description = COALESCE($2, description),
             is_active = COALESCE($3, is_active),
             faculty_id = COALESCE($4, faculty_id),
             updated_at = NOW()
           WHERE id = $5 AND tenant_id = $6 RETURNING *`,
          [title, description, is_active, faculty_id, courseId, tenantId],
        );
        if (!result.rows.length) return res.status(404).json({ error: 'Course not found' });
        return res.json({ course: result.rows[0] });
      } catch {
        return res.status(500).json({ error: 'Failed to update course' });
      }
    },

    async getAiSettings(req: AuthRequest, res: Response) {
      const tenantId = req.tenantId!;
      try {
        const result = await repo.query('SELECT * FROM tenant_ai_settings WHERE tenant_id = $1', [tenantId]);
        return res.json(result.rows[0] ?? {});
      } catch {
        return res.status(500).json({ error: 'Failed to get AI settings' });
      }
    },

    async updateAiSettings(req: AuthRequest, res: Response) {
      const tenantId = req.tenantId!;
      const {
        llm_provider, llm_model, embedding_provider, embedding_model,
        chunking_strategy, retrieval_strategy, vector_store,
        rerank_enabled, max_tokens, temperature,
      } = req.body;

      try {
        const result = await repo.query(
          `INSERT INTO tenant_ai_settings
             (tenant_id, llm_provider, llm_model, embedding_provider, embedding_model,
              chunking_strategy, retrieval_strategy, vector_store, rerank_enabled, max_tokens, temperature, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
           ON CONFLICT (tenant_id) DO UPDATE SET
             llm_provider = EXCLUDED.llm_provider,
             llm_model = EXCLUDED.llm_model,
             embedding_provider = EXCLUDED.embedding_provider,
             embedding_model = EXCLUDED.embedding_model,
             chunking_strategy = EXCLUDED.chunking_strategy,
             retrieval_strategy = EXCLUDED.retrieval_strategy,
             vector_store = EXCLUDED.vector_store,
             rerank_enabled = EXCLUDED.rerank_enabled,
             max_tokens = EXCLUDED.max_tokens,
             temperature = EXCLUDED.temperature,
             updated_at = NOW()
           RETURNING *`,
          [tenantId, llm_provider, llm_model, embedding_provider, embedding_model,
            chunking_strategy, retrieval_strategy, vector_store,
            rerank_enabled, max_tokens, temperature],
        );
        logAudit(req.userId, tenantId, 'ai_settings.update', 'settings', tenantId, req.body, 'info', req);
        return res.json(result.rows[0]);
      } catch {
        return res.status(500).json({ error: 'Failed to update AI settings' });
      }
    },

    async auditLogs(req: AuthRequest, res: Response) {
      const tenantId = req.tenantId!;
      const { limit = '50', offset = '0' } = req.query;

      try {
        const result = await repo.query(
          `SELECT al.*, u.email as user_email
           FROM audit_logs al LEFT JOIN users u ON al.user_id = u.id
           WHERE al.tenant_id = $1
           ORDER BY al.created_at DESC LIMIT $2 OFFSET $3`,
          [tenantId, parseInt(limit as string), parseInt(offset as string)],
        );
        return res.json({ logs: result.rows });
      } catch {
        return res.status(500).json({ error: 'Failed to fetch audit logs' });
      }
    },
  };
}
