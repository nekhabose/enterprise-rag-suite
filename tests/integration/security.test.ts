import { beforeAll, describe, expect, it } from '@jest/globals';
import axios, { AxiosError } from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { Pool } from 'pg';

dotenv.config({ path: path.resolve(__dirname, '../../backend/.env') });
dotenv.config({ path: path.resolve(__dirname, '../../ai-service/.env') });

const API_URL = process.env.TEST_API_URL || 'http://localhost:3000';
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/edu_platform';
const TEST_CHAT_PROVIDER = 'groq';
const TEST_CHAT_MODEL = process.env.TEST_CHAT_MODEL || 'llama-3.3-70b-versatile';

const client = axios.create({
  baseURL: API_URL,
  timeout: 120000,
  validateStatus: () => true
});

const pool = new Pool({ connectionString: DATABASE_URL });

type SignupResult = {
  token: string;
  userId: number;
  email: string;
};

const uniqueEmail = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}@test.local`;

const makeVector = (seed: number): string => {
  const dims = 1536;
  const values = Array.from({ length: dims }, (_, i) =>
    ((seed + (i % 11)) / 1000).toFixed(6)
  );
  return `[${values.join(',')}]`;
};

const signup = async (prefix: string): Promise<SignupResult> => {
  const email = uniqueEmail(prefix);
  const response = await client.post('/auth/signup', {
    email,
    password: 'Test123!'
  });
  expect(response.status).toBe(200);
  expect(response.data.token).toBeDefined();
  expect(response.data.user?.id).toBeDefined();
  return {
    token: response.data.token,
    userId: response.data.user.id,
    email
  };
};

const createTenant = async (namePrefix: string): Promise<number> => {
  const domain = `${namePrefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}.local`;
  const result = await pool.query(
    `INSERT INTO tenants (name, domain, plan, max_users, max_storage_gb)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [`${namePrefix} Tenant`, domain, 'free', 25, 5]
  );
  return result.rows[0].id as number;
};

const assignUserTenantAndRole = async (userId: number, tenantId: number, role: string) => {
  await pool.query(
    `UPDATE users
     SET tenant_id = $1, role = $2
     WHERE id = $3`,
    [tenantId, role, userId]
  );
};

const createDocumentForUser = async (
  userId: number,
  filename = 'seeded-doc.txt'
): Promise<number> => {
  const result = await pool.query(
    `INSERT INTO documents (user_id, filename, file_path, file_type)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [userId, filename, `seed://${filename}`, 'seed']
  );
  return result.rows[0].id as number;
};

const insertChunk = async (
  documentId: number,
  content: string,
  chunkIndex: number,
  seed: number
) => {
  const vector = makeVector(seed);
  await pool.query(
    `INSERT INTO chunks (document_id, video_id, content, embedding, chunk_index, metadata)
     VALUES ($1, NULL, $2, $3::vector, $4, $5)`,
    [documentId, content, vector, chunkIndex, JSON.stringify({ seeded: true })]
  );
};

const createSeededKnowledgeDoc = async (userId: number, namePrefix: string): Promise<number> => {
  const docId = await createDocumentForUser(userId, `${namePrefix}-python.pdf`);
  await insertChunk(docId, 'Python loops include for loops and while loops.', 0, 1);
  await insertChunk(docId, 'The range function is often used in Python for loops.', 1, 2);
  await insertChunk(docId, 'Functions in Python are defined using the def keyword.', 2, 3);
  return docId;
};

const expectStatus = (status: number, expected: number[]) => {
  expect(expected).toContain(status);
};

beforeAll(async () => {
  await pool.query('SELECT 1');
  expect(process.env.GROQ_API_KEY).toBeDefined();
  expect(String(process.env.GROQ_API_KEY || '').length).toBeGreaterThan(10);

  const backendHealth = await client.get('/');
  expect(backendHealth.status).toBe(200);
});

