import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import axios from 'axios';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config();

const AI_SERVICE_HOST = process.env.AI_SERVICE_HOST?.trim() || 'localhost';
const AI_SERVICE_PORT = process.env.AI_SERVICE_PORT?.trim() || '8000';
const AI_SERVICE_URL = process.env.AI_SERVICE_URL?.trim() || `http://${AI_SERVICE_HOST}:${AI_SERVICE_PORT}`;
const UPLOADS_DIR = path.resolve('uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Multer configuration for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// Middleware
app.use(cors());
app.use(express.json());

// Custom Request type with userId
interface AuthRequest extends Request {
    userId?: number;
}

interface VideoIngestResponse {
    title: string;
    duration: number | string | null;
    chunks_created: number;
}

interface GenerateQuizResponse {
    quiz: {
        total_questions: number;
    };
}

interface CreateAssessmentResponse {
    assessment_id: number | string;
}

interface SubmitAssessmentResponse {
    percentage: number;
}

// Auth Middleware
const authMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
        return res.status(401).json({ error: 'No token provided' });
    }
    
    const token = authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'Invalid token format' });
    }
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: number };
        req.userId = decoded.userId;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid or expired token' });
    }
};

// ============ HEALTH CHECK ============
app.get('/', (req: Request, res: Response) => {
    res.json({ 
        status: 'Backend running!',
        timestamp: new Date().toISOString()
    });
});

// ============ AUTH ENDPOINTS ============

// Signup
app.post('/auth/signup', async (req: Request, res: Response) => {
    const { email, password } = req.body;
    
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
    }
    
    try {
        // Hash password
        const passwordHash = await bcrypt.hash(password, 10);
        
        // Insert user
        const result = await pool.query(
            'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
            [email, passwordHash]
        );
        
        const user = result.rows[0];
        
        // Generate JWT token
        const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, { expiresIn: '7d' });
        
        res.json({ 
            token,
            user: {
                id: user.id,
                email: user.email
            }
        });
    } catch (error: any) {
        if (error.code === '23505') { // Unique violation
            res.status(400).json({ error: 'Email already exists' });
        } else {
            console.error('Signup error:', error);
            res.status(500).json({ error: 'Server error' });
        }
    }
});

