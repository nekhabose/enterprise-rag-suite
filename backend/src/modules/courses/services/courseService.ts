import { CourseRepository } from '../repositories/courseRepository';

export class CourseService {
  constructor(private readonly repo: CourseRepository) {}

  async listTenantCourses(tenantId: number) {
    return this.repo.listByTenant(tenantId);
  }
}
