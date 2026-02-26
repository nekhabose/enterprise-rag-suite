import type { AuthRequest } from '../../../middleware/types';
import type { Response } from 'express';
import type { LegacyRouteDeps } from '../../app/routes/types';
import { createProxyRepository } from '../repositories/proxyRepository';

export function createProxyService(deps: LegacyRouteDeps) {
  const { AI_SERVICE_URL, axios } = deps;
  const repo = createProxyRepository(deps.pool);

  return {
    listTenants: async (_req: AuthRequest, res: Response) => {
      try {
        const result = await repo.query(
          'SELECT id, name, domain, plan, is_active, created_at FROM tenants ORDER BY created_at DESC',
        );
        return res.json({ tenants: result.rows, total: result.rows.length });
      } catch {
        return res.status(500).json({ error: 'Failed to list tenants' });
      }
    },

    llmProviders: async (_req: AuthRequest, res: Response) => {
      try {
        const aiResponse = await axios.get(`${AI_SERVICE_URL}/ai/llm-providers`);
        return res.json(aiResponse.data);
      } catch {
        return res.status(500).json({ error: 'Failed to get LLM providers' });
      }
    },

    embeddingProviders: async (_req: AuthRequest, res: Response) => {
      try {
        const aiResponse = await axios.get(`${AI_SERVICE_URL}/ai/embeddings/providers`);
        return res.json(aiResponse.data);
      } catch {
        return res.status(500).json({ error: 'Failed to get embedding providers' });
      }
    },
  };
}
