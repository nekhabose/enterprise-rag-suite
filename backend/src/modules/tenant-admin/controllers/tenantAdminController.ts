import type { Response } from 'express';
import type { AuthRequest } from '../../../middleware/types';
import type { LegacyRouteDeps } from '../../app/routes/types';
import { createTenantAdminService } from '../services/tenantAdminService';

export function createTenantAdminController(deps: LegacyRouteDeps) {
  const service = createTenantAdminService(deps);

  return {
    dashboard: (req: AuthRequest, res: Response) => service.dashboard(req, res),
    listUsers: (req: AuthRequest, res: Response) => service.listUsers(req, res),
    createUser: (req: AuthRequest, res: Response) => service.createUser(req, res),
    updateUser: (req: AuthRequest, res: Response) => service.updateUser(req, res),
    invite: (req: AuthRequest, res: Response) => service.invite(req, res),
    listCourses: (req: AuthRequest, res: Response) => service.listCourses(req, res),
    createCourse: (req: AuthRequest, res: Response) => service.createCourse(req, res),
    updateCourse: (req: AuthRequest, res: Response) => service.updateCourse(req, res),
    listCourseEnrollments: (req: AuthRequest, res: Response) => service.listCourseEnrollments(req, res),
    replaceCourseEnrollments: (req: AuthRequest, res: Response) => service.replaceCourseEnrollments(req, res),
    getAiSettings: (req: AuthRequest, res: Response) => service.getAiSettings(req, res),
    updateAiSettings: (req: AuthRequest, res: Response) => service.updateAiSettings(req, res),
    auditLogs: (req: AuthRequest, res: Response) => service.auditLogs(req, res),
  };
}
