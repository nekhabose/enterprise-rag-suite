import type { Request, Response } from 'express';

export const authController = {
  login: (_req: Request, res: Response) => res.status(501).json({ error: 'Use legacy /auth/login in server.ts during migration' }),
};
