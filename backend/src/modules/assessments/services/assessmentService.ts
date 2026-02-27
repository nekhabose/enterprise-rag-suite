import type { AuthRequest } from '../../../middleware/types';
import type { Response } from 'express';
import type { LegacyRouteDeps } from '../../app/routes/types';
import { createAssessmentRepository } from '../repositories/assessmentRepository';

export function createAssessmentService(deps: LegacyRouteDeps) {
  const { ROLES, AI_SERVICE_URL, axios } = deps;
  const repo = createAssessmentRepository(deps.pool);

  const normalizeQuestionType = (value?: string): string => {
    if (!value) return 'multiple_choice';
    if (value === 'mcq') return 'multiple_choice';
    if (value === 'short_answer') return 'short_answer';
    if (value === 'true_false') return 'true_false';
    return value;
  };

  return {
    list: async (req: AuthRequest, res: Response) => {
      const { userId, tenantId, userRole } = req;

      try {
        const isAdmin = [ROLES.TENANT_ADMIN, ROLES.FACULTY, ROLES.SUPER_ADMIN].includes(userRole as any);
        const result = await repo.query(
          `SELECT id, title, difficulty, created_at
           FROM assessments
           WHERE tenant_id = $1 ${isAdmin ? '' : 'AND user_id = $2'}
           ORDER BY created_at DESC`,
          isAdmin ? [tenantId] : [tenantId, userId],
        );

        return res.json(result.rows);
      } catch {
        return res.status(500).json({ error: 'Failed to fetch assessments' });
      }
    },

    create: async (req: AuthRequest, res: Response) => {
      const { title, topic, document_ids, video_ids, question_count, numQuestions, difficulty, question_types, questionType, provider, model } = req.body;
      const tenantId = req.tenantId;
      const userId = req.userId;

      if (!tenantId || !userId) {
        return res.status(403).json({ error: 'Tenant and user context required' });
      }

      const normalizedQuestionCount = Number(question_count ?? numQuestions ?? 10) || 10;
      const normalizedQuestionTypes = Array.isArray(question_types) && question_types.length > 0
        ? question_types.map((q) => normalizeQuestionType(String(q)))
        : [normalizeQuestionType(String(questionType ?? 'multiple_choice'))];
      const normalizedDifficulty = String(difficulty ?? 'medium');
      const normalizedTitle = String(title ?? topic ?? 'Generated Assessment').trim() || 'Generated Assessment';
      const normalizedTopic = String(topic ?? title ?? 'General Topic');

      try {
        const aiHeaders = req.headers.authorization
          ? { Authorization: req.headers.authorization as string }
          : undefined;

        // Prefer current AI service contract; fallback to legacy path for compatibility.
        let aiPayload: any = null;
        try {
          const aiResponse = await axios.post(
            `${AI_SERVICE_URL}/api/quiz/generate`,
            {
              tenant_id: tenantId,
              topic: normalizedTopic,
              num_questions: normalizedQuestionCount,
              question_type: normalizedQuestionTypes[0] === 'multiple_choice' ? 'mcq' : normalizedQuestionTypes[0],
              difficulty: normalizedDifficulty,
            },
            { timeout: 180000, headers: aiHeaders },
          );
          aiPayload = aiResponse.data;
        } catch (primaryErr: any) {
          try {
            const fallback = await axios.post(
              `${AI_SERVICE_URL}/ai/create-assessment`,
              {
                title: normalizedTitle,
                document_ids: document_ids ?? null,
                video_ids: video_ids ?? null,
                question_count: normalizedQuestionCount,
                difficulty: normalizedDifficulty,
                question_types: normalizedQuestionTypes,
                provider: provider ?? 'groq',
                model: model ?? null,
              },
              { timeout: 180000, headers: aiHeaders },
            );
            aiPayload = fallback.data;
            if (!aiPayload?.questions && Array.isArray(aiPayload?.generated_questions)) {
              aiPayload.questions = aiPayload.generated_questions;
            }
          } catch (fallbackErr: any) {
            const fallbackType = normalizedQuestionTypes[0] === 'multiple_choice' ? 'mcq' : normalizedQuestionTypes[0];
            const localQuestions = Array.from({ length: normalizedQuestionCount }).map((_, i) => ({
              question: `Question ${i + 1}: ${normalizedTopic}`,
              type: fallbackType,
              options: fallbackType === 'mcq'
                ? ['Option A', 'Option B', 'Option C', 'Option D']
                : null,
              correct_answer: fallbackType === 'mcq' ? 'Option A' : 'Sample answer',
            }));
            aiPayload = {
              source: 'local-fallback',
              warning: 'AI generation unavailable. Created assessment with template questions.',
              questions: localQuestions,
              primary_error: primaryErr?.response?.data ?? primaryErr?.message,
              fallback_error: fallbackErr?.response?.data ?? fallbackErr?.message,
            };
          }
        }

        const createdAssessment = await repo.query(
          `INSERT INTO assessments (user_id, tenant_id, title, assessment_type, difficulty)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, user_id, tenant_id, title, assessment_type, difficulty, created_at`,
          [userId, tenantId, normalizedTitle, 'quiz', normalizedDifficulty],
        );
        const assessment = createdAssessment.rows[0];

        const generatedQuestions = Array.isArray(aiPayload?.questions) ? aiPayload.questions : [];
        for (const q of generatedQuestions) {
          const questionText = String(q?.question_text ?? q?.question ?? '').trim();
          if (!questionText) continue;
          const rawType = String(q?.question_type ?? q?.type ?? normalizedQuestionTypes[0]);
          const mappedType = rawType === 'mcq' ? 'multiple_choice' : rawType;
          const options = Array.isArray(q?.options) ? q.options : null;
          const correctAnswer = q?.correct_answer ?? null;

          await repo.query(
            `INSERT INTO questions (assessment_id, question_text, question_type, correct_answer, options, points)
             VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
            [assessment.id, questionText, mappedType, correctAnswer, options ? JSON.stringify(options) : null, 1],
          );
        }

        const savedQuestions = await repo.query(
          'SELECT id, question_text, question_type, correct_answer, options, points FROM questions WHERE assessment_id = $1 ORDER BY id',
          [assessment.id],
        );

        return res.status(201).json({
          assessment,
          questions: savedQuestions.rows,
          source: aiPayload?.assessment_id ? 'ai-service' : 'local-generated',
        });
      } catch (err: any) {
        return res.status(err.response?.status ?? 500).json({
          error: 'Failed to create assessment',
          details: err.response?.data?.detail ?? err.response?.data ?? err.message,
        });
      }
    },

    getById: async (req: AuthRequest, res: Response) => {
      const assessmentId = parseInt(req.params.id);
      const { userId, tenantId, userRole } = req;

      try {
        let assessment;
        const isAdmin = [ROLES.TENANT_ADMIN, ROLES.FACULTY, ROLES.SUPER_ADMIN].includes(userRole as any);

        if (isAdmin) {
          assessment = await repo.query(
            `SELECT * FROM assessments WHERE id = $1 AND tenant_id = $2`,
            [assessmentId, tenantId],
          );
        } else if (userRole === ROLES.STUDENT) {
          assessment = await repo.query(
            `SELECT DISTINCT a.*
             FROM assessments a
             JOIN assessment_settings s ON s.assessment_id = a.id
             JOIN course_module_items cmi ON cmi.quiz_id = a.id
             JOIN course_modules cm ON cm.id = cmi.module_id AND cm.course_id = s.course_id
             JOIN course_enrollments ce ON ce.course_id = s.course_id
             WHERE a.id = $1
               AND a.tenant_id = $2
               AND ce.user_id = $3
               AND s.is_published = true
               AND cm.is_published = true
               AND cmi.is_published = true`,
            [assessmentId, tenantId, userId],
          );
        } else {
          assessment = await repo.query(
            `SELECT * FROM assessments WHERE id = $1 AND tenant_id = $2 AND user_id = $3`,
            [assessmentId, tenantId, userId],
          );
        }

        if (!assessment.rows.length) {
          return res.status(404).json({ error: 'Assessment not found' });
        }

        const questions = await repo.query('SELECT * FROM questions WHERE assessment_id = $1 ORDER BY id', [assessmentId]);
        return res.json({ ...assessment.rows[0], questions: questions.rows });
      } catch {
        return res.status(500).json({ error: 'Failed to fetch assessment' });
      }
    },

    submit: async (req: AuthRequest, res: Response) => {
      const assessmentId = parseInt(req.params.id);
      const { answers } = req.body;
      const { tenantId, userId, userRole } = req;

      try {
        let assessment;
        const isAdmin = [ROLES.TENANT_ADMIN, ROLES.FACULTY, ROLES.SUPER_ADMIN].includes(userRole as any);
        if (isAdmin) {
          assessment = await repo.query(
            `SELECT id FROM assessments WHERE id = $1 AND tenant_id = $2`,
            [assessmentId, tenantId],
          );
        } else if (userRole === ROLES.STUDENT) {
          assessment = await repo.query(
            `SELECT DISTINCT a.id
             FROM assessments a
             JOIN assessment_settings s ON s.assessment_id = a.id
             JOIN course_module_items cmi ON cmi.quiz_id = a.id
             JOIN course_modules cm ON cm.id = cmi.module_id AND cm.course_id = s.course_id
             JOIN course_enrollments ce ON ce.course_id = s.course_id
             WHERE a.id = $1
               AND a.tenant_id = $2
               AND ce.user_id = $3
               AND s.is_published = true
               AND cm.is_published = true
               AND cmi.is_published = true`,
            [assessmentId, tenantId, userId],
          );
        } else {
          assessment = await repo.query(
            `SELECT id FROM assessments WHERE id = $1 AND tenant_id = $2 AND user_id = $3`,
            [assessmentId, tenantId, userId],
          );
        }
        if (!assessment.rows.length) return res.status(404).json({ error: 'Assessment not found' });

        const qResult = await repo.query(
          'SELECT id, question_type, correct_answer FROM questions WHERE assessment_id = $1 ORDER BY id',
          [assessmentId],
        );
        const questions = qResult.rows;

        let correct = 0;
        for (const q of questions) {
          const submitted = answers?.[q.id] ?? answers?.[String(q.id)] ?? null;
          const submittedText = submitted == null ? null : String(submitted);
          const correctText = q.correct_answer == null ? null : String(q.correct_answer);

          const isCorrect = submittedText != null && correctText != null
            ? submittedText.trim().toLowerCase() === correctText.trim().toLowerCase()
            : false;
          if (isCorrect) correct += 1;

          await repo.query(
            `INSERT INTO responses (question_id, user_id, answer_text, ai_score, ai_feedback, submitted_at)
             VALUES ($1, $2, $3, $4, $5, NOW())`,
            [
              q.id,
              userId,
              submittedText,
              isCorrect ? 100 : 0,
              isCorrect ? 'Correct' : 'Incorrect',
            ],
          );
        }

        const total = questions.length;
        const score = total > 0 ? Math.round((correct / total) * 100) : 0;
        return res.json({
          assessment_id: assessmentId,
          total_questions: total,
          correct_answers: correct,
          score,
          feedback: score >= 70 ? 'Good job!' : 'Keep practicing and review the material.',
        });
      } catch (err: any) {
        return res.status(500).json({ error: 'Failed to submit assessment', details: err?.message ?? err?.response?.data?.detail });
      }
    },

    remove: async (req: AuthRequest, res: Response) => {
      const assessmentId = parseInt(req.params.id);
      const { tenantId, userId } = req;

      try {
        const result = await repo.query(
          'DELETE FROM assessments WHERE id = $1 AND tenant_id = $2 AND user_id = $3 RETURNING id',
          [assessmentId, tenantId, userId],
        );

        if (!result.rows.length) {
          return res.status(404).json({ error: 'Assessment not found' });
        }

        return res.json({ success: true });
      } catch {
        return res.status(500).json({ error: 'Failed to delete assessment' });
      }
    },
  };
}
