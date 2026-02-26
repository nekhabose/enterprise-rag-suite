import type { Response } from 'express';
import type { AuthRequest } from '../../../middleware/types';
import { CourseService } from '../services/courseService';

export class CourseController {
  constructor(private readonly service: CourseService) {}

  listCourses = async (req: AuthRequest, res: Response) => {
    try {
      const courses = await this.service.listTenantCourses(Number(req.tenantId));
      res.json({ courses });
    } catch {
      res.status(500).json({ error: 'Failed to fetch courses' });
    }
  };
}