describe('Security - Tenant Isolation', () => {
  let tenant1Token = '';
  let tenant2Token = '';
  let tenant1UserId = 0;
  let tenant2UserId = 0;
  let tenant1DocId = 0;

  beforeAll(async () => {
    const user1 = await signup('tenant1');
    const user2 = await signup('tenant2');
    tenant1Token = user1.token;
    tenant2Token = user2.token;
    tenant1UserId = user1.userId;
    tenant2UserId = user2.userId;

    const t1 = await createTenant('tenant1');
    const t2 = await createTenant('tenant2');
    await assignUserTenantAndRole(tenant1UserId, t1, 'member');
    await assignUserTenantAndRole(tenant2UserId, t2, 'member');

    tenant1DocId = await createDocumentForUser(tenant1UserId, 'tenant1-secret.pdf');
  });

  it('should prevent cross-tenant document access', async () => {
    const response = await client.get('/documents', {
      headers: { Authorization: `Bearer ${tenant2Token}` }
    });
    expect(response.status).toBe(200);
    const ids = (response.data as Array<{ id: number }>).map((d) => d.id);
    expect(ids).not.toContain(tenant1DocId);
  });

  it('should prevent cross-tenant document deletion', async () => {
    const response = await client.delete(`/documents/${tenant1DocId}`, {
      headers: { Authorization: `Bearer ${tenant2Token}` }
    });
    expectStatus(response.status, [403, 404]);
  });

  it('should prevent cross-tenant conversation access', async () => {
    const createConv = await client.post(
      '/conversations',
      { title: 'Tenant1 Chat' },
      { headers: { Authorization: `Bearer ${tenant1Token}` } }
    );
    expect(createConv.status).toBe(200);
    const conversationId = createConv.data.id;

    const response = await client.get(`/conversations/${conversationId}/messages`, {
      headers: { Authorization: `Bearer ${tenant2Token}` }
    });
    expectStatus(response.status, [403, 404]);
  });

  it('should record audit logs with tenant_id for actions', async () => {
    const ownDocId = await createDocumentForUser(tenant1UserId, 'tenant1-owned-delete.pdf');
    const del = await client.delete(`/documents/${ownDocId}`, {
      headers: { Authorization: `Bearer ${tenant1Token}` }
    });
    expect(del.status).toBe(200);

    const audit = await pool.query(
      `SELECT tenant_id, user_id, action
       FROM audit_logs
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [tenant1UserId]
    );
    expect(audit.rows.length).toBeGreaterThan(0);
    expect(audit.rows[0].tenant_id).toBeDefined();
    expect(audit.rows[0].action).toBe('document.delete');
  });
});

describe('RBAC - Role Permissions', () => {
  let studentToken = '';
  let teacherToken = '';
  let adminToken = '';
  let studentUserId = 0;
  let teacherUserId = 0;
  let adminUserId = 0;
  let teacherDocId = 0;
  let sharedTenantId = 0;

  beforeAll(async () => {
    const student = await signup('student');
    const teacher = await signup('teacher');
    const admin = await signup('admin');
    studentToken = student.token;
    teacherToken = teacher.token;
    adminToken = admin.token;
    studentUserId = student.userId;
    teacherUserId = teacher.userId;
    adminUserId = admin.userId;

    sharedTenantId = await createTenant('rbac');
    await assignUserTenantAndRole(studentUserId, sharedTenantId, 'student');
    await assignUserTenantAndRole(teacherUserId, sharedTenantId, 'teacher');
    await assignUserTenantAndRole(adminUserId, sharedTenantId, 'admin');

    teacherDocId = await createDocumentForUser(teacherUserId, 'teacher-doc.pdf');
  });

  it('should deny student from deleting documents', async () => {
    const response = await client.delete(`/documents/${teacherDocId}`, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    expect(response.status).toBe(403);
    expect(String(response.data?.error || '')).toContain('Missing permission');
  });

  it('should deny student from admin endpoints', async () => {
    const response = await client.get('/admin/tenants', {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    expect(response.status).toBe(403);
  });

  it('should allow teacher to delete own documents', async () => {
    const ownDocId = await createDocumentForUser(teacherUserId, 'teacher-own.pdf');
    const response = await client.delete(`/documents/${ownDocId}`, {
      headers: { Authorization: `Bearer ${teacherToken}` }
    });
    expect(response.status).toBe(200);
  });

  it('should deny teacher from tenant management', async () => {
    const response = await client.post(
      '/admin/invitations',
      {
        tenant_id: sharedTenantId,
        email: uniqueEmail('invitee'),
        role: 'member'
      },
      { headers: { Authorization: `Bearer ${teacherToken}` } }
    );
    expect(response.status).toBe(403);
  });

  it('should allow admin to access admin tenant endpoint', async () => {
    const response = await client.get(`/admin/tenants/${sharedTenantId}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(response.status).toBe(200);
  });
});

describe('Retrieval Strategies', () => {
  let token = '';
  let userId = 0;
  let docId = 0;

  beforeAll(async () => {
    const user = await signup('retrieval');
    token = user.token;
    userId = user.userId;
    const tenantId = await createTenant('retrieval');
    await assignUserTenantAndRole(userId, tenantId, 'member');
    docId = await createSeededKnowledgeDoc(userId, 'retrieval-seed');
  });

  it('should retrieve with BM25', async () => {
    const response = await client.post(
      '/chat/answer',
      {
        question: 'Python programming loops',
        document_ids: [docId],
        retrieval_strategy: 'bm25',
        provider: TEST_CHAT_PROVIDER,
        model: TEST_CHAT_MODEL
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    expect(response.status).toBe(200);
    expect(response.data.retrieval_strategy).toBe('bm25');
    expect(Array.isArray(response.data.sources)).toBe(true);
    expect(response.data.sources.length).toBeGreaterThan(0);
  });

  it('should retrieve with semantic search', async () => {
    const response = await client.post(
      '/chat/answer',
      {
        question: 'How do I write loops in Python?',
        document_ids: [docId],
        retrieval_strategy: 'semantic',
        provider: TEST_CHAT_PROVIDER,
        model: TEST_CHAT_MODEL
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    expect(response.status).toBe(200);
    expect(response.data.retrieval_strategy).toBe('semantic');
    expect(Array.isArray(response.data.sources)).toBe(true);
  });

  it('should retrieve with hybrid strategy', async () => {
    const response = await client.post(
      '/chat/answer',
      {
        question: 'Python for loops',
        document_ids: [docId],
        retrieval_strategy: 'hybrid',
        provider: TEST_CHAT_PROVIDER,
        model: TEST_CHAT_MODEL
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    expect(response.status).toBe(200);
    expect(response.data.retrieval_strategy).toBe('hybrid');
    expect(Array.isArray(response.data.sources)).toBe(true);
  });
});

describe('Reranking', () => {
  let token = '';
  let userId = 0;
  let docId = 0;

  beforeAll(async () => {
    const user = await signup('rerank');
    token = user.token;
    userId = user.userId;
    const tenantId = await createTenant('rerank');
    await assignUserTenantAndRole(userId, tenantId, 'member');
    docId = await createSeededKnowledgeDoc(userId, 'rerank-seed');
  });

  it('should support reranking disabled', async () => {
    const response = await client.post(
      '/chat/answer',
      {
        question: 'What are Python loops?',
        document_ids: [docId],
        retrieval_strategy: 'hybrid',
        enable_reranking: false,
        provider: TEST_CHAT_PROVIDER,
        model: TEST_CHAT_MODEL
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    expect(response.status).toBe(200);
    expect(response.data.reranking_enabled).toBe(false);
    expect(Array.isArray(response.data.sources)).toBe(true);
  });

  it('should support reranking enabled', async () => {
    const response = await client.post(
      '/chat/answer',
      {
        question: 'What are Python loops?',
        document_ids: [docId],
        retrieval_strategy: 'hybrid',
        enable_reranking: true,
        provider: TEST_CHAT_PROVIDER,
        model: TEST_CHAT_MODEL
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    expect(response.status).toBe(200);
    expect(response.data.reranking_enabled).toBe(true);
  });
});

describe('LLM Providers', () => {
  let token = '';

  beforeAll(async () => {
    const user = await signup('llm');
    token = user.token;
  });

  it('should list providers including Groq', async () => {
    const response = await client.get('/llms/providers', {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(response.status).toBe(200);
    const providers = response.data?.providers || {};
    expect(providers['groq']).toBeDefined();
  });

  it('should execute chat answer with Groq provider', async () => {
    const user = await signup('llm-chat');
    const tenantId = await createTenant('llm-chat');
    await assignUserTenantAndRole(user.userId, tenantId, 'member');
    const docId = await createSeededKnowledgeDoc(user.userId, 'llm-chat');

    const response = await client.post(
      '/chat/answer',
      {
        question: 'Summarize Python loops in one sentence.',
        document_ids: [docId],
        retrieval_strategy: 'hybrid',
        provider: TEST_CHAT_PROVIDER,
        model: TEST_CHAT_MODEL
      },
      { headers: { Authorization: `Bearer ${user.token}` } }
    );

    expect(response.status).toBe(200);
    expect(typeof response.data.answer).toBe('string');
    expect(Array.isArray(response.data.sources)).toBe(true);
  });
});

describe('End-to-End Integration', () => {
  let token = '';
  let userId = 0;

  beforeAll(async () => {
    const user = await signup('e2e');
    token = user.token;
    userId = user.userId;
    const tenantId = await createTenant('e2e');
    await assignUserTenantAndRole(userId, tenantId, 'teacher');
  });

  it('should support document -> chat workflow with seeded chunks', async () => {
    const docId = await createSeededKnowledgeDoc(userId, 'e2e-flow');
    const response = await client.post(
      '/chat/answer',
      {
        question: 'What keyword defines functions in Python?',
        document_ids: [docId],
        retrieval_strategy: 'hybrid',
        provider: TEST_CHAT_PROVIDER,
        model: TEST_CHAT_MODEL
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    expect(response.status).toBe(200);
    expect(response.data.answer).toBeDefined();
    expect(Array.isArray(response.data.sources)).toBe(true);
    expect(response.data.sources.length).toBeGreaterThan(0);
  });

  it('should support quiz generation workflow', async () => {
    const docId = await createSeededKnowledgeDoc(userId, 'e2e-quiz');
    const response = await client.post(
      '/assessments/create',
      {
        title: 'Integration Quiz',
        document_ids: [docId],
        question_count: 3,
        difficulty: 'medium',
        question_types: ['multiple_choice'],
        provider: TEST_CHAT_PROVIDER,
        model: TEST_CHAT_MODEL
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    expect(response.status).toBe(200);
    expect(response.data.assessment_id || response.data.success).toBeDefined();
  });
});

process.on('unhandledRejection', (reason) => {
  const err = reason as AxiosError;
  if (err && (err as any).response) {
    // Keep logs concise while still showing failing API payloads.
    // eslint-disable-next-line no-console
    console.error('Unhandled rejection:', (err as any).response?.status, (err as any).response?.data);
  }
});
