import type { Pool } from 'pg';

export class CourseRepository {
  constructor(private readonly pool: Pool) {}

  async listByTenant(tenantId: number) {
    const result = await this.pool.query(
      `SELECT c.*, u.email as faculty_email, u.first_name, u.last_name,
              COUNT(DISTINCT e.id) as enrollment_count
       FROM courses c
       LEFT JOIN users u ON c.faculty_id = u.id
       LEFT JOIN course_enrollments e ON e.course_id = c.id
       WHERE c.tenant_id = $1
       GROUP BY c.id, u.email, u.first_name, u.last_name
       ORDER BY c.created_at DESC`,
      [tenantId],
    );
    return result.rows;
  }
}
