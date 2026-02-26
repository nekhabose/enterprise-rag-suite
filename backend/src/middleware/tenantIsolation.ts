import type { Response, NextFunction } from 'express';
import type { AuthRequest } from './types';
import { isGlobalRole } from '../policies/rbac';

export const enforceTenantIsolation = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.userRole) {
    return res.status(401).json({ error: 'Unauthenticated' });
  }

  if (isGlobalRole(req.userRole)) {
    return next();
  }

  const targetTenantId = Number(
    req.body?.tenant_id ??
    req.body?.tenantId ??
    req.query?.tenant_id ??
    req.query?.tenantId ??
    req.headers['x-tenant-id'] ??
    req.tenantId,
  );

  if (!targetTenantId || Number(req.tenantId) !== targetTenantId) {
    return res.status(403).json({ error: 'Cross-tenant access denied' });
  }

  next();
};
