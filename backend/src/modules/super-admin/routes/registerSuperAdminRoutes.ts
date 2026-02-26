import type { LegacyRouteDeps } from '../../app/routes/types';
import { registerSuperAdminController } from '../controllers/superAdminController';

export function registerSuperAdminRoutes(deps: LegacyRouteDeps) {
  registerSuperAdminController(deps);
}
