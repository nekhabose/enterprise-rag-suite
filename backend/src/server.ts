import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcrypt';
import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import multer from 'multer';
import axios from 'axios';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

dotenv.config();

// ============================================================
// CONFIG
// ============================================================
const AI_SERVICE_URL =
  process.env.AI_SERVICE_URL?.trim() ||
  `http://${process.env.AI_SERVICE_HOST?.trim() || 'localhost'}:${process.env.AI_SERVICE_PORT?.trim() || '8000'}`;

const UPLOADS_DIR = path.resolve('uploads');
const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_THIS_SECRET_IN_PRODUCTION_32_CHARS_MIN';
const JWT_EXPIRY = (process.env.JWT_EXPIRY || '8h') as SignOptions['expiresIn'];
const REFRESH_EXPIRY = (process.env.REFRESH_EXPIRY || '7d') as SignOptions['expiresIn'];
const REFRESH_COOKIE_NAME = 'refreshToken';

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// ============================================================
// ROLES & PERMISSIONS
// ============================================================
export const ROLES = {
  SUPER_ADMIN:    'SUPER_ADMIN',
  INTERNAL_ADMIN: 'INTERNAL_ADMIN',
  INTERNAL_STAFF: 'INTERNAL_STAFF',
  TENANT_ADMIN:   'TENANT_ADMIN',
  FACULTY:        'FACULTY',
  STUDENT:        'STUDENT',
} as const;

type Role = typeof ROLES[keyof typeof ROLES];

const ROLE_PERMISSIONS: Record<string, string[]> = {
  SUPER_ADMIN: ['*'],
  INTERNAL_ADMIN: [
    'PLATFORM_READ', 'TENANT_READ', 'INTERNAL_USER_READ', 'INTERNAL_USER_WRITE',
    'GLOBAL_ANALYTICS', 'AUDIT_LOG_READ', 'TENANT_USER_READ', 'COURSE_READ',
    'KB_READ', 'DOCUMENT_READ', 'VIDEO_READ', 'ASSESSMENT_READ',
  ],
  INTERNAL_STAFF: [
    'PLATFORM_READ', 'TENANT_READ', 'TENANT_USER_READ',
    'COURSE_READ', 'KB_READ', 'DOCUMENT_READ', 'VIDEO_READ',
  ],
  TENANT_ADMIN: [
    'TENANT_USER_READ', 'TENANT_USER_WRITE', 'COURSE_READ', 'COURSE_WRITE',
    'KB_READ', 'KB_WRITE', 'CONNECTOR_CONFIGURE', 'AI_SETTINGS_UPDATE',
    'DOCUMENT_READ', 'DOCUMENT_WRITE', 'DOCUMENT_DELETE',
    'VIDEO_READ', 'VIDEO_WRITE', 'VIDEO_DELETE',
    'ASSESSMENT_READ', 'ASSESSMENT_WRITE', 'CHAT_USE',
    'AUDIT_LOG_READ', 'STUDENT_ANALYTICS',
  ],
  FACULTY: [
    'COURSE_READ', 'COURSE_WRITE', 'KB_READ', 'KB_WRITE',
    'DOCUMENT_READ', 'DOCUMENT_WRITE', 'VIDEO_READ', 'VIDEO_WRITE',
    'ASSESSMENT_READ', 'ASSESSMENT_WRITE', 'CHAT_USE', 'STUDENT_ANALYTICS',
  ],
  STUDENT: ['COURSE_READ', 'DOCUMENT_READ', 'VIDEO_READ', 'ASSESSMENT_READ', 'CHAT_USE'],
};

const GLOBAL_ROLES: Role[] = [ROLES.SUPER_ADMIN, ROLES.INTERNAL_ADMIN, ROLES.INTERNAL_STAFF];

function hasPermission(role: string, permission: string): boolean {
  const perms = ROLE_PERMISSIONS[role] ?? ROLE_PERMISSIONS.STUDENT;
  return perms.includes('*') || perms.includes(permission);
}

function isGlobalRole(role: string): boolean {
  return GLOBAL_ROLES.includes(role as Role);
}

function getRolePermissions(role: string): string[] {
  return ROLE_PERMISSIONS[role] ?? ROLE_PERMISSIONS.STUDENT;
}

function parseCookies(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) return {};
  return cookieHeader
    .split(';')
    .map((c) => c.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, part) => {
      const eq = part.indexOf('=');
      if (eq === -1) return acc;
      const key = part.slice(0, eq).trim();
      const value = decodeURIComponent(part.slice(eq + 1).trim());
      acc[key] = value;
      return acc;
    }, {});
}

function normalizeUserRow(user: any) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    tenantId: user.tenant_id ?? null,
    tenant_id: user.tenant_id ?? null,
    tenantName: user.tenant_name ?? null,
    tenant_name: user.tenant_name ?? null,
    firstName: user.first_name ?? '',
    first_name: user.first_name ?? '',
    lastName: user.last_name ?? '',
    last_name: user.last_name ?? '',
    isInternal: Boolean(user.is_internal),
    is_internal: Boolean(user.is_internal),
    permissions: getRolePermissions(user.role),
    isImpersonating: false,
  };
}

// ============================================================
// APP & DB
// ============================================================
const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ============================================================
// SECURITY MIDDLEWARE
// ============================================================
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many auth attempts.' },
});

app.use(limiter);

