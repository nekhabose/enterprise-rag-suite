-- ============================================================
-- Enterprise LMS Platform - Full RBAC Schema
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- TENANTS (Universities)
-- ============================================================
CREATE TABLE IF NOT EXISTS tenants (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(255) UNIQUE NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    plan VARCHAR(50) DEFAULT 'free',
    max_users INT DEFAULT 50,
    max_storage_gb INT DEFAULT 10,
    features JSONB DEFAULT '{}',
    settings JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- ROLES ENUM
-- ============================================================
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM (
        'SUPER_ADMIN', 'INTERNAL_ADMIN', 'INTERNAL_STAFF',
        'TENANT_ADMIN', 'FACULTY', 'STUDENT'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    role user_role NOT NULL DEFAULT 'STUDENT',
    tenant_id INT REFERENCES tenants(id),
    is_active BOOLEAN DEFAULT true,
    is_email_verified BOOLEAN DEFAULT false,
    last_login_at TIMESTAMP,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- PERMISSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS permissions (
    id SERIAL PRIMARY KEY,
    code VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    scope VARCHAR(50) DEFAULT 'global'
);

INSERT INTO permissions (code, description, scope) VALUES
    ('GLOBAL_DASHBOARD_READ', 'View global super admin dashboard', 'global'),
    ('TENANT_CREATE', 'Create new university tenants', 'global'),
    ('TENANT_READ', 'Read tenant information', 'global'),
    ('TENANT_UPDATE', 'Update tenant settings', 'global'),
    ('TENANT_DELETE', 'Disable/delete tenants', 'global'),
    ('INTERNAL_USER_READ', 'Read internal employee/contractor data', 'global'),
    ('INTERNAL_USER_WRITE', 'Manage internal employees/contractors', 'global'),
    ('IMPERSONATE_TENANT_ADMIN', 'Impersonate a tenant admin', 'global'),
    ('AUDIT_LOG_READ', 'Read audit logs', 'global'),
    ('GLOBAL_ANALYTICS_READ', 'Read global analytics', 'global'),
    ('TENANT_USER_READ', 'Read users within a tenant', 'tenant'),
    ('TENANT_USER_WRITE', 'Manage users within a tenant', 'tenant'),
    ('COURSE_READ', 'Read course content', 'tenant'),
    ('COURSE_WRITE', 'Create/update courses', 'tenant'),
    ('KB_READ', 'Read knowledge base content', 'tenant'),
    ('KB_WRITE', 'Write to knowledge base', 'tenant'),
    ('CONNECTOR_CONFIGURE', 'Configure data connectors', 'tenant'),
    ('AI_SETTINGS_UPDATE', 'Update AI/chunking/retrieval settings', 'tenant'),
    ('TENANT_ANALYTICS_READ', 'Read tenant-level analytics', 'tenant'),
    ('DOCUMENT_READ', 'Read documents', 'tenant'),
    ('DOCUMENT_WRITE', 'Upload/modify documents', 'tenant'),
    ('DOCUMENT_DELETE', 'Delete documents', 'tenant'),
    ('VIDEO_READ', 'Read videos', 'tenant'),
    ('VIDEO_WRITE', 'Upload/modify videos', 'tenant'),
    ('ASSESSMENT_READ', 'Read/take assessments', 'tenant'),
    ('ASSESSMENT_WRITE', 'Create/grade assessments', 'tenant'),
    ('CHAT_USE', 'Use AI chat', 'tenant'),
    ('STUDENT_PROGRESS_READ', 'Read student engagement/progress', 'tenant')
ON CONFLICT (code) DO NOTHING;

-- Role permissions mapping
CREATE TABLE IF NOT EXISTS role_permissions (
    role user_role NOT NULL,
    permission_code VARCHAR(100) NOT NULL REFERENCES permissions(code),
    PRIMARY KEY (role, permission_code)
);

INSERT INTO role_permissions SELECT 'SUPER_ADMIN', code FROM permissions ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role, permission_code) VALUES
    ('INTERNAL_ADMIN', 'GLOBAL_DASHBOARD_READ'), ('INTERNAL_ADMIN', 'TENANT_READ'),
    ('INTERNAL_ADMIN', 'INTERNAL_USER_READ'), ('INTERNAL_ADMIN', 'AUDIT_LOG_READ'),
    ('INTERNAL_ADMIN', 'GLOBAL_ANALYTICS_READ'), ('INTERNAL_ADMIN', 'TENANT_ANALYTICS_READ'),
    ('INTERNAL_ADMIN', 'TENANT_USER_READ'), ('INTERNAL_ADMIN', 'DOCUMENT_READ'),
    ('INTERNAL_ADMIN', 'COURSE_READ'), ('INTERNAL_ADMIN', 'KB_READ')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role, permission_code) VALUES
    ('INTERNAL_STAFF', 'GLOBAL_DASHBOARD_READ'), ('INTERNAL_STAFF', 'TENANT_READ'),
    ('INTERNAL_STAFF', 'GLOBAL_ANALYTICS_READ')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role, permission_code) VALUES
    ('TENANT_ADMIN', 'TENANT_USER_READ'), ('TENANT_ADMIN', 'TENANT_USER_WRITE'),
    ('TENANT_ADMIN', 'COURSE_READ'), ('TENANT_ADMIN', 'COURSE_WRITE'),
    ('TENANT_ADMIN', 'KB_READ'), ('TENANT_ADMIN', 'KB_WRITE'),
    ('TENANT_ADMIN', 'CONNECTOR_CONFIGURE'), ('TENANT_ADMIN', 'AI_SETTINGS_UPDATE'),
    ('TENANT_ADMIN', 'TENANT_ANALYTICS_READ'), ('TENANT_ADMIN', 'DOCUMENT_READ'),
    ('TENANT_ADMIN', 'DOCUMENT_WRITE'), ('TENANT_ADMIN', 'DOCUMENT_DELETE'),
    ('TENANT_ADMIN', 'VIDEO_READ'), ('TENANT_ADMIN', 'VIDEO_WRITE'),
    ('TENANT_ADMIN', 'ASSESSMENT_READ'), ('TENANT_ADMIN', 'ASSESSMENT_WRITE'),
    ('TENANT_ADMIN', 'CHAT_USE'), ('TENANT_ADMIN', 'AUDIT_LOG_READ'),
    ('TENANT_ADMIN', 'STUDENT_PROGRESS_READ')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role, permission_code) VALUES
    ('FACULTY', 'COURSE_READ'), ('FACULTY', 'COURSE_WRITE'),
    ('FACULTY', 'KB_READ'), ('FACULTY', 'KB_WRITE'),
    ('FACULTY', 'DOCUMENT_READ'), ('FACULTY', 'DOCUMENT_WRITE'), ('FACULTY', 'DOCUMENT_DELETE'),
    ('FACULTY', 'VIDEO_READ'), ('FACULTY', 'VIDEO_WRITE'),
    ('FACULTY', 'ASSESSMENT_READ'), ('FACULTY', 'ASSESSMENT_WRITE'),
    ('FACULTY', 'CHAT_USE'), ('FACULTY', 'STUDENT_PROGRESS_READ')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role, permission_code) VALUES
    ('STUDENT', 'COURSE_READ'), ('STUDENT', 'KB_READ'),
    ('STUDENT', 'DOCUMENT_READ'), ('STUDENT', 'VIDEO_READ'),
    ('STUDENT', 'ASSESSMENT_READ'), ('STUDENT', 'CHAT_USE')