// Login
app.post('/auth/login', async (req: Request, res: Response) => {
    const { email, password } = req.body;
    
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
    }
    
    try {
        const result = await pool.query(
            'SELECT id, email, password_hash FROM users WHERE email = $1',
            [email]
        );
        
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const user = result.rows[0];
        
        // Verify password
        const valid = await bcrypt.compare(password, user.password_hash);
        
        if (!valid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        // Generate JWT token
        const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, { expiresIn: '7d' });
        
        res.json({ 
            token,
            user: {
                id: user.id,
                email: user.email
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// ============ DOCUMENT ENDPOINTS ============

// Upload document
app.post('/documents/upload', authMiddleware, upload.single('file'), async (req: AuthRequest, res: Response) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const { originalname, path: filePath } = req.file;
    const userId = req.userId!;
    
    try {
        console.log(`Uploading document: ${originalname} for user ${userId}`);
        
        // Save document to database
       const absolutePath = path.resolve(filePath);
const result = await pool.query(
    'INSERT INTO documents (user_id, filename, file_path) VALUES ($1, $2, $3) RETURNING id',
    [userId, originalname, absolutePath]  // ← Use absolute path
);
        
        const documentId = result.rows[0].id;
        
        console.log(`Document saved with ID: ${documentId}, calling AI service to index...`);
        
       
        // Call Python AI service to index the document
try {
    const absolutePath = path.resolve(filePath);
const provider = req.body.provider || 'groq';
const model = req.body.model || null;
const embedding_model = req.body.embedding_model || null;
const aiResponse = await axios.post(
    `${AI_SERVICE_URL}/ai/index-document`,
    {
        document_id: documentId,
        file_path: absolutePath,
        provider: provider,
        model: model,
        embedding_model: embedding_model
    },
                { timeout: 120000 } // 2 minute timeout for large documents
            );
            
            console.log(`AI indexing successful:`, aiResponse.data);
            
            res.json({ 
                success: true, 
                document_id: documentId,
                filename: originalname,
                chunks_created: (aiResponse.data as any).chunks_created
            });
        } catch (aiError: any) {
            console.error('AI indexing error:', aiError.response?.data || aiError.message);
            
            // Delete the document record if indexing failed
            await pool.query('DELETE FROM documents WHERE id = $1', [documentId]);
            
            res.status(500).json({ 
                error: 'Failed to index document', 
                details: aiError.response?.data?.detail || aiError.message 
            });
        }
    } catch (error) {
        console.error('Document upload error:', error);
        res.status(500).json({ error: 'Failed to upload document' });
    }
});

// Get user's documents
app.get('/documents', authMiddleware, async (req: AuthRequest, res: Response) => {
    const userId = req.userId!;
    
    try {
        const result = await pool.query(
            'SELECT id, filename, subject, year, uploaded_at FROM documents WHERE user_id = $1 ORDER BY uploaded_at DESC',
            [userId]
        );
        
        res.json(result.rows);
    } catch (error) {
        console.error('Get documents error:', error);
        res.status(500).json({ error: 'Failed to fetch documents' });
    }
});

// Delete document
app.delete('/documents/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
    const userId = req.userId!;
    const documentId = parseInt(req.params.id as string);
    
    try {
        const result = await pool.query(
            'DELETE FROM documents WHERE id = $1 AND user_id = $2 RETURNING id',
            [documentId, userId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Document not found' });
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Delete document error:', error);
        res.status(500).json({ error: 'Failed to delete document' });
    }
});

// ============ CONVERSATION ENDPOINTS ============

// Create conversation
app.post('/conversations', authMiddleware, async (req: AuthRequest, res: Response) => {
    const userId = req.userId!;
    const { title } = req.body;
    
    try {
        const result = await pool.query(
            'INSERT INTO conversations (user_id, title) VALUES ($1, $2) RETURNING id, title, created_at',
            [userId, title || 'New Conversation']
        );
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Create conversation error:', error);
        res.status(500).json({ error: 'Failed to create conversation' });
    }
});

// Get user's conversations
app.get('/conversations', authMiddleware, async (req: AuthRequest, res: Response) => {
    const userId = req.userId!;
    
    try {
        const result = await pool.query(
            'SELECT id, title, created_at FROM conversations WHERE user_id = $1 ORDER BY created_at DESC',
            [userId]
        );
        
        res.json(result.rows);
    } catch (error) {
        console.error('Get conversations error:', error);
        res.status(500).json({ error: 'Failed to fetch conversations' });
    }
});

// Get messages in a conversation
app.get('/conversations/:id/messages', authMiddleware, async (req: AuthRequest, res: Response) => {
    const userId = req.userId!;
    const conversationId = parseInt(req.params.id as string);
    
    try {
        // Verify conversation belongs to user
        const convResult = await pool.query(
            'SELECT id FROM conversations WHERE id = $1 AND user_id = $2',
            [conversationId, userId]
        );
        
        if (convResult.rows.length === 0) {
            return res.status(404).json({ error: 'Conversation not found' });
        }
        
        // Get messages
        const result = await pool.query(
            'SELECT id, role, content, sources, created_at FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
            [conversationId]
        );
        
        res.json(result.rows);
    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

// ============ CHAT ENDPOINT ============

// Simple chat endpoint (frontend compatibility)
app.post('/chat/answer', authMiddleware, async (req: AuthRequest, res: Response) => {
    const userId = req.userId!;
    const { question, document_ids, provider, model } = req.body;

    if (!question) {
        return res.status(400).json({ error: 'question required' });
    }

    try {
        const aiResponse = await axios.post(
            `${AI_SERVICE_URL}/ai/rag-answer`,
            {
                user_id: userId,
                question,
                document_ids: document_ids || null,
                provider: provider || 'groq',
                model: model || null
            },
            { timeout: 60000 }
        );

        const { answer, sources } = aiResponse.data as any;
        res.json({ answer, sources });
    } catch (error: any) {
        console.error('Chat answer error:', error.response?.data || error.message);
        res.status(500).json({
            error: 'Failed to process chat',
            details: error.response?.data?.detail || error.message
        });
    }
});

// Send message and get AI response
app.post('/chat/send', authMiddleware, async (req: AuthRequest, res: Response) => {
    const userId = req.userId!;
    const { conversation_id, question, document_ids } = req.body;
    
    if (!conversation_id || !question) {
        return res.status(400).json({ error: 'conversation_id and question required' });
    }
    
    try {
        console.log(`User ${userId} asking: ${question}`);
        
        // Verify conversation belongs to user
        const convResult = await pool.query(
            'SELECT id FROM conversations WHERE id = $1 AND user_id = $2',
            [conversation_id, userId]
        );
        
        if (convResult.rows.length === 0) {
            return res.status(404).json({ error: 'Conversation not found' });
        }
        
        // Save user message
        await pool.query(
            'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)',
            [conversation_id, 'user', question]
        );
        
        // Call Python AI service for RAG answer
        const provider = req.body.provider || 'groq';
        const model = req.body.model || null;
const aiResponse = await axios.post(
    `${AI_SERVICE_URL}/ai/rag-answer`,
    {
        user_id: userId,
        question: question,
        document_ids: document_ids || null,
        provider: provider,
        model: model
    },
            { timeout: 60000 } // 1 minute timeout
        );
        
        const { answer, sources } = aiResponse.data as any;
        
        console.log(`AI response received, ${sources?.length || 0} sources used`);
        
        // Save AI message
        const messageResult = await pool.query(
            'INSERT INTO messages (conversation_id, role, content, sources) VALUES ($1, $2, $3, $4) RETURNING id, role, content, sources, created_at',
            [conversation_id, 'assistant', answer, JSON.stringify(sources)]
        );
        
        res.json({
            message: messageResult.rows[0],
            answer: answer,
            sources: sources
        });
    } catch (error: any) {
        console.error('Chat error:', error.response?.data || error.message);
        res.status(500).json({ 
            error: 'Failed to process message',
            details: error.response?.data?.detail || error.message
        });
    }
});

// ============ PHASE 2: YOUTUBE VIDEO ENDPOINTS ============

// Get video info without downloading
app.post('/videos/info', authMiddleware, async (req: AuthRequest, res: Response) => {
    const { youtube_url } = req.body;
    
    if (!youtube_url) {
        return res.status(400).json({ error: 'YouTube URL required' });
    }
    
    try {
        const aiResponse = await axios.post(
            `${AI_SERVICE_URL}/ai/video-info`,
            { youtube_url }
        );
        
        res.json(aiResponse.data);
    } catch (error: any) {
        console.error('Get video info error:', error.response?.data || error.message);
        res.status(500).json({ error: 'Failed to get video info' });
    }
});

// Upload YouTube video
app.post('/videos/upload', authMiddleware, async (req: AuthRequest, res: Response) => {
    const { youtube_url, title, subject, year, provider, model, embedding_model, chunking_strategy } = req.body;
    const userId = req.userId!;
    
    if (!youtube_url) {
        return res.status(400).json({ error: 'YouTube URL required' });
    }
    
    try {
        console.log(`Uploading YouTube video: ${youtube_url} for user ${userId}`);
        
        // Save video to database
        const result = await pool.query(
            'INSERT INTO videos (user_id, youtube_url, title, subject, year) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [userId, youtube_url, title || 'Untitled Video', subject, year]
        );
        
        const videoId = result.rows[0].id;
        
        console.log(`Video saved with ID: ${videoId}, calling AI service to ingest...`);
        
        // Call Python AI service to ingest video
        try {
            const aiResponse = await axios.post<VideoIngestResponse>(
                `${AI_SERVICE_URL}/ai/ingest-youtube`,
                {
                    video_id: videoId,
                    youtube_url: youtube_url,
                    provider: provider || 'groq',
                    model: model || null,
                    embedding_model: embedding_model || null,
                    chunking_strategy: chunking_strategy || 'fixed_size',
                    chunking_params: req.body.chunking_params || {}
                },
                { timeout: 600000 } // 10 minute timeout for video processing
            );
            
            console.log(`AI ingestion successful:`, aiResponse.data);
            
            res.json({ 
                success: true, 
                video_id: videoId,
                title: aiResponse.data.title,
                duration: aiResponse.data.duration,
                chunks_created: aiResponse.data.chunks_created
            });
        } catch (aiError: any) {
            console.error('AI ingestion error:', aiError.response?.data || aiError.message);
            
            // Delete the video record if ingestion failed
            await pool.query('DELETE FROM videos WHERE id = $1', [videoId]);
            
            res.status(500).json({ 
                error: 'Failed to ingest video', 
                details: aiError.response?.data?.detail || aiError.message 
            });
        }
    } catch (error) {
        console.error('Video upload error:', error);
        res.status(500).json({ error: 'Failed to upload video' });
    }
});

// Get user's videos
app.get('/videos', authMiddleware, async (req: AuthRequest, res: Response) => {
    const userId = req.userId!;
    
    try {
        const result = await pool.query(
            'SELECT id, title, youtube_url, NULL::text AS duration, subject, year, created_at AS uploaded_at FROM videos WHERE user_id = $1 ORDER BY created_at DESC',
            [userId]
        );
        
        res.json(result.rows);
    } catch (error) {
        console.error('Get videos error:', error);
        res.status(500).json({ error: 'Failed to fetch videos' });
    }
});

// Delete video
app.delete('/videos/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
    const userId = req.userId!;
    const videoId = parseInt(req.params.id as string);
    
    try {
        const result = await pool.query(
            'DELETE FROM videos WHERE id = $1 AND user_id = $2 RETURNING id',
            [videoId, userId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Video not found' });
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Delete video error:', error);
        res.status(500).json({ error: 'Failed to delete video' });
    }
});

// ============ PHASE 2: METADATA & FILTERING ============

// Update document metadata
app.put('/documents/:id/metadata', authMiddleware, async (req: AuthRequest, res: Response) => {
    const userId = req.userId!;
    const documentId = parseInt(req.params.id as string);
    const { subject, year } = req.body;
    
    try {
        const result = await pool.query(
            'UPDATE documents SET subject = $1, year = $2 WHERE id = $3 AND user_id = $4 RETURNING id',
            [subject, year, documentId, userId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Document not found' });
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Update metadata error:', error);
        res.status(500).json({ error: 'Failed to update metadata' });
    }
});

// Update video metadata
app.put('/videos/:id/metadata', authMiddleware, async (req: AuthRequest, res: Response) => {
    const userId = req.userId!;
    const videoId = parseInt(req.params.id as string);
    const { subject, year } = req.body;
    
    try {
        const result = await pool.query(
            'UPDATE videos SET subject = $1, year = $2 WHERE id = $3 AND user_id = $4 RETURNING id',
            [subject, year, videoId, userId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Video not found' });
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Update metadata error:', error);
        res.status(500).json({ error: 'Failed to update metadata' });
    }
});

// Search by metadata
app.get('/search', authMiddleware, async (req: AuthRequest, res: Response) => {
    const userId = req.userId!;
    const { subject, year, resource_type } = req.query;
    
    try {
        let results: any[] = [];
        
        // Search documents
        if (!resource_type || resource_type === 'document') {
            let query = 'SELECT id, filename as title, \'document\' as type, subject, year, uploaded_at FROM documents WHERE user_id = $1';
            const params: any[] = [userId];
            
            if (subject) {
                params.push(subject);
                query += ` AND subject = $${params.length}`;
            }
            if (year) {
                params.push(parseInt(year as string));
                query += ` AND year = $${params.length}`;
            }
            
            const docResult = await pool.query(query, params);
            results = results.concat(docResult.rows);
        }
        
        // Search videos
        if (!resource_type || resource_type === 'video') {
            let query = 'SELECT id, title, \'video\' as type, subject, year, uploaded_at FROM videos WHERE user_id = $1';
            const params: any[] = [userId];
            
            if (subject) {
                params.push(subject);
                query += ` AND subject = $${params.length}`;
            }
            if (year) {
                params.push(parseInt(year as string));
                query += ` AND year = $${params.length}`;
            }
            
            const vidResult = await pool.query(query, params);
            results = results.concat(vidResult.rows);
        }
        
        // Sort by upload date
        results.sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime());
        
        res.json({
            results,
            total: results.length,
            filters: { subject, year, resource_type }
        });
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: 'Search failed' });
    }
});

// Get all unique subjects (for filter dropdown)
app.get('/subjects', authMiddleware, async (req: AuthRequest, res: Response) => {
    const userId = req.userId!;
    
    try {
        const result = await pool.query(`
            SELECT DISTINCT subject FROM (
                SELECT subject FROM documents WHERE user_id = $1 AND subject IS NOT NULL
                UNION
                SELECT subject FROM videos WHERE user_id = $1 AND subject IS NOT NULL
            ) AS combined
            ORDER BY subject
        `, [userId]);
        
        const subjects = result.rows.map(row => row.subject);
        res.json({ subjects });
    } catch (error) {
        console.error('Get subjects error:', error);
        res.status(500).json({ error: 'Failed to get subjects' });
    }
});

// ============ PHASE 3: QUIZ/ASSESSMENT ENDPOINTS ============

// Generate quiz questions
app.post('/quiz/generate', authMiddleware, async (req: AuthRequest, res: Response) => {
    const {
        document_ids,
        video_ids,
        question_count,
        difficulty,
        question_types,
        provider,
        model
    } = req.body;
    
    try {
        console.log('Generating quiz...');
        
        const aiResponse = await axios.post<GenerateQuizResponse>(
            `${AI_SERVICE_URL}/ai/generate-quiz`,
            {
                document_ids,
                video_ids,
                question_count: question_count || 5,
                difficulty: difficulty || 'medium',
                question_types: question_types || ['multiple_choice'],
                provider: provider || 'groq',
                model: model || null
            },
            { timeout: 120000 }  // 2 minute timeout
        );
        
        console.log(`Quiz generated: ${aiResponse.data.quiz.total_questions} questions`);
        
        res.json(aiResponse.data);
    } catch (error: any) {
        console.error('Quiz generation error:', error.response?.data || error.message);
        res.status(500).json({ 
            error: 'Failed to generate quiz',
            details: error.response?.data?.detail || error.message
        });
    }
});

// Create assessment (save to database)
app.post('/assessments/create', authMiddleware, async (req: AuthRequest, res: Response) => {
    const {
        title,
        document_ids,
        video_ids,
        question_count,
        difficulty,
        question_types,
        provider,
        model
    } = req.body;
    
    try {
        console.log(`Creating assessment: ${title}`);
        
        const aiResponse = await axios.post<CreateAssessmentResponse>(
            `${AI_SERVICE_URL}/ai/create-assessment`,
            {
                title,
                document_ids,
                video_ids,
                question_count: question_count || 10,
                difficulty: difficulty || 'medium',
                question_types: question_types || ['multiple_choice'],
                provider: provider || 'groq',
                model: model || null
            },
            { timeout: 180000 }  // 3 minute timeout
        );
        
        console.log(`Assessment created: ID ${aiResponse.data.assessment_id}`);
        
        res.json(aiResponse.data);
    } catch (error: any) {
        console.error('Assessment creation error:', error.response?.data || error.message);
        res.status(500).json({ 
            error: 'Failed to create assessment',
            details: error.response?.data?.detail || error.message
        });
    }
});

// Get user's assessments
app.get('/assessments', authMiddleware, async (req: AuthRequest, res: Response) => {
    const userId = req.userId!;
    
    try {
        const result = await pool.query(
            'SELECT id, title, difficulty, created_at FROM assessments WHERE user_id = $1 ORDER BY created_at DESC',
            [userId]
        );
        
        res.json(result.rows);
    } catch (error) {
        console.error('Get assessments error:', error);
        res.status(500).json({ error: 'Failed to fetch assessments' });
    }
});

// Get assessment with questions
app.get('/assessments/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
    const userId = req.userId!;
    const assessmentId = parseInt(req.params.id as string);
    
    try {
        // Get assessment
        const assessmentResult = await pool.query(
            'SELECT * FROM assessments WHERE id = $1 AND user_id = $2',
            [assessmentId, userId]
        );
        
        if (assessmentResult.rows.length === 0) {
            return res.status(404).json({ error: 'Assessment not found' });
        }
        
        const assessment = assessmentResult.rows[0];
        
        // Get questions
        const questionsResult = await pool.query(
            'SELECT * FROM questions WHERE assessment_id = $1 ORDER BY id',
            [assessmentId]
        );
        
        assessment.questions = questionsResult.rows;
        
        res.json(assessment);
    } catch (error) {
        console.error('Get assessment error:', error);
        res.status(500).json({ error: 'Failed to fetch assessment' });
    }
});

// Submit assessment for grading
app.post('/assessments/:id/submit', authMiddleware, async (req: AuthRequest, res: Response) => {
    const userId = req.userId!;
    const assessmentId = parseInt(req.params.id as string);
    const { answers } = req.body;  // [{ question_id, answer }]
    
    try {
        console.log(`Submitting assessment ${assessmentId} for grading...`);
        
        // Verify assessment belongs to user
        const assessmentResult = await pool.query(
            'SELECT id FROM assessments WHERE id = $1 AND user_id = $2',
            [assessmentId, userId]
        );
        
        if (assessmentResult.rows.length === 0) {
            return res.status(404).json({ error: 'Assessment not found' });
        }
        
        // Call AI service to grade
        const aiResponse = await axios.post<SubmitAssessmentResponse>(
            `${AI_SERVICE_URL}/ai/submit-assessment`,
            {
                assessment_id: assessmentId,
                answers: answers
            },
            { timeout: 180000 }  // 3 minute timeout for grading
        );
        
        console.log(`Assessment graded: ${aiResponse.data.percentage}%`);
        
        res.json(aiResponse.data);
    } catch (error: any) {
        console.error('Assessment submission error:', error.response?.data || error.message);
        res.status(500).json({ 
            error: 'Failed to submit assessment',
            details: error.response?.data?.detail || error.message
        });
    }
});

// Grade individual answer
app.post('/quiz/grade-answer', authMiddleware, async (req: AuthRequest, res: Response) => {
    const { question_id, student_answer, provider, model } = req.body;
    
    try {
        const aiResponse = await axios.post(
            `${AI_SERVICE_URL}/ai/grade-answer`,
            {
                question_id,
                student_answer,
                provider: provider || 'groq',
                model: model || null
            }
        );
        
        res.json(aiResponse.data);
    } catch (error: any) {
        console.error('Grade answer error:', error.response?.data || error.message);
        res.status(500).json({ 
            error: 'Failed to grade answer',
            details: error.response?.data?.detail || error.message
        });
    }
});

// Get assessment results
app.get('/assessments/:id/results', authMiddleware, async (req: AuthRequest, res: Response) => {
    const userId = req.userId!;
    const assessmentId = parseInt(req.params.id as string);
    
    try {
        // Verify ownership
        const assessmentResult = await pool.query(
            'SELECT title, difficulty FROM assessments WHERE id = $1 AND user_id = $2',
            [assessmentId, userId]
        );
        
        if (assessmentResult.rows.length === 0) {
            return res.status(404).json({ error: 'Assessment not found' });
        }
        
        // Get responses
        const responsesResult = await pool.query(`
            SELECT 
                r.id,
                r.question_id,
                q.question_text,
                q.question_type,
                q.correct_answer,
                r.answer_text,
                r.ai_score,
                r.ai_feedback,
                r.submitted_at,
                q.points
            FROM responses r
            JOIN questions q ON r.question_id = q.id
            WHERE q.assessment_id = $1 AND r.user_id = $2
            ORDER BY q.id
        `, [assessmentId, userId]);
        
        const responses = responsesResult.rows;
        
        // Calculate total score
        const totalScore = responses.reduce((sum, r) => sum + (r.ai_score / 100 * r.points), 0);
        const maxScore = responses.reduce((sum, r) => sum + r.points, 0);
        const percentage = maxScore > 0 ? (totalScore / maxScore * 100) : 0;
        
        res.json({
            assessment: assessmentResult.rows[0],
            responses,
            score: {
                total: totalScore.toFixed(2),
                max: maxScore,
                percentage: percentage.toFixed(1)
            }
        });
    } catch (error) {
        console.error('Get results error:', error);
        res.status(500).json({ error: 'Failed to fetch results' });
    }
});

// Delete assessment
app.delete('/assessments/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
    const userId = req.userId!;
    const assessmentId = parseInt(req.params.id as string);
    
    try {
        const result = await pool.query(
            'DELETE FROM assessments WHERE id = $1 AND user_id = $2 RETURNING id',
            [assessmentId, userId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Assessment not found' });
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Delete assessment error:', error);
        res.status(500).json({ error: 'Failed to delete assessment' });
    }
});

// ============ PHASE 4: MULTI-TENANT MANAGEMENT ============

// Create tenant
app.post('/admin/tenants', authMiddleware, async (req: AuthRequest, res: Response) => {
    const { name, domain, plan, max_users, max_storage_gb } = req.body;
    
    try {
        const aiResponse = await axios.post(
            `${AI_SERVICE_URL}/ai/tenants/create`,
            {
                name,
                domain,
                plan: plan || 'free',
                max_users: max_users || 10,
                max_storage_gb: max_storage_gb || 5
            }
        );
        
        res.json(aiResponse.data);
    } catch (error: any) {
        console.error('Create tenant error:', error.response?.data || error.message);
        res.status(500).json({ 
            error: 'Failed to create tenant',
            details: error.response?.data?.detail || error.message
        });
    }
});

// List tenants
app.get('/admin/tenants', authMiddleware, async (req: AuthRequest, res: Response) => {
    const { include_inactive } = req.query;
    
    try {
        const aiResponse = await axios.get(
            `${AI_SERVICE_URL}/ai/tenants`,
            { params: { include_inactive: include_inactive === 'true' } }
        );
        
        res.json(aiResponse.data);
    } catch (error: any) {
        console.error('List tenants error:', error);
        res.status(500).json({ error: 'Failed to list tenants' });
    }
});

// Get tenant details
app.get('/admin/tenants/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
    const tenantId = parseInt(req.params.id as string);
    
    try {
        const aiResponse = await axios.get(
            `${AI_SERVICE_URL}/ai/tenants/${tenantId}`
        );
        
        res.json(aiResponse.data);
    } catch (error: any) {
        console.error('Get tenant error:', error);
        res.status(error.response?.status || 500).json({ 
            error: 'Failed to get tenant'
        });
    }
});

// Update tenant
app.put('/admin/tenants/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
    const tenantId = parseInt(req.params.id as string);
    const updates = req.body;
    
    try {
        const aiResponse = await axios.put(
            `${AI_SERVICE_URL}/ai/tenants/${tenantId}`,
            updates
        );
        
        res.json(aiResponse.data);
    } catch (error: any) {
        console.error('Update tenant error:', error);
        res.status(500).json({ error: 'Failed to update tenant' });
    }
});

// Delete tenant
app.delete('/admin/tenants/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
    const tenantId = parseInt(req.params.id as string);
    
    try {
        const aiResponse = await axios.delete(
            `${AI_SERVICE_URL}/ai/tenants/${tenantId}`
        );
        
        res.json(aiResponse.data);
    } catch (error: any) {
        console.error('Delete tenant error:', error);
        res.status(500).json({ error: 'Failed to delete tenant' });
    }
});

// Get tenant users
app.get('/admin/tenants/:id/users', authMiddleware, async (req: AuthRequest, res: Response) => {
    const tenantId = parseInt(req.params.id as string);
    
    try {
        const aiResponse = await axios.get(
            `${AI_SERVICE_URL}/ai/tenants/${tenantId}/users`
        );
        
        res.json(aiResponse.data);
    } catch (error: any) {
        console.error('Get tenant users error:', error);
        res.status(500).json({ error: 'Failed to get users' });
    }
});

// Invite user to tenant
app.post('/admin/invitations', authMiddleware, async (req: AuthRequest, res: Response) => {
    const userId = req.userId!;
    const { tenant_id, email, role } = req.body;
    
    try {
        const aiResponse = await axios.post(
            `${AI_SERVICE_URL}/ai/tenants/invite`,
            {
                tenant_id,
                email,
                role: role || 'member',
                invited_by_user_id: userId
            }
        );
        
        res.json(aiResponse.data);
    } catch (error: any) {
        console.error('Invite user error:', error);
        res.status(500).json({ error: 'Failed to send invitation' });
    }
});

// Check usage limits
app.get('/admin/tenants/:id/limits', authMiddleware, async (req: AuthRequest, res: Response) => {
    const tenantId = parseInt(req.params.id as string);
    
    try {
        const aiResponse = await axios.get(
            `${AI_SERVICE_URL}/ai/tenants/${tenantId}/usage-limits`
        );
        
        res.json(aiResponse.data);
    } catch (error: any) {
        console.error('Check limits error:', error);
        res.status(500).json({ error: 'Failed to check limits' });
    }
});

// ============ PHASE 4: ANALYTICS & REPORTING ============

// Get analytics overview
app.get('/admin/analytics/overview/:tenantId', authMiddleware, async (req: AuthRequest, res: Response) => {
    const tenantId = parseInt(req.params.tenantId as string);
    
    try {
        console.log(`Fetching analytics for tenant ${tenantId}`);
        
        const aiResponse = await axios.get(
            `${AI_SERVICE_URL}/ai/analytics/overview/${tenantId}`
        );
        
        res.json(aiResponse.data);
    } catch (error: any) {
        console.error('Analytics overview error:', error);
        res.status(500).json({ error: 'Failed to fetch analytics' });
    }
});

// Get usage trends
app.get('/admin/analytics/trends/:tenantId', authMiddleware, async (req: AuthRequest, res: Response) => {
    const tenantId = parseInt(req.params.tenantId as string);
    const days = parseInt(req.query.days as string) || 30;
    
    try {
        const aiResponse = await axios.get(
            `${AI_SERVICE_URL}/ai/analytics/trends/${tenantId}`,
            { params: { days } }
        );
        
        res.json(aiResponse.data);
    } catch (error: any) {
        console.error('Usage trends error:', error);
        res.status(500).json({ error: 'Failed to fetch trends' });
    }
});

// Get user activity
app.get('/admin/analytics/users/:tenantId', authMiddleware, async (req: AuthRequest, res: Response) => {
    const tenantId = parseInt(req.params.tenantId as string);
    const limit = parseInt(req.query.limit as string) || 50;
    
    try {
        const aiResponse = await axios.get(
            `${AI_SERVICE_URL}/ai/analytics/users/${tenantId}`,
            { params: { limit } }
        );
        
        res.json(aiResponse.data);
    } catch (error: any) {
        console.error('User activity error:', error);
        res.status(500).json({ error: 'Failed to fetch user activity' });
    }
});

// Get popular documents
app.get('/admin/analytics/documents/:tenantId', authMiddleware, async (req: AuthRequest, res: Response) => {
    const tenantId = parseInt(req.params.tenantId as string);
    const limit = parseInt(req.query.limit as string) || 20;
    
    try {
        const aiResponse = await axios.get(
            `${AI_SERVICE_URL}/ai/analytics/documents/${tenantId}`,
            { params: { limit } }
        );
        
        res.json(aiResponse.data);
    } catch (error: any) {
        console.error('Popular documents error:', error);
        res.status(500).json({ error: 'Failed to fetch popular documents' });
    }
});

// Get system health
app.get('/admin/analytics/health/:tenantId', authMiddleware, async (req: AuthRequest, res: Response) => {
    const tenantId = parseInt(req.params.tenantId as string);
    
    try {
        const aiResponse = await axios.get(
            `${AI_SERVICE_URL}/ai/analytics/health/${tenantId}`
        );
        
        res.json(aiResponse.data);
    } catch (error: any) {
        console.error('System health error:', error);
        res.status(500).json({ error: 'Failed to fetch health metrics' });
    }
});

// Generate comprehensive report
app.get('/admin/analytics/report/:tenantId', authMiddleware, async (req: AuthRequest, res: Response) => {
    const tenantId = parseInt(req.params.tenantId as string);
    const reportType = req.query.report_type as string || 'monthly';
    
    try {
        console.log(`Generating ${reportType} report for tenant ${tenantId}`);
        
        const aiResponse = await axios.get(
            `${AI_SERVICE_URL}/ai/analytics/report/${tenantId}`,
            { params: { report_type: reportType } }
        );
        
        res.json(aiResponse.data);
    } catch (error: any) {
        console.error('Report generation error:', error);
        res.status(500).json({ error: 'Failed to generate report' });
    }
});

// ============ PHASE 5: ADVANCED EMBEDDINGS ============

// List embedding providers
app.get('/embeddings/providers', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const aiResponse = await axios.get(
            `${AI_SERVICE_URL}/ai/embeddings/providers`
        );
        
        res.json(aiResponse.data);
    } catch (error: any) {
        console.error('List providers error:', error);
        res.status(500).json({ error: 'Failed to list embedding providers' });
    }
});

// Get embedding recommendations
app.get('/embeddings/recommendations', authMiddleware, async (req: AuthRequest, res: Response) => {
    const useCase = req.query.use_case as string || 'general';
    
    try {
        const aiResponse = await axios.get(
            `${AI_SERVICE_URL}/ai/embeddings/recommendations`,
            { params: { use_case: useCase } }
        );
        
        res.json(aiResponse.data);
    } catch (error: any) {
        console.error('Recommendations error:', error);
        res.status(500).json({ error: 'Failed to get recommendations' });
    }
});

// Test embedding provider
app.post('/embeddings/test', authMiddleware, async (req: AuthRequest, res: Response) => {
    const { text, provider, model } = req.body;
    
    if (!text || !provider) {
        return res.status(400).json({ error: 'Text and provider required' });
    }
    
    try {
        const aiResponse = await axios.post(
            `${AI_SERVICE_URL}/ai/embeddings/test`,
            { text, provider, model },
            { params: { text, provider, model } }
        );
        
        res.json(aiResponse.data);
    } catch (error: any) {
        console.error('Test embedding error:', error.response?.data || error.message);
        res.status(500).json({ 
            error: 'Failed to test embedding',
            details: error.response?.data?.detail || error.message
        });
    }
});

// Compare embedding providers
app.post('/embeddings/compare', authMiddleware, async (req: AuthRequest, res: Response) => {
    const { text, providers } = req.body;
    
    if (!text || !providers || !Array.isArray(providers)) {
        return res.status(400).json({ error: 'Text and providers array required' });
    }
    
    try {
        const aiResponse = await axios.post(
            `${AI_SERVICE_URL}/ai/embeddings/compare`,
            { text, providers },
            { params: { text, providers } }
        );
        
        res.json(aiResponse.data);
    } catch (error: any) {
        console.error('Compare embeddings error:', error);
        res.status(500).json({ error: 'Failed to compare embeddings' });
    }
});

// ============ PHASE 6: VECTOR STORES ============

// List available vector stores
app.get('/vector-stores/list', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const aiResponse = await axios.get(
            `${AI_SERVICE_URL}/ai/vector-stores`
        );
        
        res.json(aiResponse.data);
    } catch (error: any) {
        console.error('List vector stores error:', error);
        res.status(500).json({ error: 'Failed to list vector stores' });
    }
});

// Test vector store
app.post('/vector-stores/test', authMiddleware, async (req: AuthRequest, res: Response) => {
    const { store_type, dimension, num_vectors } = req.body;
    
    try {
        const aiResponse = await axios.post(
            `${AI_SERVICE_URL}/ai/test-vector-store`,
            null,
            {
                params: {
                    store_type: store_type || 'faiss',
                    dimension: dimension || 384,
                    num_vectors: num_vectors || 100
                }
            }
        );
        
        res.json(aiResponse.data);
    } catch (error: any) {
        console.error('Test vector store error:', error);
        res.status(500).json({ 
            error: 'Failed to test vector store',
            details: error.response?.data?.detail || error.message
        });
    }
});

// Compare vector stores
app.post('/vector-stores/compare', authMiddleware, async (req: AuthRequest, res: Response) => {
    const { stores, dimension, num_vectors } = req.body;
    
    try {
        const aiResponse = await axios.post(
            `${AI_SERVICE_URL}/ai/compare-vector-stores`,
            {
                stores: stores || ['faiss', 'chromadb', 'qdrant_memory'],
                dimension: dimension || 384,
                num_vectors: num_vectors || 100
            }
        );
        
        res.json(aiResponse.data);
    } catch (error: any) {
        console.error('Compare vector stores error:', error);
        res.status(500).json({ 
            error: 'Failed to compare vector stores',
            details: error.response?.data?.detail || error.message
        });
    }
});

// ============ PHASE 7: MULTIPLE LLM PROVIDERS ============

// List available LLM providers
app.get('/llms/providers', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const aiResponse = await axios.get(
            `${AI_SERVICE_URL}/ai/llm-providers`
        );
        
        res.json(aiResponse.data);
    } catch (error: any) {
        console.error('List LLM providers error:', error);
        res.status(500).json({ error: 'Failed to list LLM providers' });
    }
});

// Test LLM provider
app.post('/llms/test', authMiddleware, async (req: AuthRequest, res: Response) => {
    const { provider, prompt, temperature } = req.body;
    
    try {
        const aiResponse = await axios.post(
            `${AI_SERVICE_URL}/ai/test-llm`,
            null,
            {
                params: {
                    provider: provider || 'groq',
                    prompt: prompt || 'What is the capital of France?',
                    temperature: temperature || 0.7
                }
            }
        );
        
        res.json(aiResponse.data);
    } catch (error: any) {
        console.error('Test LLM error:', error);
        res.status(500).json({ 
            error: 'Failed to test LLM',
            details: error.response?.data?.detail || error.message
        });
    }
});

// Compare LLM providers
app.post('/llms/compare', authMiddleware, async (req: AuthRequest, res: Response) => {
    const { providers, prompt } = req.body;
    
    try {
        const aiResponse = await axios.post(
            `${AI_SERVICE_URL}/ai/compare-llms`,
            {
                providers: providers || ['groq', 'openai', 'claude'],
                prompt: prompt || 'Explain quantum computing in one sentence.'
            }
        );
        
        res.json(aiResponse.data);
    } catch (error: any) {
        console.error('Compare LLMs error:', error);
        res.status(500).json({ 
            error: 'Failed to compare LLMs',
            details: error.response?.data?.detail || error.message
        });
    }
});

// ============ START SERVER ============

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`✅ Backend server running on http://localhost:${PORT}`);
    console.log(`✅ AI Service URL: ${AI_SERVICE_URL}`);
});