const corsOriginEnv = process.env.ALLOWED_ORIGINS || process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:3001';
const CORS_ORIGINS = corsOriginEnv
  .split(',')
  .map((s) => s.trim().replace(/\/$/, ''))
  .filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    const normalizedOrigin = origin?.replace(/\/$/, '');
    if (!origin || (normalizedOrigin && CORS_ORIGINS.includes(normalizedOrigin)) || CORS_ORIGINS.includes('*')) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin ${origin} not allowed`));
    }
  },
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Support frontend `/api/*` calls without duplicating all routes.
app.use((req: Request, _res: Response, next: NextFunction) => {
  if (req.url.startsWith('/api/')) {
    req.url = req.url.slice(4) || '/';
  }
  next();
});

// Request ID middleware
app.use((req: Request, _res: Response, next: NextFunction) => {
  (req as any).requestId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
  next();
});

// ============================================================
// TYPES
// ============================================================
interface AuthRequest extends Request {
  userId?: number;
  tenantId?: number;
  userRole?: string;
  isInternal?: boolean;
  requestId?: string;
}

// ============================================================
// MULTER - secure file upload
// ============================================================
const ALLOWED_MIME_TYPES = ['application/pdf'];
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
});

// ============================================================
// AUDIT LOGGING
// ============================================================
async function logAudit(
  userId: number | undefined,
  tenantId: number | undefined,
  action: string,
  resourceType: string,
  resourceId?: number | string,
  details: Record<string, unknown> = {},
  severity: 'info' | 'warn' | 'error' = 'info',
  req?: AuthRequest,
) {
  try {
    const role = req ? (await pool.query('SELECT role FROM users WHERE id = $1', [userId])).rows[0]?.role : undefined;
    await pool.query(
      `INSERT INTO audit_logs (tenant_id, user_id, role, action, resource_type, resource_id, details, ip_address, user_agent, severity)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        tenantId ?? null,
        userId ?? null,
        role ?? null,
        action,
        resourceType,
        typeof resourceId === 'number' ? resourceId : null,
        JSON.stringify(details),
        req?.ip ?? null,
        req?.headers['user-agent'] ?? null,
        severity,
      ],
    );
  } catch (err) {
    console.error('[AUDIT] Failed to write audit log:', err);
  }
}

// ============================================================
// AUTH MIDDLEWARE
// ============================================================
async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header required' });
  }

  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      userId: number;
      tenantId?: number;
      role?: string;
      isInternal?: boolean;
      type?: string;
    };

    if (decoded.type === 'refresh') {
      return res.status(401).json({ error: 'Refresh token cannot be used for API access' });
    }

    // Always fetch fresh user data from DB (not just JWT claims)
    const userResult = await pool.query(
      'SELECT id, tenant_id, role, is_active, is_internal FROM users WHERE id = $1',
      [decoded.userId],
    );

    if (!userResult.rows.length || !userResult.rows[0].is_active) {
      return res.status(401).json({ error: 'User not found or disabled' });
    }

    const user = userResult.rows[0];
    req.userId = user.id;
    req.userRole = user.role;
    req.isInternal = user.is_internal;

    // Global-scope roles don't need a tenant
    if (isGlobalRole(user.role)) {
      req.tenantId = user.tenant_id ?? undefined;
      return next();
    }

    // Tenant-scoped roles must have an active tenant
    if (!user.tenant_id) {
      return res.status(403).json({ error: 'User not assigned to a tenant' });
    }

    const tenantResult = await pool.query(
      'SELECT is_active FROM tenants WHERE id = $1',
      [user.tenant_id],
    );
    if (!tenantResult.rows.length || !tenantResult.rows[0].is_active) {
      return res.status(403).json({ error: 'Tenant is inactive or not found' });
    }

    req.tenantId = user.tenant_id;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ============================================================
// PERMISSION MIDDLEWARE
// ============================================================
function requirePermission(...permissions: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const role = req.userRole ?? 'STUDENT';
    const allowed = permissions.every(p => hasPermission(role, p));
    if (!allowed) {
      logAudit(req.userId, req.tenantId, 'permission.denied', 'api',
        undefined, { required: permissions, path: req.path }, 'warn', req);
      return res.status(403).json({
        error: 'Forbidden: insufficient permissions',
        required: permissions,
      });
    }
    next();
  };
}

// ============================================================
// TENANT ISOLATION HELPERS
// ============================================================
function assertTenantAccess(req: AuthRequest, res: Response, targetTenantId: number): boolean {
  if (!Number.isFinite(targetTenantId) || targetTenantId <= 0) {
    res.status(400).json({ error: 'Invalid tenant ID' });
    return false;
  }
  // Super admin and internal admin have global access
  if (req.userRole === ROLES.SUPER_ADMIN || req.userRole === ROLES.INTERNAL_ADMIN) {
    return true;
  }
  // Internal staff: check supported_tenant_ids
  if (req.userRole === ROLES.INTERNAL_STAFF) {
    // Checked async - allow and let DB query enforce
    return true;
  }
  // Tenant-scoped roles must match their own tenant
  if (req.tenantId !== targetTenantId) {
    res.status(403).json({ error: 'Cross-tenant access denied' });
    return false;
  }
  return true;
}

// ============================================================
// HEALTH CHECK
// ============================================================
app.get('/', (_req: Request, res: Response) => {
  res.json({ status: 'LMS Backend Running', timestamp: new Date().toISOString() });
});

app.get('/health', async (_req: Request, res: Response) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected' });
  }
});

// ============================================================
// AUTH ENDPOINTS
// ============================================================
app.post('/auth/login', authLimiter, async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  try {
    const result = await pool.query(
      `SELECT u.id, u.email, u.password_hash, u.tenant_id, u.role,
              u.is_active, u.is_internal, u.first_name, u.last_name,
              t.name as tenant_name, t.is_active as tenant_active
       FROM users u
       LEFT JOIN tenants t ON u.tenant_id = t.id
       WHERE u.email = $1`,
      [email.trim().toLowerCase()],
    );

    if (!result.rows.length) {
      await new Promise(r => setTimeout(r, 200)); // Timing attack prevention
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(403).json({ error: 'Account is disabled' });
    }

    if (!isGlobalRole(user.role) && !user.tenant_active) {
      return res.status(403).json({ error: 'Your institution is not currently active' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      logAudit(user.id, user.tenant_id, 'auth.login.failed', 'auth');
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login
    await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    const tokenPayload = {
      userId: user.id,
      tenantId: user.tenant_id,
      role: user.role,
      isInternal: user.is_internal,
      type: 'access',
    };

    const accessToken = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
    const refreshToken = jwt.sign({ ...tokenPayload, type: 'refresh' }, JWT_SECRET, { expiresIn: REFRESH_EXPIRY });

    logAudit(user.id, user.tenant_id, 'auth.login.success', 'auth', undefined, {}, 'info');

    res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      accessToken,
      token: accessToken,
      refreshToken,
      user: normalizeUserRow(user),
    });
  } catch (err) {
    console.error('[AUTH] Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/auth/refresh', async (req: Request, res: Response) => {
  const cookieToken = parseCookies(req.headers.cookie)[REFRESH_COOKIE_NAME];
  const refreshToken = req.body?.refreshToken || cookieToken;
  if (!refreshToken) return res.status(400).json({ error: 'Refresh token required' });

  try {
    const decoded = jwt.verify(refreshToken, JWT_SECRET) as JwtPayload & {
      userId: number;
      tenantId?: number;
      role?: string;
      isInternal?: boolean;
      type?: string;
    };
    if (decoded.type !== 'refresh') return res.status(401).json({ error: 'Invalid token type' });

    const userResult = await pool.query(
      'SELECT id, tenant_id, role, is_active, is_internal FROM users WHERE id = $1',
      [decoded.userId],
    );
    if (!userResult.rows.length || !userResult.rows[0].is_active) {
      return res.status(401).json({ error: 'User not found or disabled' });
    }

    const user = userResult.rows[0];
    const accessToken = jwt.sign(
      { userId: user.id, tenantId: user.tenant_id, role: user.role, isInternal: user.is_internal, type: 'access' },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY },
    );

    res.json({ accessToken, token: accessToken });
  } catch {
    res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});

app.get('/auth/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.email, u.role, u.tenant_id, u.is_internal, u.first_name, u.last_name,
              t.name as tenant_name
       FROM users u
       LEFT JOIN tenants t ON u.tenant_id = t.id
       WHERE u.id = $1`,
      [req.userId],
    );
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
    res.json({ user: normalizeUserRow(result.rows[0]) });
  } catch (err) {
    console.error('[AUTH] Me error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/auth/signup', authLimiter, async (req: Request, res: Response) => {
  const { email, password, invitationToken } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) return res.status(400).json({ error: 'Invalid email format' });

  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  try {
    let tenantId: number;
    let role = 'STUDENT';

    if (invitationToken) {
      const inv = await pool.query(
        `SELECT i.*, t.id as tenant_id, t.is_active as tenant_active
         FROM invitations i
         JOIN tenants t ON i.tenant_id = t.id
         WHERE i.token = $1 AND i.status = 'pending' AND i.expires_at > NOW()`,
        [invitationToken],
      );
      if (!inv.rows.length) return res.status(400).json({ error: 'Invalid or expired invitation' });
      tenantId = inv.rows[0].tenant_id;
      role = inv.rows[0].role;
      await pool.query("UPDATE invitations SET status = 'accepted' WHERE id = $1", [inv.rows[0].id]);
    } else {
      // Default tenant for self-signup
      const tResult = await pool.query('SELECT id FROM tenants WHERE domain = $1', ['state-university.edu']);
      if (!tResult.rows.length) return res.status(400).json({ error: 'No tenant available. Use an invitation link.' });
      tenantId = tResult.rows[0].id;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, role, tenant_id)
       VALUES ($1,$2,$3,$4) RETURNING id, email, role, tenant_id`,
      [email.trim().toLowerCase(), passwordHash, role, tenantId],
    );

    const user = result.rows[0];
    const token = jwt.sign(
      { userId: user.id, tenantId: user.tenant_id, role: user.role, type: 'access' },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY },
    );

    logAudit(user.id, tenantId, 'auth.signup', 'auth');
    res.json({ token, user: { id: user.id, email: user.email, role: user.role, tenant_id: user.tenant_id } });
  } catch (err: any) {
    if (err.code === '23505') return res.status(400).json({ error: 'Email already exists' });
    console.error('[AUTH] Signup error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/auth/change-password', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Both passwords required' });
  if (newPassword.length < 8) return res.status(400).json({ error: 'New password too short' });

  try {
    const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.userId]);
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });

    const valid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password incorrect' });

    const newHash = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [newHash, req.userId]);

    logAudit(req.userId, req.tenantId, 'auth.password_change', 'user', req.userId, {}, 'info', req);
    res.json({ success: true });
  } catch (err) {
    console.error('[AUTH] Change password error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============================================================
// SUPER ADMIN ENDPOINTS
// ============================================================

// Global dashboard stats
app.get('/super-admin/dashboard',
  authMiddleware,
  requirePermission('PLATFORM_READ'),
  async (req: AuthRequest, res: Response) => {
    try {
      const [tenants, users, docs, conversations, auditErrors] = await Promise.all([
        pool.query('SELECT COUNT(*) as total, COUNT(CASE WHEN is_active THEN 1 END) as active FROM tenants'),
        pool.query("SELECT COUNT(*) as total, COUNT(CASE WHEN role NOT IN ('SUPER_ADMIN','INTERNAL_ADMIN','INTERNAL_STAFF') THEN 1 END) as tenant_users, COUNT(CASE WHEN is_internal THEN 1 END) as internal_users FROM users"),
        pool.query('SELECT COUNT(*) as total FROM documents'),
        pool.query('SELECT COUNT(*) as total FROM conversations'),
        pool.query("SELECT COUNT(*) as total FROM audit_logs WHERE severity = 'error' AND created_at > NOW() - INTERVAL '24 hours'"),
      ]);

      const recentTenants = await pool.query(
        'SELECT id, name, domain, plan, is_active, created_at FROM tenants ORDER BY created_at DESC LIMIT 5',
      );

      const recentAudit = await pool.query(
        `SELECT al.id, al.action, al.resource_type, al.severity, al.created_at,
                u.email as user_email, t.name as tenant_name
         FROM audit_logs al
         LEFT JOIN users u ON al.user_id = u.id
         LEFT JOIN tenants t ON al.tenant_id = t.id
         ORDER BY al.created_at DESC LIMIT 20`,
      );

      res.json({
        stats: {
          tenants: {
            total: parseInt(tenants.rows[0].total),
            active: parseInt(tenants.rows[0].active),
          },
          users: {
            total: parseInt(users.rows[0].total),
            tenant_users: parseInt(users.rows[0].tenant_users),
            internal_users: parseInt(users.rows[0].internal_users),
          },
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
  },
);

// ---- TENANT MANAGEMENT ----

app.get('/super-admin/tenants',
  authMiddleware, requirePermission('TENANT_READ'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { include_inactive, search } = req.query;
      let q = `SELECT t.*, COUNT(DISTINCT u.id) as user_count
               FROM tenants t LEFT JOIN users u ON u.tenant_id = t.id`;
      const params: any[] = [];
      const where: string[] = [];

      if (include_inactive !== 'true') { where.push('t.is_active = true'); }
      if (search) {
        params.push(`%${search}%`);
        where.push(`(t.name ILIKE $${params.length} OR t.domain ILIKE $${params.length})`);
      }
      if (where.length) q += ' WHERE ' + where.join(' AND ');
      q += ' GROUP BY t.id ORDER BY t.created_at DESC';

      const result = await pool.query(q, params);
      res.json({ tenants: result.rows, total: result.rows.length });
    } catch (err) {
      res.status(500).json({ error: 'Failed to list tenants' });
    }
  },
);

app.post('/super-admin/tenants',
  authMiddleware, requirePermission('TENANT_CREATE'),
  async (req: AuthRequest, res: Response) => {
    const { name, domain, plan = 'free', max_users = 100, max_storage_gb = 10, contact_email } = req.body;
    if (!name || !domain) return res.status(400).json({ error: 'Name and domain required' });

    try {
      const result = await pool.query(
        `INSERT INTO tenants (name, domain, plan, max_users, max_storage_gb, contact_email)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [name, domain.trim().toLowerCase(), plan, max_users, max_storage_gb, contact_email],
      );
      const tenant = result.rows[0];

      // Create default AI settings for this tenant
      await pool.query('INSERT INTO tenant_ai_settings (tenant_id) VALUES ($1) ON CONFLICT DO NOTHING', [tenant.id]);

      logAudit(req.userId, req.tenantId, 'tenant.create', 'tenant', tenant.id, { name, domain }, 'info', req);
      res.status(201).json({ tenant });
    } catch (err: any) {
      if (err.code === '23505') return res.status(400).json({ error: 'Domain already exists' });
      res.status(500).json({ error: 'Failed to create tenant' });
    }
  },
);

app.get('/super-admin/tenants/:id',
  authMiddleware, requirePermission('TENANT_READ'),
  async (req: AuthRequest, res: Response) => {
    const tenantId = parseInt(req.params.id);
    try {
      const result = await pool.query(
        `SELECT t.*, COUNT(DISTINCT u.id) as user_count,
                COUNT(DISTINCT d.id) as document_count,
                COUNT(DISTINCT c.id) as course_count
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
  },
);

app.put('/super-admin/tenants/:id',
  authMiddleware, requirePermission('TENANT_UPDATE'),
  async (req: AuthRequest, res: Response) => {
    const tenantId = parseInt(req.params.id);
    const { name, plan, max_users, max_storage_gb, is_active, contact_email } = req.body;

    try {
      const result = await pool.query(
        `UPDATE tenants SET
           name = COALESCE($1, name),
           plan = COALESCE($2, plan),
           max_users = COALESCE($3, max_users),
           max_storage_gb = COALESCE($4, max_storage_gb),
           is_active = COALESCE($5, is_active),
           contact_email = COALESCE($6, contact_email),
           updated_at = NOW()
         WHERE id = $7 RETURNING *`,
        [name, plan, max_users, max_storage_gb, is_active, contact_email, tenantId],
      );
      if (!result.rows.length) return res.status(404).json({ error: 'Tenant not found' });
      logAudit(req.userId, req.tenantId, 'tenant.update', 'tenant', tenantId, req.body, 'info', req);
      res.json({ tenant: result.rows[0] });
    } catch {
      res.status(500).json({ error: 'Failed to update tenant' });
    }
  },
);

app.patch('/super-admin/tenants/:id/toggle',
  authMiddleware, requirePermission('TENANT_DISABLE'),
  async (req: AuthRequest, res: Response) => {
    const tenantId = parseInt(req.params.id);
    try {
      const result = await pool.query(
        'UPDATE tenants SET is_active = NOT is_active, updated_at = NOW() WHERE id = $1 RETURNING *',
        [tenantId],
      );
      if (!result.rows.length) return res.status(404).json({ error: 'Tenant not found' });
      logAudit(req.userId, req.tenantId, `tenant.${result.rows[0].is_active ? 'enable' : 'disable'}`,
        'tenant', tenantId, {}, 'warn', req);
      res.json({ tenant: result.rows[0] });
    } catch {
      res.status(500).json({ error: 'Failed to toggle tenant' });
    }
  },
);

// ---- INTERNAL USERS (employees & contractors) ----

app.get('/super-admin/internal-users',
  authMiddleware, requirePermission('INTERNAL_USER_READ'),
  async (_req: AuthRequest, res: Response) => {
    try {
      const result = await pool.query(
        `SELECT u.id, u.email, u.role, u.is_active, u.employee_type,
                u.first_name, u.last_name, u.supported_tenant_ids,
                u.last_login_at, u.created_at,
                ARRAY_AGG(t.name) FILTER (WHERE t.id IS NOT NULL) as supported_tenant_names
         FROM users u
         LEFT JOIN tenants t ON t.id = ANY(u.supported_tenant_ids)
         WHERE u.is_internal = true
         GROUP BY u.id
         ORDER BY u.created_at DESC`,
      );
      res.json({ users: result.rows, total: result.rows.length });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch internal users' });
    }
  },
);

app.post('/super-admin/internal-users',
  authMiddleware, requirePermission('INTERNAL_USER_WRITE'),
  async (req: AuthRequest, res: Response) => {
    const { email, password, role, employee_type, first_name, last_name, supported_tenant_ids = [] } = req.body;
    if (!email || !password || !role) return res.status(400).json({ error: 'email, password, role required' });

    const validInternalRoles = [ROLES.INTERNAL_ADMIN, ROLES.INTERNAL_STAFF];
    if (!validInternalRoles.includes(role)) {
      return res.status(400).json({ error: `Role must be one of: ${validInternalRoles.join(', ')}` });
    }

    try {
      // Get platform tenant
      const tResult = await pool.query("SELECT id FROM tenants WHERE domain = 'platform.internal' LIMIT 1");
      const platformTenantId = tResult.rows[0]?.id;

      const hash = await bcrypt.hash(password, 12);
      const result = await pool.query(
        `INSERT INTO users (email, password_hash, role, is_internal, employee_type,
                            first_name, last_name, supported_tenant_ids, tenant_id, is_active)
         VALUES ($1,$2,$3,true,$4,$5,$6,$7,$8,true) RETURNING *`,
        [email.trim().toLowerCase(), hash, role, employee_type, first_name, last_name,
          supported_tenant_ids, platformTenantId],
      );
      logAudit(req.userId, req.tenantId, 'internal_user.create', 'user', result.rows[0].id, { email, role }, 'info', req);
      res.status(201).json({ user: result.rows[0] });
    } catch (err: any) {
      if (err.code === '23505') return res.status(400).json({ error: 'Email already exists' });
      res.status(500).json({ error: 'Failed to create internal user' });
    }
  },
);

app.put('/super-admin/internal-users/:id',
  authMiddleware, requirePermission('INTERNAL_USER_WRITE'),
  async (req: AuthRequest, res: Response) => {
    const userId = parseInt(req.params.id);
    const { role, is_active, employee_type, supported_tenant_ids, first_name, last_name } = req.body;

    try {
      const result = await pool.query(
        `UPDATE users SET
           role = COALESCE($1, role),
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
      logAudit(req.userId, req.tenantId, 'internal_user.update', 'user', userId, req.body, 'info', req);
      res.json({ user: result.rows[0] });
    } catch {
      res.status(500).json({ error: 'Failed to update internal user' });
    }
  },
);

// ---- ROLE ASSIGNMENTS ----

app.post('/super-admin/users/:id/assign-role',
  authMiddleware, requirePermission('ROLE_ASSIGN'),
  async (req: AuthRequest, res: Response) => {
    const targetUserId = parseInt(req.params.id);
    const { role } = req.body;

    const validRoles = Object.values(ROLES);
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` });
    }

    // Prevent self-promotion to SUPER_ADMIN unless already SUPER_ADMIN
    if (role === ROLES.SUPER_ADMIN && req.userRole !== ROLES.SUPER_ADMIN) {
      return res.status(403).json({ error: 'Only a Super Admin can assign Super Admin role' });
    }

    try {
      const result = await pool.query(
        'UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2 RETURNING id, email, role',
        [role, targetUserId],
      );
      if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
      logAudit(req.userId, req.tenantId, 'role.assign', 'user', targetUserId, { new_role: role }, 'warn', req);
      res.json({ user: result.rows[0] });
    } catch {
      res.status(500).json({ error: 'Failed to assign role' });
    }
  },
);

// ---- IMPERSONATION ----

app.post('/super-admin/impersonate',
  authMiddleware, requirePermission('IMPERSONATE_TENANT'),
  async (req: AuthRequest, res: Response) => {
    const { target_user_id, reason } = req.body;
    if (!target_user_id || !reason) {
      return res.status(400).json({ error: 'target_user_id and reason required' });
    }

    try {
      const targetResult = await pool.query(
        'SELECT id, role, tenant_id, is_active FROM users WHERE id = $1',
        [target_user_id],
      );
      if (!targetResult.rows.length || !targetResult.rows[0].is_active) {
        return res.status(404).json({ error: 'Target user not found or inactive' });
      }

      const target = targetResult.rows[0];

      // Cannot impersonate other super admins
      if (target.role === ROLES.SUPER_ADMIN) {
        return res.status(403).json({ error: 'Cannot impersonate a Super Admin' });
      }

      const sessionToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours

      await pool.query(
        `INSERT INTO impersonation_sessions
           (super_admin_id, target_user_id, target_tenant_id, token, reason, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [req.userId, target_user_id, target.tenant_id, sessionToken, reason, expiresAt],
      );

      // Issue a short-lived token for the impersonated session
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

      logAudit(req.userId, req.tenantId, 'impersonation.start', 'user', target_user_id,
        { target_user_id, reason, expires_at: expiresAt }, 'warn', req);

      res.json({
        token: impersonationToken,
        expires_at: expiresAt,
        target_user: { id: target.id, role: target.role, tenant_id: target.tenant_id },
      });
    } catch {
      res.status(500).json({ error: 'Failed to start impersonation session' });
    }
  },
);

app.post('/super-admin/impersonate/end',
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    const { session_token } = req.body;
    try {
      await pool.query(
        'UPDATE impersonation_sessions SET ended_at = NOW() WHERE token = $1',
        [session_token],
      );
      logAudit(req.userId, req.tenantId, 'impersonation.end', 'user', undefined, {}, 'info', req);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: 'Failed to end impersonation session' });
    }
  },
);

// ---- GLOBAL ANALYTICS ----

app.get('/super-admin/analytics',
  authMiddleware, requirePermission('GLOBAL_ANALYTICS'),
  async (_req: AuthRequest, res: Response) => {
    try {
      const [tenantStats, userTrend, docTrend, recentErrors] = await Promise.all([
        pool.query(`
          SELECT t.id, t.name, t.plan, t.is_active,
                 COUNT(DISTINCT u.id) as user_count,
                 COUNT(DISTINCT d.id) as document_count,
                 COUNT(DISTINCT c.id) as conversation_count
          FROM tenants t
          LEFT JOIN users u ON u.tenant_id = t.id
          LEFT JOIN documents d ON d.tenant_id = t.id
          LEFT JOIN conversations c ON c.tenant_id = t.id
          GROUP BY t.id ORDER BY user_count DESC
        `),
        pool.query(`
          SELECT DATE(created_at) as date, COUNT(*) as count
          FROM users WHERE created_at > NOW() - INTERVAL '30 days'
          GROUP BY DATE(created_at) ORDER BY date
        `),
        pool.query(`
          SELECT DATE(uploaded_at) as date, COUNT(*) as count
          FROM documents WHERE uploaded_at > NOW() - INTERVAL '30 days'
          GROUP BY DATE(uploaded_at) ORDER BY date
        `),
        pool.query(`
          SELECT al.action, al.resource_type, al.created_at, u.email
          FROM audit_logs al LEFT JOIN users u ON al.user_id = u.id
          WHERE al.severity = 'error'
          ORDER BY al.created_at DESC LIMIT 20
        `),
      ]);

      res.json({
        tenant_stats: tenantStats.rows,
        user_trend: userTrend.rows,
        doc_trend: docTrend.rows,
        recent_errors: recentErrors.rows,
      });
    } catch {
      res.status(500).json({ error: 'Failed to fetch analytics' });
    }
  },
);

// ---- AUDIT LOGS (global) ----

app.get('/super-admin/audit-logs',
  authMiddleware, requirePermission('AUDIT_LOG_READ'),
  async (req: AuthRequest, res: Response) => {
    const { tenant_id, user_id, action, severity, limit = '50', offset = '0' } = req.query;

    try {
      const params: any[] = [];
      const where: string[] = [];

      if (tenant_id) { params.push(tenant_id); where.push(`al.tenant_id = $${params.length}`); }
      if (user_id) { params.push(user_id); where.push(`al.user_id = $${params.length}`); }
      if (action) { params.push(`%${action}%`); where.push(`al.action ILIKE $${params.length}`); }
      if (severity) { params.push(severity); where.push(`al.severity = $${params.length}`); }

      const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
      params.push(parseInt(limit as string), parseInt(offset as string));

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
  },
);

// ============================================================
// TENANT ADMIN ENDPOINTS
// ============================================================

// Get tenant-scoped dashboard
app.get('/tenant-admin/dashboard',
  authMiddleware, requirePermission('TENANT_USER_READ'),
  async (req: AuthRequest, res: Response) => {
    const tenantId = req.tenantId!;

    try {
      const [users, docs, videos, courses, conversations, aiSettings] = await Promise.all([
        pool.query('SELECT COUNT(*) as total, role FROM users WHERE tenant_id = $1 GROUP BY role', [tenantId]),
        pool.query('SELECT COUNT(*) as total FROM documents WHERE tenant_id = $1', [tenantId]),
        pool.query('SELECT COUNT(*) as total FROM videos WHERE tenant_id = $1', [tenantId]),
        pool.query('SELECT COUNT(*) as total FROM courses WHERE tenant_id = $1', [tenantId]),
        pool.query('SELECT COUNT(*) as total FROM conversations WHERE tenant_id = $1', [tenantId]),
        pool.query('SELECT * FROM tenant_ai_settings WHERE tenant_id = $1', [tenantId]),
      ]);

      const recentActivity = await pool.query(
        `SELECT al.action, al.resource_type, al.created_at, u.email
         FROM audit_logs al
         LEFT JOIN users u ON al.user_id = u.id
         WHERE al.tenant_id = $1
         ORDER BY al.created_at DESC LIMIT 20`,
        [tenantId],
      );

      res.json({
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
      res.status(500).json({ error: 'Failed to fetch tenant dashboard' });
    }
  },
);

// Tenant users management
app.get('/tenant-admin/users',
  authMiddleware, requirePermission('TENANT_USER_READ'),
  async (req: AuthRequest, res: Response) => {
    const tenantId = req.tenantId!;
    const { search, role } = req.query;

    try {
      const params: any[] = [tenantId];
      const where: string[] = ['u.tenant_id = $1'];

      if (search) { params.push(`%${search}%`); where.push(`(u.email ILIKE $${params.length} OR u.first_name ILIKE $${params.length} OR u.last_name ILIKE $${params.length})`); }
      if (role) { params.push(role); where.push(`u.role = $${params.length}`); }

      const result = await pool.query(
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

      res.json({ users: result.rows, total: result.rows.length });
    } catch {
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  },
);

app.post('/tenant-admin/users',
  authMiddleware, requirePermission('TENANT_USER_WRITE'),
  async (req: AuthRequest, res: Response) => {
    const { email, password, role = 'STUDENT', first_name, last_name } = req.body;
    const tenantId = req.tenantId!;

    if (!email || !password) return res.status(400).json({ error: 'email and password required' });

    const tenantRoles = [ROLES.STUDENT, ROLES.FACULTY, ROLES.TENANT_ADMIN];
    if (!tenantRoles.includes(role)) {
      return res.status(400).json({ error: `Role must be one of: ${tenantRoles.join(', ')}` });
    }

    try {
      const hash = await bcrypt.hash(password, 12);
      const result = await pool.query(
        `INSERT INTO users (email, password_hash, role, tenant_id, first_name, last_name)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, email, role, first_name, last_name`,
        [email.trim().toLowerCase(), hash, role, tenantId, first_name, last_name],
      );
      logAudit(req.userId, tenantId, 'tenant_user.create', 'user', result.rows[0].id, { email, role }, 'info', req);
      res.status(201).json({ user: result.rows[0] });
    } catch (err: any) {
      if (err.code === '23505') return res.status(400).json({ error: 'Email already exists' });
      res.status(500).json({ error: 'Failed to create user' });
    }
  },
);

app.put('/tenant-admin/users/:id',
  authMiddleware, requirePermission('TENANT_USER_WRITE'),
  async (req: AuthRequest, res: Response) => {
    const userId = parseInt(req.params.id);
    const tenantId = req.tenantId!;
    const { role, is_active, first_name, last_name } = req.body;

    try {
      const result = await pool.query(
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
      res.json({ user: result.rows[0] });
    } catch {
      res.status(500).json({ error: 'Failed to update user' });
    }
  },
);

// Tenant invitation
app.post('/tenant-admin/invite',
  authMiddleware, requirePermission('TENANT_USER_WRITE'),
  async (req: AuthRequest, res: Response) => {
    const { email, role = 'STUDENT' } = req.body;
    const tenantId = req.tenantId!;

    if (!email) return res.status(400).json({ error: 'Email required' });

    try {
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const result = await pool.query(
        `INSERT INTO invitations (tenant_id, invited_by, email, role, token, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [tenantId, req.userId, email, role, token, expiresAt],
      );
      logAudit(req.userId, tenantId, 'invitation.create', 'invitation', result.rows[0].id, { email, role }, 'info', req);
      res.json({ invitation: result.rows[0], invitation_link: `${process.env.FRONTEND_URL}/signup?token=${token}` });
    } catch {
      res.status(500).json({ error: 'Failed to create invitation' });
    }
  },
);

// Tenant courses
app.get('/tenant-admin/courses',
  authMiddleware, requirePermission('COURSE_READ'),
  async (req: AuthRequest, res: Response) => {
    const tenantId = req.tenantId!;
    try {
      const result = await pool.query(
        `SELECT c.*, u.email as faculty_email, u.first_name, u.last_name,
                COUNT(DISTINCT e.id) as enrollment_count
         FROM courses c
         LEFT JOIN users u ON c.faculty_id = u.id
         LEFT JOIN enrollments e ON e.course_id = c.id
         WHERE c.tenant_id = $1
         GROUP BY c.id, u.email, u.first_name, u.last_name
         ORDER BY c.created_at DESC`,
        [tenantId],
      );
      res.json({ courses: result.rows });
    } catch {
      res.status(500).json({ error: 'Failed to fetch courses' });
    }
  },
);

app.post('/tenant-admin/courses',
  authMiddleware, requirePermission('COURSE_WRITE'),
  async (req: AuthRequest, res: Response) => {
    const { title, description, faculty_id } = req.body;
    const tenantId = req.tenantId!;
    if (!title) return res.status(400).json({ error: 'Title required' });

    try {
      const result = await pool.query(
        `INSERT INTO courses (tenant_id, title, description, faculty_id)
         VALUES ($1,$2,$3,$4) RETURNING *`,
        [tenantId, title, description, faculty_id ?? req.userId],
      );
      logAudit(req.userId, tenantId, 'course.create', 'course', result.rows[0].id, { title }, 'info', req);
      res.status(201).json({ course: result.rows[0] });
    } catch {
      res.status(500).json({ error: 'Failed to create course' });
    }
  },
);

app.put('/tenant-admin/courses/:id',
  authMiddleware, requirePermission('COURSE_WRITE'),
  async (req: AuthRequest, res: Response) => {
    const courseId = parseInt(req.params.id);
    const tenantId = req.tenantId!;
    const { title, description, is_active, faculty_id } = req.body;

    try {
      const result = await pool.query(
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
      res.json({ course: result.rows[0] });
    } catch {
      res.status(500).json({ error: 'Failed to update course' });
    }
  },
);

// AI Settings for tenant
app.get('/tenant-admin/ai-settings',
  authMiddleware, requirePermission('AI_SETTINGS_UPDATE'),
  async (req: AuthRequest, res: Response) => {
    const tenantId = req.tenantId!;
    try {
      const result = await pool.query('SELECT * FROM tenant_ai_settings WHERE tenant_id = $1', [tenantId]);
      res.json(result.rows[0] ?? {});
    } catch {
      res.status(500).json({ error: 'Failed to get AI settings' });
    }
  },
);

app.put('/tenant-admin/ai-settings',
  authMiddleware, requirePermission('AI_SETTINGS_UPDATE'),
  async (req: AuthRequest, res: Response) => {
    const tenantId = req.tenantId!;
    const {
      llm_provider, llm_model, embedding_provider, embedding_model,
      chunking_strategy, retrieval_strategy, vector_store,
      rerank_enabled, max_tokens, temperature,
    } = req.body;

    try {
      const result = await pool.query(
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
      res.json(result.rows[0]);
    } catch {
      res.status(500).json({ error: 'Failed to update AI settings' });
    }
  },
);

// Tenant audit logs
app.get('/tenant-admin/audit-logs',
  authMiddleware, requirePermission('AUDIT_LOG_READ'),
  async (req: AuthRequest, res: Response) => {
    const tenantId = req.tenantId!;
    const { limit = '50', offset = '0' } = req.query;

    try {
      const result = await pool.query(
        `SELECT al.*, u.email as user_email
         FROM audit_logs al LEFT JOIN users u ON al.user_id = u.id
         WHERE al.tenant_id = $1
         ORDER BY al.created_at DESC LIMIT $2 OFFSET $3`,
        [tenantId, parseInt(limit as string), parseInt(offset as string)],
      );
      res.json({ logs: result.rows });
    } catch {
      res.status(500).json({ error: 'Failed to fetch audit logs' });
    }
  },
);

// ============================================================
// DOCUMENTS
// ============================================================
app.post('/documents/upload',
  authMiddleware, requirePermission('DOCUMENT_WRITE'),
  upload.single('file'),
  async (req: AuthRequest, res: Response) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const userId = req.userId!;
    const tenantId = req.tenantId!;
    const { provider, model, embedding_model, chunking_strategy, course_id, subject, year } = req.body;

    try {
      const absolutePath = path.resolve(req.file.path);
      const dbResult = await pool.query(
        `INSERT INTO documents (user_id, tenant_id, filename, file_path, file_type, file_size_bytes, subject, year, course_id)
         VALUES ($1,$2,$3,$4,'pdf',$5,$6,$7,$8) RETURNING id`,
        [userId, tenantId, req.file.originalname, absolutePath,
          req.file.size, subject ?? null, year ? parseInt(year) : null, course_id ?? null],
      );
      const documentId = dbResult.rows[0].id;

      try {
        const aiResponse = await axios.post(
          `${AI_SERVICE_URL}/ai/index-document`,
          {
            document_id: documentId,
            file_path: absolutePath,
            provider: provider ?? 'groq',
            model: model ?? null,
            embedding_model: embedding_model ?? null,
            chunking_strategy: chunking_strategy ?? 'semantic',
          },
          { timeout: 120000 },
        );

        await pool.query('UPDATE documents SET is_indexed = true WHERE id = $1', [documentId]);

        logAudit(userId, tenantId, 'document.upload', 'document', documentId,
          { filename: req.file.originalname, provider, chunks: (aiResponse.data as any).chunks_created }, 'info', req);

        res.json({
          success: true,
          document_id: documentId,
          filename: req.file.originalname,
          chunks_created: (aiResponse.data as any).chunks_created,
        });
      } catch (aiErr: any) {
        await pool.query('DELETE FROM documents WHERE id = $1', [documentId]);
        fs.unlink(absolutePath, () => {});
        res.status(500).json({ error: 'Failed to index document', details: aiErr.response?.data?.detail });
      }
    } catch (err) {
      console.error('[DOCUMENTS] Upload error:', err);
      res.status(500).json({ error: 'Failed to upload document' });
    }
  },
);

app.get('/documents',
  authMiddleware, requirePermission('DOCUMENT_READ'),
  async (req: AuthRequest, res: Response) => {
    const { userId, tenantId, userRole } = req;
    const { course_id } = req.query;

    try {
      const params: any[] = [tenantId];
      let q = `SELECT d.id, d.filename, d.subject, d.year, d.uploaded_at, d.is_indexed,
                      d.file_size_bytes, d.course_id, u.email as uploaded_by
               FROM documents d JOIN users u ON d.user_id = u.id
               WHERE d.tenant_id = $1`;

      // Students see only their own docs or docs linked to their enrolled courses
      if (userRole === ROLES.STUDENT) {
        q += ` AND (d.user_id = $2 OR d.course_id IN (
                 SELECT course_id FROM enrollments WHERE user_id = $2))`;
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
      const result = await pool.query(q, params);
      res.json(result.rows);
    } catch {
      res.status(500).json({ error: 'Failed to fetch documents' });
    }
  },
);

app.delete('/documents/:id',
  authMiddleware, requirePermission('DOCUMENT_DELETE'),
  async (req: AuthRequest, res: Response) => {
    const docId = parseInt(req.params.id);
    const tenantId = req.tenantId!;
    const userId = req.userId!;
    const isTenantAdmin = req.userRole === ROLES.TENANT_ADMIN || req.userRole === ROLES.SUPER_ADMIN;

    try {
      const where = isTenantAdmin
        ? 'id = $1 AND tenant_id = $2'
        : 'id = $1 AND tenant_id = $2 AND user_id = $3';
      const params = isTenantAdmin ? [docId, tenantId] : [docId, tenantId, userId];

      const result = await pool.query(
        `DELETE FROM documents WHERE ${where} RETURNING id, file_path`,
        params,
      );
      if (!result.rows.length) return res.status(404).json({ error: 'Document not found' });

      const filePath = result.rows[0].file_path;
      if (filePath && fs.existsSync(filePath)) fs.unlink(filePath, () => {});

      logAudit(userId, tenantId, 'document.delete', 'document', docId, {}, 'info', req);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: 'Failed to delete document' });
    }
  },
);

app.get('/documents/:id/download',
  authMiddleware, requirePermission('DOCUMENT_READ'),
  async (req: AuthRequest, res: Response) => {
    const docId = parseInt(req.params.id);
    const tenantId = req.tenantId!;
    const userId = req.userId!;

    try {
      const result = await pool.query(
        'SELECT filename, file_path FROM documents WHERE id = $1 AND tenant_id = $2',
        [docId, tenantId],
      );
      if (!result.rows.length) return res.status(404).json({ error: 'Document not found' });

      const { filename, file_path } = result.rows[0];
      if (!file_path || !fs.existsSync(file_path)) {
        return res.status(404).json({ error: 'File not found on disk' });
      }

      logAudit(userId, tenantId, 'document.download', 'document', docId, {}, 'info', req);
      res.download(file_path, filename);
    } catch {
      res.status(500).json({ error: 'Failed to download document' });
    }
  },
);

// ============================================================
// VIDEOS
// ============================================================
app.get('/videos',
  authMiddleware, requirePermission('VIDEO_READ'),
  async (req: AuthRequest, res: Response) => {
    const { userId, tenantId, userRole } = req;
    try {
      let q = `SELECT v.id, v.title, v.youtube_url, v.subject, v.year, v.created_at as uploaded_at,
                      u.email as uploaded_by
               FROM videos v JOIN users u ON v.user_id = u.id
               WHERE v.tenant_id = $1`;
      const params: any[] = [tenantId];

      if (userRole === ROLES.STUDENT) {
        q += ` AND (v.user_id = $2 OR v.course_id IN (SELECT course_id FROM enrollments WHERE user_id = $2))`;
        params.push(userId);
      }

      q += ' ORDER BY v.created_at DESC';
      const result = await pool.query(q, params);
      res.json(result.rows);
    } catch {
      res.status(500).json({ error: 'Failed to fetch videos' });
    }
  },
);

app.post('/videos/upload',
  authMiddleware, requirePermission('VIDEO_WRITE'),
  async (req: AuthRequest, res: Response) => {
    const { youtube_url, title, subject, year, provider, model, chunking_strategy, course_id } = req.body;
    const userId = req.userId!;
    const tenantId = req.tenantId!;

    if (!youtube_url) return res.status(400).json({ error: 'YouTube URL required' });

    const ytRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[A-Za-z0-9_-]{6,}/;
    if (!ytRegex.test(youtube_url)) return res.status(400).json({ error: 'Invalid YouTube URL' });

    try {
      const result = await pool.query(
        `INSERT INTO videos (user_id, tenant_id, youtube_url, title, subject, year, course_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [userId, tenantId, youtube_url, title ?? 'Untitled Video', subject ?? null, year ?? null, course_id ?? null],
      );
      const videoId = result.rows[0].id;

      try {
        const aiResponse = await axios.post(
          `${AI_SERVICE_URL}/ai/ingest-youtube`,
          { video_id: videoId, youtube_url, provider: provider ?? 'groq', model: model ?? null, chunking_strategy: chunking_strategy ?? 'fixed_size' },
          { timeout: 600000 },
        );
        logAudit(userId, tenantId, 'video.upload', 'video', videoId, { youtube_url }, 'info', req);
        res.json({ success: true, video_id: videoId, ...(aiResponse.data as any) });
      } catch (aiErr: any) {
        await pool.query('DELETE FROM videos WHERE id = $1', [videoId]);
        res.status(500).json({ error: 'Failed to ingest video', details: aiErr.response?.data?.detail });
      }
    } catch {
      res.status(500).json({ error: 'Failed to save video' });
    }
  },
);

app.delete('/videos/:id',
  authMiddleware, requirePermission('VIDEO_DELETE'),
  async (req: AuthRequest, res: Response) => {
    const videoId = parseInt(req.params.id);
    const tenantId = req.tenantId!;
    const userId = req.userId!;
    const isTenantAdmin = req.userRole === ROLES.TENANT_ADMIN || req.userRole === ROLES.SUPER_ADMIN;

    try {
      const where = isTenantAdmin ? 'id = $1 AND tenant_id = $2' : 'id = $1 AND tenant_id = $2 AND user_id = $3';
      const params = isTenantAdmin ? [videoId, tenantId] : [videoId, tenantId, userId];
      const result = await pool.query(`DELETE FROM videos WHERE ${where} RETURNING id`, params);
      if (!result.rows.length) return res.status(404).json({ error: 'Video not found' });
      logAudit(userId, tenantId, 'video.delete', 'video', videoId, {}, 'info', req);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: 'Failed to delete video' });
    }
  },
);

// ============================================================
// CONVERSATIONS & CHAT
// ============================================================
app.get('/conversations', authMiddleware, requirePermission('CHAT_USE'), async (req: AuthRequest, res: Response) => {
  const { userId, tenantId } = req;
  try {
    const result = await pool.query(
      'SELECT id, title, created_at FROM conversations WHERE user_id = $1 AND tenant_id = $2 ORDER BY created_at DESC',
      [userId, tenantId],
    );
    res.json(result.rows);
  } catch { res.status(500).json({ error: 'Failed to fetch conversations' }); }
});

app.post('/conversations', authMiddleware, requirePermission('CHAT_USE'), async (req: AuthRequest, res: Response) => {
  const { title } = req.body;
  const { userId, tenantId } = req;
  try {
    const result = await pool.query(
      'INSERT INTO conversations (user_id, tenant_id, title) VALUES ($1,$2,$3) RETURNING *',
      [userId, tenantId, title ?? 'New Conversation'],
    );
    res.json(result.rows[0]);
  } catch { res.status(500).json({ error: 'Failed to create conversation' }); }
});

app.get('/conversations/:id/messages', authMiddleware, requirePermission('CHAT_USE'), async (req: AuthRequest, res: Response) => {
  const convId = parseInt(req.params.id);
  const { userId, tenantId } = req;
  try {
    // Verify ownership and tenant
    const conv = await pool.query(
      'SELECT id FROM conversations WHERE id = $1 AND user_id = $2 AND tenant_id = $3',
      [convId, userId, tenantId],
    );
    if (!conv.rows.length) return res.status(404).json({ error: 'Conversation not found' });

    const msgs = await pool.query(
      'SELECT id, role, content, sources, created_at FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [convId],
    );
    res.json(msgs.rows);
  } catch { res.status(500).json({ error: 'Failed to fetch messages' }); }
});

app.delete('/conversations/:id', authMiddleware, requirePermission('CHAT_USE'), async (req: AuthRequest, res: Response) => {
  const convId = parseInt(req.params.id);
  const { userId, tenantId } = req;
  try {
    const result = await pool.query(
      'DELETE FROM conversations WHERE id = $1 AND user_id = $2 AND tenant_id = $3 RETURNING id',
      [convId, userId, tenantId],
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Conversation not found' });
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'Failed to delete conversation' }); }
});

app.post('/chat/send', authMiddleware, requirePermission('CHAT_USE'), async (req: AuthRequest, res: Response) => {
  const { conversation_id, question, document_ids, provider, model, retrieval_strategy, enable_reranking, top_k } = req.body;
  const { userId, tenantId } = req;

  if (!question) return res.status(400).json({ error: 'Question required' });

  try {
    let convId = conversation_id;
    if (!convId) {
      const created = await pool.query(
        'INSERT INTO conversations (user_id, tenant_id, title) VALUES ($1,$2,$3) RETURNING id',
        [userId, tenantId, `Chat ${new Date().toLocaleString()}`],
      );
      convId = created.rows[0].id;
    } else {
      const conv = await pool.query(
        'SELECT id FROM conversations WHERE id = $1 AND user_id = $2 AND tenant_id = $3',
        [convId, userId, tenantId],
      );
      if (!conv.rows.length) return res.status(404).json({ error: 'Conversation not found' });
    }

    await pool.query(
      'INSERT INTO messages (conversation_id, role, content) VALUES ($1,$2,$3)',
      [convId, 'user', question],
    );

    const aiResponse = await axios.post(
      `${AI_SERVICE_URL}/ai/rag-answer`,
      {
        user_id: userId,
        question,
        document_ids: document_ids ?? null,
        provider: provider ?? 'groq',
        model: model ?? null,
        retrieval_strategy: retrieval_strategy ?? 'hybrid',
        enable_reranking: Boolean(enable_reranking),
        top_k: Number(top_k) ?? 5,
      },
      { timeout: 60000 },
    );

    const { answer, sources } = aiResponse.data as any;

    const msgResult = await pool.query(
      'INSERT INTO messages (conversation_id, role, content, sources) VALUES ($1,$2,$3,$4) RETURNING *',
      [convId, 'assistant', answer, JSON.stringify(sources)],
    );

    logAudit(userId, tenantId, 'chat.message', 'conversation', convId, { provider }, 'info', req);

    res.json({ conversation_id: convId, message: msgResult.rows[0], answer, sources, ...(aiResponse.data as any) });
  } catch (err: any) {
    res.status(500).json({ error: 'Chat failed', details: err.response?.data?.detail });
  }
});

app.post('/chat/answer', authMiddleware, requirePermission('CHAT_USE'), async (req: AuthRequest, res: Response) => {
  const { question, document_ids, provider, model, retrieval_strategy, enable_reranking, top_k } = req.body;
  const { userId } = req;

  if (!question) return res.status(400).json({ error: 'Question required' });

  try {
    const aiResponse = await axios.post(
      `${AI_SERVICE_URL}/ai/rag-answer`,
      { user_id: userId, question, document_ids: document_ids ?? null,
        provider: provider ?? 'groq', model: model ?? null,
        retrieval_strategy: retrieval_strategy ?? 'hybrid',
        enable_reranking: Boolean(enable_reranking), top_k: Number(top_k) ?? 5 },
      { timeout: 60000 },
    );
    res.json(aiResponse.data);
  } catch (err: any) {
    res.status(500).json({ error: 'Chat failed', details: err.response?.data?.detail });
  }
});

// ============================================================
// ASSESSMENTS
// ============================================================
app.get('/assessments', authMiddleware, requirePermission('ASSESSMENT_READ'), async (req: AuthRequest, res: Response) => {
  const { userId, tenantId, userRole } = req;
  try {
    const isAdmin = [ROLES.TENANT_ADMIN, ROLES.FACULTY, ROLES.SUPER_ADMIN].includes(userRole as any);
    const result = await pool.query(
      `SELECT id, title, difficulty, created_at FROM assessments
       WHERE tenant_id = $1 ${isAdmin ? '' : 'AND user_id = $2'}
       ORDER BY created_at DESC`,
      isAdmin ? [tenantId] : [tenantId, userId],
    );
    res.json(result.rows);
  } catch { res.status(500).json({ error: 'Failed to fetch assessments' }); }
});

app.post('/assessments/create', authMiddleware, requirePermission('ASSESSMENT_WRITE'), async (req: AuthRequest, res: Response) => {
  const { title, document_ids, video_ids, question_count, difficulty, question_types, provider, model } = req.body;
  try {
    const aiResponse = await axios.post(
      `${AI_SERVICE_URL}/ai/create-assessment`,
      { title, document_ids, video_ids, question_count: question_count ?? 10,
        difficulty: difficulty ?? 'medium', question_types: question_types ?? ['multiple_choice'],
        provider: provider ?? 'groq', model: model ?? null },
      { timeout: 180000 },
    );
    res.json(aiResponse.data);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to create assessment', details: err.response?.data?.detail });
  }
});

app.get('/assessments/:id', authMiddleware, requirePermission('ASSESSMENT_READ'), async (req: AuthRequest, res: Response) => {
  const assessmentId = parseInt(req.params.id);
  const { userId, tenantId, userRole } = req;
  try {
    const isAdmin = [ROLES.TENANT_ADMIN, ROLES.FACULTY, ROLES.SUPER_ADMIN].includes(userRole as any);
    const aResult = await pool.query(
      `SELECT * FROM assessments WHERE id = $1 AND tenant_id = $2 ${isAdmin ? '' : 'AND user_id = $3'}`,
      isAdmin ? [assessmentId, tenantId] : [assessmentId, tenantId, userId],
    );
    if (!aResult.rows.length) return res.status(404).json({ error: 'Assessment not found' });

    const questions = await pool.query('SELECT * FROM questions WHERE assessment_id = $1 ORDER BY id', [assessmentId]);
    res.json({ ...aResult.rows[0], questions: questions.rows });
  } catch { res.status(500).json({ error: 'Failed to fetch assessment' }); }
});

app.post('/assessments/:id/submit', authMiddleware, requirePermission('ASSESSMENT_READ'), async (req: AuthRequest, res: Response) => {
  const assessmentId = parseInt(req.params.id);
  const { answers } = req.body;
  try {
    const aiResponse = await axios.post(
      `${AI_SERVICE_URL}/ai/submit-assessment`,
      { assessment_id: assessmentId, answers },
      { timeout: 180000 },
    );
    res.json(aiResponse.data);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to submit assessment', details: err.response?.data?.detail });
  }
});

app.delete('/assessments/:id', authMiddleware, requirePermission('ASSESSMENT_WRITE'), async (req: AuthRequest, res: Response) => {
  const assessmentId = parseInt(req.params.id);
  const { tenantId, userId } = req;
  try {
    const result = await pool.query(
      'DELETE FROM assessments WHERE id = $1 AND tenant_id = $2 AND user_id = $3 RETURNING id',
      [assessmentId, tenantId, userId],
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Assessment not found' });
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'Failed to delete assessment' }); }
});

// ============================================================
// CONNECTORS
// ============================================================
app.get('/connectors', authMiddleware, requirePermission('CONNECTOR_CONFIGURE'), async (_req, res: Response) => {
  try {
    const aiResponse = await axios.get(`${AI_SERVICE_URL}/ai/connectors`);
    res.json(aiResponse.data);
  } catch { res.status(500).json({ error: 'Failed to list connectors' }); }
});

app.post('/connectors/ingest', authMiddleware, requirePermission('CONNECTOR_CONFIGURE'), async (req: AuthRequest, res: Response) => {
  try {
    const aiResponse = await axios.post(`${AI_SERVICE_URL}/ai/connectors/ingest`, {
      ...req.body, user_id: req.userId, tenant_id: req.tenantId,
    });
    logAudit(req.userId, req.tenantId, 'connector.ingest', 'connector', undefined, { connector: req.body?.connector }, 'info', req);
    res.json(aiResponse.data);
  } catch (err: any) {
    res.status(err.response?.status ?? 500).json({ error: 'Connector ingestion failed', details: err.response?.data?.detail });
  }
});

// ============================================================
// USER SETTINGS & PROFILE
// ============================================================
app.get('/settings', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query('SELECT settings, updated_at FROM user_settings WHERE user_id = $1', [req.userId]);
    res.json(result.rows[0] ?? { settings: {}, updated_at: null });
  } catch { res.status(500).json({ error: 'Failed to get settings' }); }
});

app.post('/settings', authMiddleware, async (req: AuthRequest, res: Response) => {
  const settings = req.body?.settings ?? req.body ?? {};
  try {
    const result = await pool.query(
      `INSERT INTO user_settings (user_id, settings) VALUES ($1,$2::jsonb)
       ON CONFLICT (user_id) DO UPDATE SET settings = EXCLUDED.settings, updated_at = NOW()
       RETURNING settings, updated_at`,
      [req.userId, JSON.stringify(settings)],
    );
    res.json(result.rows[0]);
  } catch { res.status(500).json({ error: 'Failed to save settings' }); }
});

app.get('/profile', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.email, u.role, u.first_name, u.last_name, u.is_active,
              u.is_internal, u.employee_type, u.last_login_at, u.created_at,
              t.name as tenant_name, t.domain as tenant_domain, t.plan as tenant_plan
       FROM users u LEFT JOIN tenants t ON u.tenant_id = t.id
       WHERE u.id = $1`,
      [req.userId],
    );
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch { res.status(500).json({ error: 'Failed to get profile' }); }
});

// ============================================================
// LEGACY / PROXY ENDPOINTS
// ============================================================
app.get('/admin/tenants', authMiddleware, requirePermission('TENANT_READ'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT id, name, domain, plan, is_active, created_at FROM tenants ORDER BY created_at DESC',
    );
    res.json({ tenants: result.rows, total: result.rows.length });
  } catch { res.status(500).json({ error: 'Failed to list tenants' }); }
});

app.get('/llms/providers', authMiddleware, async (_req, res: Response) => {
  try {
    const aiResponse = await axios.get(`${AI_SERVICE_URL}/ai/llm-providers`);
    res.json(aiResponse.data);
  } catch { res.status(500).json({ error: 'Failed to get LLM providers' }); }
});

app.get('/embeddings/providers', authMiddleware, async (_req, res: Response) => {
  try {
    const aiResponse = await axios.get(`${AI_SERVICE_URL}/ai/embeddings/providers`);
    res.json(aiResponse.data);
  } catch { res.status(500).json({ error: 'Failed to get embedding providers' }); }
});

// ============================================================
// ERROR HANDLER
// ============================================================
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[ERROR]', err);
  if (err.message === 'Only PDF files are allowed') {
    return res.status(400).json({ error: err.message });
  }
  res.status(500).json({ error: 'Internal server error' });
});

// ============================================================
// START
// ============================================================
const PORT = process.env.PORT ?? 3000;

const ensureTables = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      settings JSONB NOT NULL DEFAULT '{}',
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // Backward-compatible schema upgrades for local/dev databases.
  await pool.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS is_internal BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS employee_type VARCHAR(50),
      ADD COLUMN IF NOT EXISTS supported_tenant_ids INT[] DEFAULT '{}'
  `);

  await pool.query(`
    ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255)
  `);

  await pool.query(`
    ALTER TABLE documents
      ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT,
      ADD COLUMN IF NOT EXISTS course_id INT REFERENCES courses(id),
      ADD COLUMN IF NOT EXISTS is_indexed BOOLEAN DEFAULT false
  `);

  await pool.query(`
    ALTER TABLE videos
      ADD COLUMN IF NOT EXISTS course_id INT REFERENCES courses(id)
  `);

  await pool.query(`
    ALTER TABLE impersonation_sessions
      ADD COLUMN IF NOT EXISTS super_admin_id INT REFERENCES users(id),
      ADD COLUMN IF NOT EXISTS token VARCHAR(255) UNIQUE
  `);

  await pool.query(`
    ALTER TABLE audit_logs
      ADD COLUMN IF NOT EXISTS role VARCHAR(50),
      ADD COLUMN IF NOT EXISTS severity VARCHAR(10) DEFAULT 'info'
  `);
};

ensureTables()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`✅ LMS Backend running on http://localhost:${PORT}`);
      console.log(`✅ AI Service URL: ${AI_SERVICE_URL}`);
    });
  })
  .catch(err => {
    console.error('❌ Startup failed:', err);
    process.exit(1);
  });

export default app;
