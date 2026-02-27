import type { Response } from 'express';
import type { AuthRequest } from '../../../middleware/types';
import type { LegacyRouteDeps } from '../../app/routes/types';
import { createConversationService } from '../services/conversationService';

export function createConversationController(deps: LegacyRouteDeps) {
  const service = createConversationService(deps);

  return {
    list: (req: AuthRequest, res: Response) => service.list(req, res),
    create: (req: AuthRequest, res: Response) => service.create(req, res),
    rename: (req: AuthRequest, res: Response) => service.rename(req, res),
    messages: (req: AuthRequest, res: Response) => service.messages(req, res),
    remove: (req: AuthRequest, res: Response) => service.remove(req, res),
    send: (req: AuthRequest, res: Response) => service.send(req, res),
    answer: (req: AuthRequest, res: Response) => service.answer(req, res),
  };
}
