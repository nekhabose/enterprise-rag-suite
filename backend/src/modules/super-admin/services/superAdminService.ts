import type { LegacyRouteDeps } from '../../app/routes/types';
import { createSuperAdminRepository } from '../repositories/superAdminRepository';
export function createSuperAdminService(deps: LegacyRouteDeps) {
  const repo = createSuperAdminRepository(deps.pool);
  return { repo };
}
