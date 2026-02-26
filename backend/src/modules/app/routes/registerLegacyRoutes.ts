import type { LegacyRouteDeps } from './types';
import { registerHealthRoutes } from '../../health/routes/registerHealthRoutes';
import { registerAuthLegacyRoutes } from '../../auth/routes/registerAuthLegacyRoutes';
import { registerSuperAdminRoutes } from '../../super-admin/routes/registerSuperAdminRoutes';
import { registerTenantAdminRoutes } from '../../tenant-admin/routes/registerTenantAdminRoutes';
import { registerDocumentRoutes } from '../../documents/routes/registerDocumentRoutes';
import { registerVideoRoutes } from '../../videos/routes/registerVideoRoutes';
import { registerConversationRoutes } from '../../conversations/routes/registerConversationRoutes';
import { registerAssessmentRoutes } from '../../assessments/routes/registerAssessmentRoutes';
import { registerConnectorRoutes } from '../../connectors/routes/registerConnectorRoutes';
import { registerSettingsRoutes } from '../../settings/routes/registerSettingsRoutes';
import { registerProxyRoutes } from '../../legacy/routes/registerProxyRoutes';
import { registerPortalCompatRoutes } from '../../legacy/routes/registerPortalCompatRoutes';
import { registerStudentExperienceRoutes } from '../../legacy/routes/registerStudentExperienceRoutes';

export function registerLegacyRoutes(deps: LegacyRouteDeps) {
  registerHealthRoutes(deps);
  registerAuthLegacyRoutes(deps);
  registerSuperAdminRoutes(deps);
  registerTenantAdminRoutes(deps);
  registerDocumentRoutes(deps);
  registerVideoRoutes(deps);
  registerConversationRoutes(deps);
  registerAssessmentRoutes(deps);
  registerConnectorRoutes(deps);
  registerSettingsRoutes(deps);
  registerProxyRoutes(deps);
  registerPortalCompatRoutes(deps);
  registerStudentExperienceRoutes(deps);
}
