import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcrypt';
import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import multer from 'multer';
import axios from 'axios';
import { Pool } from 'pg';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { env } from './infrastructure/config/env';
import {
  ROLES,
  hasPermission,
  isGlobalRole,
  rolePermissions as getRolePermissions,
} from './policies/rbac';
import type { AuthRequest } from './middleware/types';
import { createAuditLogger } from './infrastructure/logging/auditLogger';
import { registerLegacyRoutes } from './modules/app/routes/registerLegacyRoutes';

// ============================================================
// CONFIG
// ============================================================
const AI_SERVICE_URL = env.AI_SERVICE_URL;

const UPLOADS_DIR = path.resolve('uploads');
const JWT_SECRET = env.JWT_SECRET;
const JWT_EXPIRY = env.JWT_EXPIRY as SignOptions['expiresIn'];
const REFRESH_EXPIRY = env.REFRESH_EXPIRY as SignOptions['expiresIn'];
const REFRESH_COOKIE_NAME = env.REFRESH_COOKIE_NAME;

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
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
const pool = new Pool({ connectionString: env.DATABASE_URL });
const auditLogger = createAuditLogger(pool);

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

const corsOriginEnv = env.ALLOWED_ORIGINS;
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
  await auditLogger({
    tenantId,
    userId,
    action,
    resourceType,
    resourceId,
    details,
    severity,
    req,
  });
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
// ============================================================
// ROUTE REGISTRATION
// ============================================================
registerLegacyRoutes({
  app,
  pool,
  authLimiter,
  authMiddleware,
  requirePermission,
  upload,
  logAudit,
  parseCookies,
  normalizeUserRow,
  isGlobalRole,
  getRolePermissions,
  ROLES,
  AI_SERVICE_URL,
  JWT_SECRET,
  JWT_EXPIRY,
  REFRESH_EXPIRY,
  REFRESH_COOKIE_NAME,
  env,
  bcrypt,
  jwt,
  axios,
  fs,
  crypto,
  path,
});
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
const PORT = env.PORT;

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
