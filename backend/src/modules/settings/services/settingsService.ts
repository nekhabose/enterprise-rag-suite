import type { AuthRequest } from '../../../middleware/types';
import type { Response } from 'express';
import type { LegacyRouteDeps } from '../../app/routes/types';
import { createSettingsRepository } from '../repositories/settingsRepository';

export function createSettingsService(deps: LegacyRouteDeps) {
  const repo = createSettingsRepository(deps.pool);

  return {
    getSettings: async (req: AuthRequest, res: Response) => {
      try {
        const result = await repo.query('SELECT settings, updated_at FROM user_settings WHERE user_id = $1', [req.userId]);
        return res.json(result.rows[0] ?? { settings: {}, updated_at: null });
      } catch {
        return res.status(500).json({ error: 'Failed to get settings' });
      }
    },

    saveSettings: async (req: AuthRequest, res: Response) => {
      const settings = req.body?.settings ?? req.body ?? {};

      try {
        const result = await repo.query(
          `INSERT INTO user_settings (user_id, settings)
           VALUES ($1,$2::jsonb)
           ON CONFLICT (user_id) DO UPDATE SET settings = EXCLUDED.settings, updated_at = NOW()
           RETURNING settings, updated_at`,
          [req.userId, JSON.stringify(settings)],
        );
        return res.json(result.rows[0]);
      } catch {
        return res.status(500).json({ error: 'Failed to save settings' });
      }
    },

    profile: async (req: AuthRequest, res: Response) => {
      try {
        const result = await repo.query(
          `SELECT u.id, u.email, u.role, u.first_name, u.last_name, u.is_active,
                  u.is_internal, u.employee_type, u.last_login_at, u.created_at,
                  t.name as tenant_name, t.domain as tenant_domain, t.plan as tenant_plan
           FROM users u
           LEFT JOIN tenants t ON u.tenant_id = t.id
           WHERE u.id = $1`,
          [req.userId],
        );

        if (!result.rows.length) {
          return res.status(404).json({ error: 'User not found' });
        }

        return res.json(result.rows[0]);
      } catch {
        return res.status(500).json({ error: 'Failed to get profile' });
      }
    },
  };
}
