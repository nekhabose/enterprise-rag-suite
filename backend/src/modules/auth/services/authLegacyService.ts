import type { AuthRequest } from '../../../middleware/types';
import type { Response } from 'express';
import type { LegacyRouteDeps } from '../../app/routes/types';
import { createAuthRepository } from '../repositories/authRepository';

export function createAuthLegacyService(deps: LegacyRouteDeps) {
  const {
    pool, parseCookies, normalizeUserRow, isGlobalRole,
    JWT_SECRET, JWT_EXPIRY, REFRESH_EXPIRY, REFRESH_COOKIE_NAME, env,
    bcrypt, jwt, logAudit,
  } = deps;
  const repo = createAuthRepository(pool);

  return {
    async login(req: AuthRequest, res: Response) {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
      }

      try {
        const result = await repo.query(
          `SELECT u.id, u.email, u.password_hash, u.tenant_id, u.role,
                  u.is_active, u.is_internal, u.first_name, u.last_name,
                  t.name as tenant_name, t.is_active as tenant_active
           FROM users u
           LEFT JOIN tenants t ON u.tenant_id = t.id
           WHERE u.email = $1`,
          [email.trim().toLowerCase()],
        );

        if (!result.rows.length) {
          await new Promise((r) => setTimeout(r, 200));
          return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = result.rows[0];

        if (!user.is_active) {
          return res.status(403).json({ error: 'Account is disabled' });
        }

        if (!isGlobalRole(user.role) && !user.tenant_active) {
          return res.status(403).json({ error: 'Your institution is not currently active' });
        }

        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) {
          logAudit(user.id, user.tenant_id, 'auth.login.failed', 'auth');
          return res.status(401).json({ error: 'Invalid credentials' });
        }

        await repo.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

        const tokenPayload = {
          userId: user.id,
          tenantId: user.tenant_id,
          role: user.role,
          isInternal: user.is_internal,
          type: 'access',
        };

        const accessToken = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
        const refreshToken = jwt.sign({ ...tokenPayload, type: 'refresh' }, JWT_SECRET, { expiresIn: REFRESH_EXPIRY });

        logAudit(user.id, user.tenant_id, 'auth.login.success', 'auth', undefined, {}, 'info');

        res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
          httpOnly: true,
          secure: env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        return res.json({
          accessToken,
          token: accessToken,
          refreshToken,
          user: normalizeUserRow(user),
        });
      } catch (err) {
        console.error('[AUTH] Login error:', err);
        return res.status(500).json({ error: 'Server error' });
      }
    },

    async refresh(req: AuthRequest, res: Response) {
      const cookieToken = parseCookies(req.headers.cookie)[REFRESH_COOKIE_NAME];
      const refreshToken = req.body?.refreshToken || cookieToken;
      if (!refreshToken) return res.status(400).json({ error: 'Refresh token required' });

      try {
        const decoded = jwt.verify(refreshToken, JWT_SECRET) as {
          userId: number;
          type?: string;
        };
        if (decoded.type !== 'refresh') return res.status(401).json({ error: 'Invalid token type' });

        const userResult = await repo.query(
          'SELECT id, tenant_id, role, is_active, is_internal FROM users WHERE id = $1',
          [decoded.userId],
        );
        if (!userResult.rows.length || !userResult.rows[0].is_active) {
          return res.status(401).json({ error: 'User not found or disabled' });
        }

        const user = userResult.rows[0];
        const accessToken = jwt.sign(
          { userId: user.id, tenantId: user.tenant_id, role: user.role, isInternal: user.is_internal, type: 'access' },
          JWT_SECRET,
          { expiresIn: JWT_EXPIRY },
        );

        return res.json({ accessToken, token: accessToken });
      } catch {
        return res.status(401).json({ error: 'Invalid or expired refresh token' });
      }
    },

    async logout(_req: AuthRequest, res: Response) {
      res.clearCookie(REFRESH_COOKIE_NAME, {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
      });
      return res.json({ success: true });
    },

    async me(req: AuthRequest, res: Response) {
      try {
        const result = await repo.query(
          `SELECT u.id, u.email, u.role, u.tenant_id, u.is_internal, u.first_name, u.last_name,
                  t.name as tenant_name
           FROM users u
           LEFT JOIN tenants t ON u.tenant_id = t.id
           WHERE u.id = $1`,
          [req.userId],
        );
        if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
        return res.json({ user: normalizeUserRow(result.rows[0]) });
      } catch (err) {
        console.error('[AUTH] Me error:', err);
        return res.status(500).json({ error: 'Server error' });
      }
    },

    async signup(req: AuthRequest, res: Response) {
      const { email, password, invitationToken } = req.body;
      if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) return res.status(400).json({ error: 'Invalid email format' });
      if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

      try {
        let tenantId: number;
        let role = 'STUDENT';

        if (invitationToken) {
          const inv = await repo.query(
            `SELECT i.*, t.id as tenant_id, t.is_active as tenant_active
             FROM invitations i
             JOIN tenants t ON i.tenant_id = t.id
             WHERE i.token = $1 AND i.status = 'pending' AND i.expires_at > NOW()`,
            [invitationToken],
          );
          if (!inv.rows.length) return res.status(400).json({ error: 'Invalid or expired invitation' });
          tenantId = inv.rows[0].tenant_id;
          role = inv.rows[0].role;
          await repo.query("UPDATE invitations SET status = 'accepted' WHERE id = $1", [inv.rows[0].id]);
        } else {
          const tResult = await repo.query('SELECT id FROM tenants WHERE domain = $1', ['state-university.edu']);
          if (!tResult.rows.length) return res.status(400).json({ error: 'No tenant available. Use an invitation link.' });
          tenantId = tResult.rows[0].id;
        }

        const passwordHash = await bcrypt.hash(password, 12);
        const result = await repo.query(
          `INSERT INTO users (email, password_hash, role, tenant_id)
           VALUES ($1,$2,$3,$4) RETURNING id, email, role, tenant_id`,
          [email.trim().toLowerCase(), passwordHash, role, tenantId],
        );

        const user = result.rows[0];
        const token = jwt.sign(
          { userId: user.id, tenantId: user.tenant_id, role: user.role, type: 'access' },
          JWT_SECRET,
          { expiresIn: JWT_EXPIRY },
        );

        logAudit(user.id, tenantId, 'auth.signup', 'auth');
        return res.json({ token, user: { id: user.id, email: user.email, role: user.role, tenant_id: user.tenant_id } });
      } catch (err: any) {
        if (err.code === '23505') return res.status(400).json({ error: 'Email already exists' });
        console.error('[AUTH] Signup error:', err);
        return res.status(500).json({ error: 'Server error' });
      }
    },

    async changePassword(req: AuthRequest, res: Response) {
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Both passwords required' });
      if (newPassword.length < 8) return res.status(400).json({ error: 'New password too short' });

      try {
        const result = await repo.query('SELECT password_hash FROM users WHERE id = $1', [req.userId]);
        if (!result.rows.length) return res.status(404).json({ error: 'User not found' });

        const valid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
        if (!valid) return res.status(401).json({ error: 'Current password incorrect' });

        const newHash = await bcrypt.hash(newPassword, 12);
        await repo.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [newHash, req.userId]);

        logAudit(req.userId, req.tenantId, 'auth.password_change', 'user', req.userId, {}, 'info', req);
        return res.json({ success: true });
      } catch (err) {
        console.error('[AUTH] Change password error:', err);
        return res.status(500).json({ error: 'Server error' });
      }
    },
  };
}
