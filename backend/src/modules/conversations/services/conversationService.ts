import type { AuthRequest } from '../../../middleware/types';
import type { Response } from 'express';
import type { LegacyRouteDeps } from '../../app/routes/types';
import { createConversationRepository } from '../repositories/conversationRepository';

export function createConversationService(deps: LegacyRouteDeps) {
  const { AI_SERVICE_URL, axios, logAudit } = deps;
  const repo = createConversationRepository(deps.pool);

  return {
    list: async (req: AuthRequest, res: Response) => {
      const { userId, tenantId } = req;

      try {
        const result = await repo.query(
          'SELECT id, title, created_at FROM conversations WHERE user_id = $1 AND tenant_id = $2 ORDER BY created_at DESC',
          [userId, tenantId],
        );
        return res.json(result.rows);
      } catch {
        return res.status(500).json({ error: 'Failed to fetch conversations' });
      }
    },

    create: async (req: AuthRequest, res: Response) => {
      const { title } = req.body;
      const { userId, tenantId } = req;

      try {
        const result = await repo.query(
          'INSERT INTO conversations (user_id, tenant_id, title) VALUES ($1,$2,$3) RETURNING *',
          [userId, tenantId, title ?? 'New Conversation'],
        );
        return res.json(result.rows[0]);
      } catch {
        return res.status(500).json({ error: 'Failed to create conversation' });
      }
    },

    messages: async (req: AuthRequest, res: Response) => {
      const convId = parseInt(req.params.id);
      const { userId, tenantId } = req;

      try {
        const conv = await repo.query(
          'SELECT id FROM conversations WHERE id = $1 AND user_id = $2 AND tenant_id = $3',
          [convId, userId, tenantId],
        );

        if (!conv.rows.length) {
          return res.status(404).json({ error: 'Conversation not found' });
        }

        const messages = await repo.query(
          'SELECT id, role, content, sources, created_at FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
          [convId],
        );

        return res.json(messages.rows);
      } catch {
        return res.status(500).json({ error: 'Failed to fetch messages' });
      }
    },

    remove: async (req: AuthRequest, res: Response) => {
      const convId = parseInt(req.params.id);
      const { userId, tenantId } = req;

      try {
        const result = await repo.query(
          'DELETE FROM conversations WHERE id = $1 AND user_id = $2 AND tenant_id = $3 RETURNING id',
          [convId, userId, tenantId],
        );

        if (!result.rows.length) {
          return res.status(404).json({ error: 'Conversation not found' });
        }

        return res.json({ success: true });
      } catch {
        return res.status(500).json({ error: 'Failed to delete conversation' });
      }
    },

    send: async (req: AuthRequest, res: Response) => {
      const { conversation_id, course_id, question, document_ids, provider, model, retrieval_strategy, enable_reranking, top_k } = req.body;
      const { userId, tenantId, userRole } = req;

      if (!question) {
        return res.status(400).json({ error: 'Question required' });
      }

      try {
        let convId = conversation_id;

        if (!convId) {
          const created = await repo.query(
            'INSERT INTO conversations (user_id, tenant_id, title) VALUES ($1,$2,$3) RETURNING id',
            [userId, tenantId, `Chat ${new Date().toLocaleString()}`],
          );
          convId = created.rows[0].id;
        } else {
          const conv = await repo.query(
            'SELECT id FROM conversations WHERE id = $1 AND user_id = $2 AND tenant_id = $3',
            [convId, userId, tenantId],
          );

          if (!conv.rows.length) {
            return res.status(404).json({ error: 'Conversation not found' });
          }
        }

        await repo.query('INSERT INTO messages (conversation_id, role, content) VALUES ($1,$2,$3)', [convId, 'user', question]);

        const aiHeaders = req.headers.authorization
          ? { Authorization: req.headers.authorization as string }
          : undefined;
        const parsedCourseId = course_id !== undefined && course_id !== null ? Number(course_id) : null;
        if (userRole === 'STUDENT') {
          if (!Number.isFinite(parsedCourseId)) {
            return res.status(400).json({ error: 'course_id is required for student chat' });
          }
          const enrolled = await repo.query(
            `SELECT 1
             FROM course_enrollments ce
             JOIN courses c ON c.id = ce.course_id
             WHERE ce.course_id = $1 AND ce.user_id = $2 AND c.tenant_id = $3
             LIMIT 1`,
            [parsedCourseId, userId, tenantId],
          );
          if (!enrolled.rows.length) return res.status(403).json({ error: 'Student is not enrolled in this course' });
        }
        if (userRole === 'FACULTY' && Number.isFinite(parsedCourseId)) {
          const assigned = await repo.query(
            `SELECT 1
             FROM courses c
             WHERE c.id = $1 AND c.tenant_id = $2
               AND (
                 c.faculty_id = $3
                 OR EXISTS (SELECT 1 FROM course_instructors ci WHERE ci.course_id = c.id AND ci.user_id = $3)
               )
             LIMIT 1`,
            [parsedCourseId, tenantId, userId],
          );
          if (!assigned.rows.length) return res.status(403).json({ error: 'Faculty is not assigned to this course' });
        }
        let aiResponse: any;
        try {
          aiResponse = await axios.post(
            `${AI_SERVICE_URL}/api/chat`,
            {
              message: question,
              conversation_id: convId,
              tenant_id: tenantId,
              course_id: Number.isFinite(parsedCourseId) ? parsedCourseId : null,
            },
            { timeout: 60000, headers: aiHeaders },
          );
        } catch {
          try {
            aiResponse = await axios.post(
              `${AI_SERVICE_URL}/ai/rag-answer`,
              {
                user_id: userId,
                question,
                document_ids: document_ids ?? null,
                provider: provider ?? 'groq',
                model: model ?? null,
                retrieval_strategy: retrieval_strategy ?? 'hybrid',
                enable_reranking: Boolean(enable_reranking),
                top_k: Number(top_k) ?? 5,
              },
              { timeout: 60000 },
            );
          } catch {
            aiResponse = {
              data: {
                response: 'I am currently unable to reach the AI service. Please try again in a moment.',
                sources: [],
              },
            };
          }
        }

        const aiData = aiResponse.data as { answer?: string; response?: string; sources?: unknown[] };
        const answer = aiData.answer ?? aiData.response ?? 'No response';
        const sources = aiData.sources ?? [];

        const msg = await repo.query(
          'INSERT INTO messages (conversation_id, role, content, sources) VALUES ($1,$2,$3,$4) RETURNING *',
          [convId, 'assistant', answer, JSON.stringify(sources)],
        );

        await logAudit(userId, tenantId, 'chat.message', 'conversation', convId, { provider }, 'info', req);

        return res.json({
          conversation_id: convId,
          message: msg.rows[0],
          answer,
          sources,
          ...(aiResponse.data as object),
        });
      } catch (err: any) {
        return res.status(500).json({ error: 'Chat failed', details: err.response?.data?.detail });
      }
    },

    answer: async (req: AuthRequest, res: Response) => {
      const { question, course_id, document_ids, provider, model, retrieval_strategy, enable_reranking, top_k } = req.body;
      const { userId, tenantId, userRole } = req;

      if (!question) {
        return res.status(400).json({ error: 'Question required' });
      }

      try {
        const aiHeaders = req.headers.authorization
          ? { Authorization: req.headers.authorization as string }
          : undefined;
        const parsedCourseId = course_id !== undefined && course_id !== null ? Number(course_id) : null;
        if (userRole === 'STUDENT') {
          if (!Number.isFinite(parsedCourseId)) {
            return res.status(400).json({ error: 'course_id is required for student chat' });
          }
          const enrolled = await repo.query(
            `SELECT 1
             FROM course_enrollments ce
             JOIN courses c ON c.id = ce.course_id
             WHERE ce.course_id = $1 AND ce.user_id = $2 AND c.tenant_id = $3
             LIMIT 1`,
            [parsedCourseId, userId, tenantId],
          );
          if (!enrolled.rows.length) return res.status(403).json({ error: 'Student is not enrolled in this course' });
        }
        if (userRole === 'FACULTY' && Number.isFinite(parsedCourseId)) {
          const assigned = await repo.query(
            `SELECT 1
             FROM courses c
             WHERE c.id = $1 AND c.tenant_id = $2
               AND (
                 c.faculty_id = $3
                 OR EXISTS (SELECT 1 FROM course_instructors ci WHERE ci.course_id = c.id AND ci.user_id = $3)
               )
             LIMIT 1`,
            [parsedCourseId, tenantId, userId],
          );
          if (!assigned.rows.length) return res.status(403).json({ error: 'Faculty is not assigned to this course' });
        }
        try {
          const aiResponse = await axios.post(
            `${AI_SERVICE_URL}/api/chat`,
            {
              message: question,
              conversation_id: null,
              tenant_id: tenantId,
              course_id: Number.isFinite(parsedCourseId) ? parsedCourseId : null,
            },
            { timeout: 60000, headers: aiHeaders },
          );
          return res.json(aiResponse.data);
        } catch {
          try {
            const aiResponse = await axios.post(
              `${AI_SERVICE_URL}/ai/rag-answer`,
              {
                user_id: userId,
                question,
                document_ids: document_ids ?? null,
                provider: provider ?? 'groq',
                model: model ?? null,
                retrieval_strategy: retrieval_strategy ?? 'hybrid',
                enable_reranking: Boolean(enable_reranking),
                top_k: Number(top_k) ?? 5,
              },
              { timeout: 60000 },
            );

            return res.json(aiResponse.data);
          } catch {
            return res.json({
              response: 'I am currently unable to reach the AI service. Please try again in a moment.',
              sources: [],
            });
          }
        }
      } catch (err: any) {
        return res.status(500).json({ error: 'Chat failed', details: err.response?.data?.detail });
      }
    },
  };
}
