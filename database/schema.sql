-- Enable extensions
CREATE EXTENSION IF NOT EXISTS vector;

-- Users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'student',
    created_at TIMESTAMP DEFAULT NOW()
);

-- Documents table
CREATE TABLE documents (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    filename VARCHAR(255) NOT NULL,
    file_path TEXT,
    file_type VARCHAR(50) DEFAULT 'pdf',
    subject VARCHAR(100),
    year INT,
    uploaded_at TIMESTAMP DEFAULT NOW()
);

-- Videos table
CREATE TABLE videos (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    title VARCHAR(255),
    youtube_url TEXT,
    subject VARCHAR(100),
    year INT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Chunks table
CREATE TABLE chunks (
    id SERIAL PRIMARY KEY,
    document_id INT REFERENCES documents(id) ON DELETE CASCADE,
    video_id INT REFERENCES videos(id) ON DELETE CASCADE,
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

CREATE INDEX chunks_embedding_idx ON chunks 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Conversations table
CREATE TABLE conversations (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    title VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Messages table
CREATE TABLE messages (
    id SERIAL PRIMARY KEY,
    conversation_id INT REFERENCES conversations(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    sources JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Assessments table
CREATE TABLE assessments (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    title VARCHAR(255),
    assessment_type VARCHAR(50),
    difficulty VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Questions table
CREATE TABLE questions (
    id SERIAL PRIMARY KEY,
    assessment_id INT REFERENCES assessments(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    question_type VARCHAR(50),
    correct_answer TEXT,
    options JSONB,
    points INT DEFAULT 1
);

-- Student responses table
CREATE TABLE responses (
    id SERIAL PRIMARY KEY,
    question_id INT REFERENCES questions(id),
    user_id INT REFERENCES users(id),
    answer_text TEXT,
    ai_score DECIMAL(5,2),
    ai_feedback TEXT,
    submitted_at TIMESTAMP DEFAULT NOW()
);

-- Performance indexes
CREATE INDEX idx_documents_user ON documents(user_id);
CREATE INDEX idx_videos_user ON videos(user_id);
CREATE INDEX idx_chunks_document ON chunks(document_id);
CREATE INDEX idx_chunks_video ON chunks(video_id);
CREATE INDEX idx_messages_conversation ON messages(conversation_id);

-- ============ PHASE 4: MULTI-TENANT & ADMIN ============

-- Tenants table for multi-tenant support
CREATE TABLE tenants (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(255) UNIQUE,
    plan VARCHAR(50) DEFAULT 'free', -- free, pro, enterprise
    max_users INT DEFAULT 10,
    max_storage_gb INT DEFAULT 5,
    features JSONB DEFAULT '{}',
    settings JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Add tenant_id to users table (for existing deployments, run: ALTER TABLE users ADD COLUMN tenant_id INT REFERENCES tenants(id);)
-- For new deployments, this is already integrated

-- Usage tracking table
CREATE TABLE usage_logs (
    id SERIAL PRIMARY KEY,
    tenant_id INT REFERENCES tenants(id),
    user_id INT REFERENCES users(id),
    action_type VARCHAR(100), -- document_upload, chat_query, quiz_generate, etc.
    resource_type VARCHAR(50), -- document, video, assessment, etc.
    resource_id INT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- API keys table for programmatic access
CREATE TABLE api_keys (
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

-- Audit logs for security and compliance
CREATE TABLE audit_logs (
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

-- Invitations for team management
CREATE TABLE invitations (
    id SERIAL PRIMARY KEY,
    tenant_id INT REFERENCES tenants(id),
    invited_by INT REFERENCES users(id),
    email VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'member',
    token VARCHAR(255) UNIQUE NOT NULL,
    status VARCHAR(50) DEFAULT 'pending', -- pending, accepted, expired
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);


ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id INT REFERENCES tenants(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'member';

-- Indexes for Phase 4
CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_usage_logs_tenant ON usage_logs(tenant_id);
CREATE INDEX idx_usage_logs_user ON usage_logs(user_id);
CREATE INDEX idx_usage_logs_created ON usage_logs(created_at);
CREATE INDEX idx_audit_logs_tenant ON audit_logs(tenant_id);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);
CREATE INDEX idx_invitations_email ON invitations(email);
CREATE INDEX idx_invitations_token ON invitations(token);

-- Update users table to include tenant_id (run this for existing databases)


-- Create default tenant for existing users
INSERT INTO tenants (name, domain, plan, is_active) 
VALUES ('Default Organization', 'default', 'pro', true);

-- Note: For existing databases, run: UPDATE users SET tenant_id = 1 WHERE tenant_id IS NULL;
