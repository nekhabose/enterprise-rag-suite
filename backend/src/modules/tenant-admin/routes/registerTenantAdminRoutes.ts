import type { LegacyRouteDeps } from '../../app/routes/types';
import { createTenantAdminController } from '../controllers/tenantAdminController';

export function registerTenantAdminRoutes(deps: LegacyRouteDeps) {
  const { app, authMiddleware, requirePermission } = deps;
  const controller = createTenantAdminController(deps);

  app.get('/tenant-admin/dashboard', authMiddleware, requirePermission('TENANT_USER_READ'), controller.dashboard);
  app.get('/tenant-admin/users', authMiddleware, requirePermission('TENANT_USER_READ'), controller.listUsers);
  app.post('/tenant-admin/users', authMiddleware, requirePermission('TENANT_USER_WRITE'), controller.createUser);
  app.put('/tenant-admin/users/:id', authMiddleware, requirePermission('TENANT_USER_WRITE'), controller.updateUser);
  app.post('/tenant-admin/invite', authMiddleware, requirePermission('TENANT_USER_WRITE'), controller.invite);
  app.get('/tenant-admin/courses', authMiddleware, requirePermission('COURSE_READ'), controller.listCourses);
  app.post('/tenant-admin/courses', authMiddleware, requirePermission('COURSE_WRITE'), controller.createCourse);
  app.put('/tenant-admin/courses/:id', authMiddleware, requirePermission('COURSE_WRITE'), controller.updateCourse);
  app.get('/tenant-admin/ai-settings', authMiddleware, requirePermission('AI_SETTINGS_UPDATE'), controller.getAiSettings);
  app.put('/tenant-admin/ai-settings', authMiddleware, requirePermission('AI_SETTINGS_UPDATE'), controller.updateAiSettings);
  app.get('/tenant-admin/audit-logs', authMiddleware, requirePermission('AUDIT_LOG_READ'), controller.auditLogs);
}
