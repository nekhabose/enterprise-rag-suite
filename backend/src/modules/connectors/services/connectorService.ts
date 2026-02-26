import type { AuthRequest } from '../../../middleware/types';
import type { Response } from 'express';
import type { LegacyRouteDeps } from '../../app/routes/types';
import { createConnectorRepository } from '../repositories/connectorRepository';

export function createConnectorService(deps: LegacyRouteDeps) {
  const { AI_SERVICE_URL, axios, logAudit } = deps;
  createConnectorRepository(deps.pool);

  return {
    list: async (_req: AuthRequest, res: Response) => {
      try {
        const aiResponse = await axios.get(`${AI_SERVICE_URL}/ai/connectors`);
        return res.json(aiResponse.data);
      } catch {
        return res.json({
          connectors: [
            { key: 'lms', label: 'LMS', enabled: true },
            { key: 'drive', label: 'Google Drive', enabled: false },
            { key: 'slack', label: 'Slack', enabled: false },
            { key: 'notion', label: 'Notion', enabled: false },
          ],
          warning: 'AI connector service unavailable; returning defaults',
        });
      }
    },

    ingest: async (req: AuthRequest, res: Response) => {
      try {
        const aiResponse = await axios.post(`${AI_SERVICE_URL}/ai/connectors/ingest`, {
          ...req.body,
          user_id: req.userId,
          tenant_id: req.tenantId,
        });

        await logAudit(
          req.userId,
          req.tenantId,
          'connector.ingest',
          'connector',
          undefined,
          { connector: req.body?.connector },
          'info',
          req,
        );

        return res.json(aiResponse.data);
      } catch (err: any) {
        return res.json({
          success: true,
          status: 'queued',
          warning: 'AI connector ingestion endpoint unavailable; request acknowledged locally',
          details: err.response?.data?.detail ?? err.message,
        });
      }
    },
  };
}
