import type { LegacyRouteDeps } from '../../app/routes/types';
import { createSuperAdminService } from '../services/superAdminService';
import { AI_OPTIONS_CATALOG } from '../../ai/constants/aiOptions';

export function registerSuperAdminController(deps: LegacyRouteDeps) {
  createSuperAdminService(deps);
  const {
    app, pool, authMiddleware, requirePermission, logAudit,
    ROLES, JWT_SECRET, JWT_EXPIRY, bcrypt, jwt, crypto,
  } = deps;
  type AuthRequest = import('../../../middleware/types').AuthRequest;
  type Response = import('express').Response;
  const ALLOWED_VALUES = AI_OPTIONS_CATALOG;
  const normalizeList = (value: unknown, fallback: readonly string[]) => {
    if (!Array.isArray(value)) return [...fallback];
    const set = new Set(
      value
        .map((v) => String(v).trim())
        .filter((v) => fallback.includes(v as any)),
    );
    return set.size ? Array.from(set) : [...fallback];
  };
  const requireSuperAdmin = (req: AuthRequest, res: Response): boolean => {
    if (req.userRole !== ROLES.SUPER_ADMIN) {
      res.status(403).json({ error: 'Only Super Admin can manage AI governance' });
      return false;
    }
    return true;
  };

  app.get('/super-admin/dashboard', authMiddleware, requirePermission('PLATFORM_READ'), async (_req: AuthRequest, res: Response) => {
    try {
      const [tenants, users, docs, conversations, auditErrors] = await Promise.all([
        pool.query('SELECT COUNT(*) as total, COUNT(CASE WHEN is_active THEN 1 END) as active FROM tenants'),
        pool.query(
          `SELECT COUNT(*) as total,
                  COUNT(CASE WHEN role NOT IN ('SUPER_ADMIN','INTERNAL_ADMIN','INTERNAL_STAFF') THEN 1 END) as tenant_users,
                  COUNT(CASE WHEN is_internal THEN 1 END) as internal_users
           FROM users`,
        ),
        pool.query('SELECT COUNT(*) as total FROM documents'),
        pool.query('SELECT COUNT(*) as total FROM conversations'),
        pool.query("SELECT COUNT(*) as total FROM audit_logs WHERE severity = 'error' AND created_at > NOW() - INTERVAL '24 hours'"),
      ]);
      const recentTenants = await pool.query('SELECT id, name, domain, plan, is_active, created_at FROM tenants ORDER BY created_at DESC LIMIT 5');
      const recentAudit = await pool.query(
        `SELECT al.id, al.action, al.resource_type, al.severity, al.created_at, u.email as user_email, t.name as tenant_name
         FROM audit_logs al
         LEFT JOIN users u ON al.user_id = u.id
         LEFT JOIN tenants t ON al.tenant_id = t.id
         ORDER BY al.created_at DESC LIMIT 20`,
      );
      res.json({
        stats: {
          tenants: { total: parseInt(tenants.rows[0].total), active: parseInt(tenants.rows[0].active) },
          users: { total: parseInt(users.rows[0].total), tenant_users: parseInt(users.rows[0].tenant_users), internal_users: parseInt(users.rows[0].internal_users) },
          documents: { total: parseInt(docs.rows[0].total) },
          conversations: { total: parseInt(conversations.rows[0].total) },
          errors_24h: parseInt(auditErrors.rows[0].total),
        },
        recent_tenants: recentTenants.rows,
        recent_activity: recentAudit.rows,
      });
    } catch (err) {
      console.error('[SUPER_ADMIN] Dashboard error:', err);
      res.status(500).json({ error: 'Failed to fetch dashboard data' });
    }
  });

  app.get('/super-admin/tenants', authMiddleware, requirePermission('TENANT_READ'), async (req: AuthRequest, res: Response) => {
    try {
      const { include_inactive, search } = req.query as Record<string, string | undefined>;
      let q = `SELECT t.*, COUNT(DISTINCT u.id) as user_count FROM tenants t LEFT JOIN users u ON u.tenant_id = t.id`;
      const params: unknown[] = [];
      const where: string[] = [];
      if (include_inactive !== 'true') where.push('t.is_active = true');
      if (search) {
        params.push(`%${search}%`);
        where.push(`(t.name ILIKE $${params.length} OR t.domain ILIKE $${params.length})`);
      }
      if (where.length) q += ` WHERE ${where.join(' AND ')}`;
      q += ' GROUP BY t.id ORDER BY t.created_at DESC';
      const result = await pool.query(q, params);
      res.json({ tenants: result.rows, total: result.rows.length });
    } catch {
      res.status(500).json({ error: 'Failed to list tenants' });
    }
  });

  app.post('/super-admin/tenants', authMiddleware, requirePermission('TENANT_CREATE'), async (req: AuthRequest, res: Response) => {
    const { name, domain, slug, plan = 'free', max_users = 100, max_storage_gb = 10 } = req.body;
    if (!name || !domain) return res.status(400).json({ error: 'Name and domain required' });
    const normalizedSlug = String(slug ?? name)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (!normalizedSlug) return res.status(400).json({ error: 'Slug is required' });
    try {
      const result = await pool.query(
        `INSERT INTO tenants (name, domain, slug, plan, max_users, max_storage_gb)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [name, domain.trim().toLowerCase(), normalizedSlug, plan, max_users, max_storage_gb],
      );
      const tenant = result.rows[0];
      await pool.query('INSERT INTO tenant_ai_settings (tenant_id) VALUES ($1) ON CONFLICT DO NOTHING', [tenant.id]);
      await logAudit(req.userId, req.tenantId, 'tenant.create', 'tenant', tenant.id, { name, domain }, 'info', req);
      res.status(201).json({ tenant });
    } catch (err: any) {
      if (err.code === '23505') return res.status(400).json({ error: 'Domain already exists' });
      res.status(500).json({ error: 'Failed to create tenant' });
    }
  });

  app.get('/super-admin/tenants/:id', authMiddleware, requirePermission('TENANT_READ'), async (req: AuthRequest, res: Response) => {
    const tenantId = parseInt(req.params.id);
    try {
      const result = await pool.query(
        `SELECT t.*, COUNT(DISTINCT u.id) as user_count, COUNT(DISTINCT d.id) as document_count, COUNT(DISTINCT c.id) as course_count
         FROM tenants t
         LEFT JOIN users u ON u.tenant_id = t.id
         LEFT JOIN documents d ON d.tenant_id = t.id
         LEFT JOIN courses c ON c.tenant_id = t.id
         WHERE t.id = $1
         GROUP BY t.id`,
        [tenantId],
      );
      if (!result.rows.length) return res.status(404).json({ error: 'Tenant not found' });
      res.json(result.rows[0]);
    } catch {
      res.status(500).json({ error: 'Failed to get tenant' });
    }
  });

  app.put('/super-admin/tenants/:id', authMiddleware, requirePermission('TENANT_UPDATE'), async (req: AuthRequest, res: Response) => {
    const tenantId = parseInt(req.params.id);
    const { name, plan, max_users, max_storage_gb, is_active } = req.body;
    try {
      const result = await pool.query(
        `UPDATE tenants
         SET name = COALESCE($1, name),
             plan = COALESCE($2, plan),
             max_users = COALESCE($3, max_users),
             max_storage_gb = COALESCE($4, max_storage_gb),
             is_active = COALESCE($5, is_active),
             updated_at = NOW()
         WHERE id = $6 RETURNING *`,
        [name, plan, max_users, max_storage_gb, is_active, tenantId],
      );
      if (!result.rows.length) return res.status(404).json({ error: 'Tenant not found' });
      await logAudit(req.userId, req.tenantId, 'tenant.update', 'tenant', tenantId, req.body, 'info', req);
      res.json({ tenant: result.rows[0] });
    } catch {
      res.status(500).json({ error: 'Failed to update tenant' });
    }
  });

  app.patch('/super-admin/tenants/:id/toggle', authMiddleware, requirePermission('TENANT_DISABLE'), async (req: AuthRequest, res: Response) => {
    const tenantId = parseInt(req.params.id);
    try {
      const result = await pool.query('UPDATE tenants SET is_active = NOT is_active, updated_at = NOW() WHERE id = $1 RETURNING *', [tenantId]);
      if (!result.rows.length) return res.status(404).json({ error: 'Tenant not found' });
      await logAudit(req.userId, req.tenantId, `tenant.${result.rows[0].is_active ? 'enable' : 'disable'}`, 'tenant', tenantId, {}, 'warn', req);
      res.json({ tenant: result.rows[0] });
    } catch {
      res.status(500).json({ error: 'Failed to toggle tenant' });
    }
  });

  app.get('/super-admin/ai-governance', authMiddleware, requirePermission('TENANT_READ'), async (_req: AuthRequest, res: Response) => {
    if (!requireSuperAdmin(_req, res)) return;
    try {
      const result = await pool.query(
        `SELECT t.id, t.name, t.domain, t.is_active,
                p.allowed_chunking_strategies, p.allowed_embedding_models, p.allowed_llm_providers,
                p.allowed_retrieval_strategies, p.allowed_vector_stores, p.updated_at as policy_updated_at,
                s.chunking_strategy, s.embedding_model, s.llm_provider, s.retrieval_strategy, s.vector_store
         FROM tenants t
         LEFT JOIN tenant_ai_policies p ON p.tenant_id = t.id
         LEFT JOIN tenant_ai_settings s ON s.tenant_id = t.id
         ORDER BY t.created_at DESC`,
      );
      return res.json({
        options_catalog: ALLOWED_VALUES,
        tenants: result.rows,
      });
    } catch {
      return res.status(500).json({ error: 'Failed to fetch AI governance data' });
    }
  });

  app.get('/super-admin/ai-governance/:tenantId', authMiddleware, requirePermission('TENANT_READ'), async (req: AuthRequest, res: Response) => {
    if (!requireSuperAdmin(req, res)) return;
    const tenantId = parseInt(req.params.tenantId);
    if (!Number.isFinite(tenantId) || tenantId <= 0) return res.status(400).json({ error: 'Invalid tenant id' });
    try {
      const result = await pool.query(
        `SELECT t.id, t.name, t.domain, t.is_active,
                p.allowed_chunking_strategies, p.allowed_embedding_models, p.allowed_llm_providers,
                p.allowed_retrieval_strategies, p.allowed_vector_stores, p.updated_at as policy_updated_at,
                s.chunking_strategy, s.embedding_model, s.llm_provider, s.retrieval_strategy, s.vector_store
         FROM tenants t
         LEFT JOIN tenant_ai_policies p ON p.tenant_id = t.id
         LEFT JOIN tenant_ai_settings s ON s.tenant_id = t.id
         WHERE t.id = $1`,
        [tenantId],
      );
      if (!result.rows.length) return res.status(404).json({ error: 'Tenant not found' });
      return res.json({
        options_catalog: ALLOWED_VALUES,
        tenant: result.rows[0],
      });
    } catch {
      return res.status(500).json({ error: 'Failed to fetch tenant AI governance' });
    }
  });

  app.put('/super-admin/ai-governance/:tenantId', authMiddleware, requirePermission('TENANT_UPDATE'), async (req: AuthRequest, res: Response) => {
    if (!requireSuperAdmin(req, res)) return;
    const tenantId = parseInt(req.params.tenantId);
    if (!Number.isFinite(tenantId) || tenantId <= 0) return res.status(400).json({ error: 'Invalid tenant id' });

    const allowed_chunking_strategies = normalizeList(req.body?.allowed_chunking_strategies, ALLOWED_VALUES.chunking);
    const allowed_embedding_models = normalizeList(req.body?.allowed_embedding_models, ALLOWED_VALUES.embedding);
    const allowed_llm_providers = normalizeList(req.body?.allowed_llm_providers, ALLOWED_VALUES.llm);
    const allowed_retrieval_strategies = normalizeList(req.body?.allowed_retrieval_strategies, ALLOWED_VALUES.retrieval);
    const allowed_vector_stores = normalizeList(req.body?.allowed_vector_stores, ALLOWED_VALUES.vector);

    try {
      const tenantExists = await pool.query('SELECT id FROM tenants WHERE id = $1', [tenantId]);
      if (!tenantExists.rows.length) return res.status(404).json({ error: 'Tenant not found' });

      const policy = await pool.query(
        `INSERT INTO tenant_ai_policies
           (tenant_id, allowed_chunking_strategies, allowed_embedding_models, allowed_llm_providers,
            allowed_retrieval_strategies, allowed_vector_stores, updated_by, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
         ON CONFLICT (tenant_id) DO UPDATE SET
           allowed_chunking_strategies = EXCLUDED.allowed_chunking_strategies,
           allowed_embedding_models = EXCLUDED.allowed_embedding_models,
           allowed_llm_providers = EXCLUDED.allowed_llm_providers,
           allowed_retrieval_strategies = EXCLUDED.allowed_retrieval_strategies,
           allowed_vector_stores = EXCLUDED.allowed_vector_stores,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()
         RETURNING *`,
        [
          tenantId,
          allowed_chunking_strategies,
          allowed_embedding_models,
          allowed_llm_providers,
          allowed_retrieval_strategies,
          allowed_vector_stores,
          req.userId ?? null,
        ],
      );

      await pool.query(
        `INSERT INTO tenant_ai_settings (tenant_id, chunking_strategy, embedding_model, llm_provider, retrieval_strategy, vector_store, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,NOW())
         ON CONFLICT (tenant_id) DO UPDATE SET
           chunking_strategy = CASE WHEN tenant_ai_settings.chunking_strategy = ANY($7::text[]) THEN tenant_ai_settings.chunking_strategy ELSE $2 END,
           embedding_model = CASE WHEN tenant_ai_settings.embedding_model = ANY($8::text[]) THEN tenant_ai_settings.embedding_model ELSE $3 END,
           llm_provider = CASE WHEN tenant_ai_settings.llm_provider = ANY($9::text[]) THEN tenant_ai_settings.llm_provider ELSE $4 END,
           retrieval_strategy = CASE WHEN tenant_ai_settings.retrieval_strategy = ANY($10::text[]) THEN tenant_ai_settings.retrieval_strategy ELSE $5 END,
           vector_store = CASE WHEN tenant_ai_settings.vector_store = ANY($11::text[]) THEN tenant_ai_settings.vector_store ELSE $6 END,
           updated_at = NOW()`,
        [
          tenantId,
          allowed_chunking_strategies[0],
          allowed_embedding_models[0],
          allowed_llm_providers[0],
          allowed_retrieval_strategies[0],
          allowed_vector_stores[0],
          allowed_chunking_strategies,
          allowed_embedding_models,
          allowed_llm_providers,
          allowed_retrieval_strategies,
          allowed_vector_stores,
        ],
      );

      await logAudit(req.userId, req.tenantId, 'tenant_ai_policy.update', 'tenant_ai_policy', tenantId, {
        tenant_id: tenantId,
        allowed_chunking_strategies,
        allowed_embedding_models,
        allowed_llm_providers,
        allowed_retrieval_strategies,
        allowed_vector_stores,
      }, 'warn', req);

      return res.json({
        policy: policy.rows[0],
        message: 'AI governance policy updated for tenant',
      });
    } catch {
      return res.status(500).json({ error: 'Failed to update tenant AI governance policy' });
    }
  });

  app.get('/super-admin/internal-users', authMiddleware, requirePermission('INTERNAL_USER_READ'), async (_req: AuthRequest, res: Response) => {
    try {
      const result = await pool.query(
        `SELECT u.id, u.email, u.role, u.is_active, u.employee_type, u.first_name, u.last_name, u.supported_tenant_ids,
                u.last_login_at, u.created_at, ARRAY_AGG(t.name) FILTER (WHERE t.id IS NOT NULL) as supported_tenant_names
         FROM users u
         LEFT JOIN tenants t ON t.id = ANY(u.supported_tenant_ids)
         WHERE u.is_internal = true
         GROUP BY u.id
         ORDER BY u.created_at DESC`,
      );
      res.json({ users: result.rows, total: result.rows.length });
    } catch {
      res.status(500).json({ error: 'Failed to fetch internal users' });
    }
  });

  app.post('/super-admin/internal-users', authMiddleware, requirePermission('INTERNAL_USER_WRITE'), async (req: AuthRequest, res: Response) => {
    const { email, password, role, employee_type, first_name, last_name, supported_tenant_ids = [] } = req.body;
    if (!email || !password || !role) return res.status(400).json({ error: 'email, password, role required' });
    const validInternalRoles = [ROLES.INTERNAL_ADMIN, ROLES.INTERNAL_STAFF];
    if (!validInternalRoles.includes(role)) return res.status(400).json({ error: `Role must be one of: ${validInternalRoles.join(', ')}` });
    try {
      const tResult = await pool.query("SELECT id FROM tenants WHERE domain = 'platform.internal' LIMIT 1");
      const platformTenantId = tResult.rows[0]?.id;
      const hash = await bcrypt.hash(password, 12);
      const result = await pool.query(
        `INSERT INTO users (email, password_hash, role, is_internal, employee_type, first_name, last_name, supported_tenant_ids, tenant_id, is_active)
         VALUES ($1,$2,$3,true,$4,$5,$6,$7,$8,true) RETURNING *`,
        [email.trim().toLowerCase(), hash, role, employee_type, first_name, last_name, supported_tenant_ids, platformTenantId],
      );
      await logAudit(req.userId, req.tenantId, 'internal_user.create', 'user', result.rows[0].id, { email, role }, 'info', req);
      res.status(201).json({ user: result.rows[0] });
    } catch (err: any) {
      if (err.code === '23505') return res.status(400).json({ error: 'Email already exists' });
      res.status(500).json({ error: 'Failed to create internal user' });
    }
  });

  app.put('/super-admin/internal-users/:id', authMiddleware, requirePermission('INTERNAL_USER_WRITE'), async (req: AuthRequest, res: Response) => {
    const userId = parseInt(req.params.id);
    const { role, is_active, employee_type, supported_tenant_ids, first_name, last_name } = req.body;
    try {
      const result = await pool.query(
        `UPDATE users
         SET role = COALESCE($1, role),
             is_active = COALESCE($2, is_active),
             employee_type = COALESCE($3, employee_type),
             supported_tenant_ids = COALESCE($4, supported_tenant_ids),
             first_name = COALESCE($5, first_name),
             last_name = COALESCE($6, last_name),
             updated_at = NOW()
         WHERE id = $7 AND is_internal = true RETURNING *`,
        [role, is_active, employee_type, supported_tenant_ids, first_name, last_name, userId],
      );
      if (!result.rows.length) return res.status(404).json({ error: 'Internal user not found' });
      await logAudit(req.userId, req.tenantId, 'internal_user.update', 'user', userId, req.body, 'info', req);
      res.json({ user: result.rows[0] });
    } catch {
      res.status(500).json({ error: 'Failed to update internal user' });
    }
  });

  app.post('/super-admin/users/:id/assign-role', authMiddleware, requirePermission('ROLE_ASSIGN'), async (req: AuthRequest, res: Response) => {
    const targetUserId = parseInt(req.params.id);
    const { role } = req.body;
    const validRoles = Object.values(ROLES);
    if (!validRoles.includes(role)) return res.status(400).json({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` });
    if (role === ROLES.SUPER_ADMIN && req.userRole !== ROLES.SUPER_ADMIN) return res.status(403).json({ error: 'Only a Super Admin can assign Super Admin role' });
    try {
      const result = await pool.query('UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2 RETURNING id, email, role', [role, targetUserId]);
      if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
      await logAudit(req.userId, req.tenantId, 'role.assign', 'user', targetUserId, { new_role: role }, 'warn', req);
      res.json({ user: result.rows[0] });
    } catch {
      res.status(500).json({ error: 'Failed to assign role' });
    }
  });

  app.post('/super-admin/impersonate', authMiddleware, requirePermission('IMPERSONATE_TENANT'), async (req: AuthRequest, res: Response) => {
    const { target_user_id, reason } = req.body;
    if (!target_user_id || !reason) return res.status(400).json({ error: 'target_user_id and reason required' });
    try {
      const targetResult = await pool.query('SELECT id, role, tenant_id, is_active FROM users WHERE id = $1', [target_user_id]);
      if (!targetResult.rows.length || !targetResult.rows[0].is_active) return res.status(404).json({ error: 'Target user not found or inactive' });
      const target = targetResult.rows[0];
      if (target.role === ROLES.SUPER_ADMIN) return res.status(403).json({ error: 'Cannot impersonate a Super Admin' });
      const sessionToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
      await pool.query(
        `INSERT INTO impersonation_sessions (super_admin_id, target_user_id, target_tenant_id, token, reason, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [req.userId, target_user_id, target.tenant_id, sessionToken, reason, expiresAt],
      );
      const impersonationToken = jwt.sign(
        {
          userId: target.id,
          tenantId: target.tenant_id,
          role: target.role,
          type: 'access',
          impersonatedBy: req.userId,
          impersonationToken: sessionToken,
        },
        JWT_SECRET,
        { expiresIn: '2h' },
      );
      await logAudit(req.userId, req.tenantId, 'impersonation.start', 'user', target_user_id, { target_user_id, reason, expires_at: expiresAt }, 'warn', req);
      res.json({ token: impersonationToken, expires_at: expiresAt, target_user: { id: target.id, role: target.role, tenant_id: target.tenant_id } });
    } catch {
      res.status(500).json({ error: 'Failed to start impersonation session' });
    }
  });

  app.post('/super-admin/impersonate/end', authMiddleware, async (req: AuthRequest, res: Response) => {
    const { session_token } = req.body;
    try {
      await pool.query('UPDATE impersonation_sessions SET ended_at = NOW() WHERE token = $1', [session_token]);
      await logAudit(req.userId, req.tenantId, 'impersonation.end', 'user', undefined, {}, 'info', req);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: 'Failed to end impersonation session' });
    }
  });

  app.get('/super-admin/analytics', authMiddleware, requirePermission('GLOBAL_ANALYTICS'), async (_req: AuthRequest, res: Response) => {
    try {
      const [tenantStats, userTrend, docTrend, recentErrors] = await Promise.all([
        pool.query(
          `SELECT t.id, t.name, t.plan, t.is_active, COUNT(DISTINCT u.id) as user_count,
                  COUNT(DISTINCT d.id) as document_count, COUNT(DISTINCT c.id) as conversation_count
           FROM tenants t
           LEFT JOIN users u ON u.tenant_id = t.id
           LEFT JOIN documents d ON d.tenant_id = t.id
           LEFT JOIN conversations c ON c.tenant_id = t.id
           GROUP BY t.id ORDER BY user_count DESC`,
        ),
        pool.query(
          `SELECT DATE(created_at) as date, COUNT(*) as count
           FROM users WHERE created_at > NOW() - INTERVAL '30 days'
           GROUP BY DATE(created_at) ORDER BY date`,
        ),
        pool.query(
          `SELECT DATE(uploaded_at) as date, COUNT(*) as count
           FROM documents WHERE uploaded_at > NOW() - INTERVAL '30 days'
           GROUP BY DATE(uploaded_at) ORDER BY date`,
        ),
        pool.query(
          `SELECT al.action, al.resource_type, al.created_at, u.email
           FROM audit_logs al LEFT JOIN users u ON al.user_id = u.id
           WHERE al.severity = 'error'
           ORDER BY al.created_at DESC LIMIT 20`,
        ),
      ]);
      res.json({ tenant_stats: tenantStats.rows, user_trend: userTrend.rows, doc_trend: docTrend.rows, recent_errors: recentErrors.rows });
    } catch {
      res.status(500).json({ error: 'Failed to fetch analytics' });
    }
  });

  app.get('/super-admin/audit-logs', authMiddleware, requirePermission('AUDIT_LOG_READ'), async (req: AuthRequest, res: Response) => {
    const { tenant_id, user_id, action, severity, limit = '50', offset = '0' } = req.query as Record<string, string | undefined>;
    try {
      const params: unknown[] = [];
      const where: string[] = [];
      if (tenant_id) { params.push(tenant_id); where.push(`al.tenant_id = $${params.length}`); }
      if (user_id) { params.push(user_id); where.push(`al.user_id = $${params.length}`); }
      if (action) { params.push(`%${action}%`); where.push(`al.action ILIKE $${params.length}`); }
      if (severity) { params.push(severity); where.push(`al.severity = $${params.length}`); }
      const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
      params.push(parseInt(limit), parseInt(offset));
      const result = await pool.query(
        `SELECT al.*, u.email as user_email, t.name as tenant_name
         FROM audit_logs al
         LEFT JOIN users u ON al.user_id = u.id
         LEFT JOIN tenants t ON al.tenant_id = t.id
         ${whereClause}
         ORDER BY al.created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );
      res.json({ logs: result.rows, total: result.rows.length });
    } catch {
      res.status(500).json({ error: 'Failed to fetch audit logs' });
    }
  });
}
