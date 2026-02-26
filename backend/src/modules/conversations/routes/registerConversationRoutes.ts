import type { LegacyRouteDeps } from '../../app/routes/types';
import { createConversationController } from '../controllers/conversationController';

export function registerConversationRoutes(deps: LegacyRouteDeps) {
  const { app, authMiddleware, requirePermission } = deps;
  const controller = createConversationController(deps);

  app.get('/conversations', authMiddleware, requirePermission('CHAT_USE'), controller.list);
  app.post('/conversations', authMiddleware, requirePermission('CHAT_USE'), controller.create);
  app.get('/conversations/:id/messages', authMiddleware, requirePermission('CHAT_USE'), controller.messages);
  app.delete('/conversations/:id', authMiddleware, requirePermission('CHAT_USE'), controller.remove);
  app.post('/chat/send', authMiddleware, requirePermission('CHAT_USE'), controller.send);
  app.post('/chat/answer', authMiddleware, requirePermission('CHAT_USE'), controller.answer);
}
