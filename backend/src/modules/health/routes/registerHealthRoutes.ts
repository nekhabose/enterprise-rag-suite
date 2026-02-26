import type { LegacyRouteDeps } from '../../app/routes/types';
import { createHealthController } from '../controllers/healthController';
export function registerHealthRoutes(deps: LegacyRouteDeps) { const { app } = deps; const c = createHealthController(deps); app.get('/', c.root); app.get('/health', c.health); }
