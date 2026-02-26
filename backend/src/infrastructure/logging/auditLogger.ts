import type { Pool } from 'pg';
import type { Request } from 'express';

export interface AuditLogEvent {
  tenantId?: number;
  userId?: number;
  action: string;
  resourceType: string;
  resourceId?: number | string;
  details?: Record<string, unknown>;
  severity?: 'info' | 'warn' | 'error';
  req?: Request;
}

export const createAuditLogger = (pool: Pool) => {
  return async (event: AuditLogEvent): Promise<void> => {
    try {
      const role = event.userId
        ? (await pool.query('SELECT role FROM users WHERE id = $1', [event.userId])).rows[0]?.role
        : undefined;

      await pool.query(
        `INSERT INTO audit_logs (tenant_id, user_id, role, action, resource_type, resource_id, details, ip_address, user_agent, severity)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          event.tenantId ?? null,
          event.userId ?? null,
          role ?? null,
          event.action,
          event.resourceType,
          typeof event.resourceId === 'number' ? event.resourceId : null,
          JSON.stringify(event.details ?? {}),
          event.req?.ip ?? null,
          event.req?.headers['user-agent'] ?? null,
          event.severity ?? 'info',
        ],
      );
    } catch (err) {
      console.error('[AUDIT] Failed to write audit log:', err);
    }
  };
};