ON CONFLICT DO NOTHING;

-- ============================================================
-- IMPERSONATION SESSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS impersonation_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    impersonator_id INT NOT NULL REFERENCES users(id),
    target_user_id INT NOT NULL REFERENCES users(id),
    target_tenant_id INT NOT NULL REFERENCES tenants(id),
    reason TEXT,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    ended_at TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- DOCUMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS documents (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    tenant_id INT REFERENCES tenants(id),
    filename VARCHAR(255) NOT NULL,
    file_path TEXT,
    file_type VARCHAR(50) DEFAULT 'pdf',
    subject VARCHAR(100),
    year INT,
    metadata JSONB DEFAULT '{}',
    uploaded_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- VIDEOS
-- ============================================================
CREATE TABLE IF NOT EXISTS videos (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    tenant_id INT REFERENCES tenants(id),
    title VARCHAR(255),
    youtube_url TEXT,
    duration INT,
    transcript TEXT,
    subject VARCHAR(100),
    year INT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- CHUNKS
-- ============================================================
CREATE TABLE IF NOT EXISTS chunks (
    id SERIAL PRIMARY KEY,
    document_id INT REFERENCES documents(id) ON DELETE CASCADE,
    video_id INT REFERENCES videos(id) ON DELETE CASCADE,
    tenant_id INT REFERENCES tenants(id),
    content TEXT NOT NULL,
    embedding vector(1536),
    chunk_index INT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    CHECK (
        (document_id IS NOT NULL AND video_id IS NULL) OR
        (document_id IS NULL AND video_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS chunks_embedding_idx ON chunks
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ============================================================
-- COURSES
-- ============================================================
CREATE TABLE IF NOT EXISTS courses (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(id),
    created_by INT REFERENCES users(id),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    subject VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS course_enrollments (
    id SERIAL PRIMARY KEY,
    course_id INT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    enrolled_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(course_id, user_id)
);

-- ============================================================
-- CONVERSATIONS / MESSAGES
-- ============================================================
CREATE TABLE IF NOT EXISTS conversations (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    tenant_id INT REFERENCES tenants(id),
    title VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    conversation_id INT REFERENCES conversations(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    sources JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- ASSESSMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS assessments (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    tenant_id INT REFERENCES tenants(id),
    title VARCHAR(255),
    assessment_type VARCHAR(50),
    difficulty VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS questions (
    id SERIAL PRIMARY KEY,
    assessment_id INT REFERENCES assessments(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    question_type VARCHAR(50),
    correct_answer TEXT,
    options JSONB,
    points INT DEFAULT 1
);

CREATE TABLE IF NOT EXISTS responses (
    id SERIAL PRIMARY KEY,
    question_id INT REFERENCES questions(id),
    user_id INT REFERENCES users(id),
    answer_text TEXT,
    ai_score DECIMAL(5,2),
    ai_feedback TEXT,
    submitted_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- INVITATIONS / API KEYS / LOGS / SETTINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS invitations (
    id SERIAL PRIMARY KEY,
    tenant_id INT REFERENCES tenants(id),
    invited_by INT REFERENCES users(id),
    email VARCHAR(255) NOT NULL,
    role user_role DEFAULT 'STUDENT',
    token VARCHAR(255) UNIQUE NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS api_keys (
    id SERIAL PRIMARY KEY,
    tenant_id INT REFERENCES tenants(id),
    user_id INT REFERENCES users(id),
    key_hash VARCHAR(255) NOT NULL UNIQUE,
    key_prefix VARCHAR(20),
    name VARCHAR(255),
    permissions JSONB DEFAULT '{}',
    last_used_at TIMESTAMP,
    expires_at TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS usage_logs (
    id SERIAL PRIMARY KEY,
    tenant_id INT REFERENCES tenants(id),
    user_id INT REFERENCES users(id),
    action_type VARCHAR(100),
    resource_type VARCHAR(50),
    resource_id INT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    tenant_id INT REFERENCES tenants(id),
    user_id INT REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id INT,
    ip_address VARCHAR(50),
    user_agent TEXT,
    details JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_settings (
    user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    settings JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenant_ai_settings (
    tenant_id INT PRIMARY KEY REFERENCES tenants(id),
    chunking_strategy VARCHAR(100) DEFAULT 'semantic',
    embedding_model VARCHAR(100) DEFAULT 'minilm',
    llm_provider VARCHAR(100) DEFAULT 'groq',
    retrieval_strategy VARCHAR(50) DEFAULT 'hybrid',
    vector_store VARCHAR(50) DEFAULT 'postgres',
    pdf_mode VARCHAR(50) DEFAULT 'standard',
    settings JSONB DEFAULT '{}',
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_documents_tenant ON documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_videos_tenant ON videos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_chunks_tenant ON chunks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_conversations_tenant ON conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_assessments_tenant ON assessments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_courses_tenant ON courses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);

-- ============================================================
-- SEED DATA
-- ============================================================
INSERT INTO tenants (name, domain, slug, plan, max_users, max_storage_gb, is_active)
VALUES ('Platform', 'platform.local', 'platform', 'enterprise', 9999, 9999, true)
ON CONFLICT (domain) DO NOTHING;

INSERT INTO tenants (name, domain, slug, plan, max_users, max_storage_gb, is_active)
VALUES ('State University', 'state.edu', 'state-university', 'pro', 500, 100, true)
ON CONFLICT (domain) DO NOTHING;

-- Super Admin (password: Admin@12345)
INSERT INTO users (email, password_hash, first_name, last_name, role, tenant_id)
SELECT 'superadmin@platform.local',
       '$2b$10$8jehTPkfM/09bbCRTKUMPeZtfyQnGm1E2SXSi..e6FTpK9pYVB3gm',
       'Platform', 'Admin', 'SUPER_ADMIN', NULL
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'superadmin@platform.local');

-- Tenant Admin (password: Admin@12345)
INSERT INTO users (email, password_hash, first_name, last_name, role, tenant_id)
SELECT 'admin@state.edu',
       '$2b$10$8jehTPkfM/09bbCRTKUMPeZtfyQnGm1E2SXSi..e6FTpK9pYVB3gm',
       'University', 'Admin', 'TENANT_ADMIN',
       (SELECT id FROM tenants WHERE slug = 'state-university')
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'admin@state.edu');

-- Faculty (password: Admin@12345)
INSERT INTO users (email, password_hash, first_name, last_name, role, tenant_id)
SELECT 'faculty@state.edu',
       '$2b$10$8jehTPkfM/09bbCRTKUMPeZtfyQnGm1E2SXSi..e6FTpK9pYVB3gm',
       'Professor', 'Smith', 'FACULTY',
       (SELECT id FROM tenants WHERE slug = 'state-university')
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'faculty@state.edu');

-- Student (password: Admin@12345)
INSERT INTO users (email, password_hash, first_name, last_name, role, tenant_id)
SELECT 'student@state.edu',
       '$2b$10$8jehTPkfM/09bbCRTKUMPeZtfyQnGm1E2SXSi..e6FTpK9pYVB3gm',
       'Jane', 'Student', 'STUDENT',
       (SELECT id FROM tenants WHERE slug = 'state-university')
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'student@state.edu');
