import type { Pool } from 'pg';
import type { QueryRepository } from '../../app/routes/types';
import { createQueryRepository } from '../../../infrastructure/db/queryRepository';

export function createAssessmentRepository(pool: Pool): QueryRepository {
  return createQueryRepository(pool);
}
