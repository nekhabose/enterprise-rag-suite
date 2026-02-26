import type { Request, Response } from 'express';

export const tenantController = {
  list: (_req: Request, res: Response) => res.status(501).json({ error: 'Use legacy tenant endpoints in server.ts during migration' }),
};
