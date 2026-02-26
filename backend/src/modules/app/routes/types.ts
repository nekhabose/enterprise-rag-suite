import type { Express, Request, RequestHandler, Response } from 'express';
import type { Pool, QueryResult } from 'pg';
import type { Multer } from 'multer';
import type { SignOptions } from 'jsonwebtoken';
import type { AxiosStatic } from 'axios';
import type * as bcryptType from 'bcrypt';
import type * as jwtType from 'jsonwebtoken';
import type * as fsType from 'fs';
import type * as cryptoType from 'crypto';
import type * as pathType from 'path';
import type { AuthRequest } from '../../../middleware/types';
import { ROLES } from '../../../policies/rbac';

export interface LegacyRouteDeps {
  app: Express;
  pool: Pool;
  authLimiter: RequestHandler;
  authMiddleware: RequestHandler;
  requirePermission: (...permissions: string[]) => RequestHandler;
  upload: Multer;
  logAudit: (
    userId: number | undefined,
    tenantId: number | undefined,
    action: string,
    resourceType: string,
    resourceId?: number | string,
    details?: Record<string, unknown>,
    severity?: 'info' | 'warn' | 'error',
    req?: AuthRequest,
  ) => Promise<void>;
  parseCookies: (cookieHeader?: string) => Record<string, string>;
  normalizeUserRow: (user: unknown) => unknown;
  isGlobalRole: (role: string) => boolean;
  getRolePermissions: (role: string) => string[];
  ROLES: typeof ROLES;
  AI_SERVICE_URL: string;
  JWT_SECRET: string;
  JWT_EXPIRY: SignOptions['expiresIn'];
  REFRESH_EXPIRY: SignOptions['expiresIn'];
  REFRESH_COOKIE_NAME: string;
  env: {
    NODE_ENV: string;
  };
  bcrypt: typeof bcryptType;
  jwt: typeof jwtType;
  axios: AxiosStatic;
  fs: typeof fsType;
  crypto: typeof cryptoType;
  path: typeof pathType;
}

export type PublicHandler = (req: Request, res: Response) => Promise<unknown> | unknown;
export type AuthHandler = (req: AuthRequest, res: Response) => Promise<unknown> | unknown;

export interface QueryRepository {
  query: (text: string, params?: unknown[]) => Promise<QueryResult>;
}
