import type { Request } from 'express';

export interface AuthRequest extends Request {
  userId?: number;
  tenantId?: number;
  userRole?: string;
  isInternal?: boolean;
  requestId?: string;
  file?: Express.Multer.File;
}
