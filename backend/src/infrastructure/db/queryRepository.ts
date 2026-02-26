import type { Pool } from 'pg';
import type { QueryRepository } from '../../modules/app/routes/types';

export function createQueryRepository(pool: Pool): QueryRepository {
  return {
    query: (text: string, params?: unknown[]) => pool.query(text, params),
  };
}
