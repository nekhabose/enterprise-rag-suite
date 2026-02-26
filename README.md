# Enterprise LMS Platform — RBAC Implementation

Full-stack, multi-tenant Learning Management System with role-based access control, three separate portals, and AI-powered tutoring.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (React)                      │
│  ┌──────────────┐  ┌──────────────────┐  ┌──────────────┐  │
│  │  Super Admin │  │  University Admin│  │ User Portal  │  │
│  │   Portal     │  │     Portal       │  │ (Faculty /   │  │
│  │ /super-admin │  │ /university-admin│  │  Student)    │  │
│  └──────────────┘  └──────────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────────┘
         │                     │                    │
         └─────────────────────▼────────────────────┘
                        Backend (Node.js / Express)
                        ┌──────────────────────────┐
                        │  JWT Auth + RBAC Middleware│
                        │  Tenant Isolation Layer   │
                        │  Rate Limiting & Audit Log│
                        └──────────────┬───────────┘
                                       │
               ┌───────────────────────┴───────────────────────┐
               │                                               │
    ┌──────────▼──────────┐                        ┌──────────▼──────────┐
    │ PostgreSQL + pgvector│                        │  AI Service (FastAPI)│
    │  Users, Tenants,     │                        │  Chat, Embeddings,  │
    │  Documents, Chunks   │                        │  Quiz Gen, Ingestion│
    └──────────────────────┘                        └──────────────────────┘
```

---

## Roles & Permissions

| Role             | Scope      | Key Permissions                                        |
| ---------------- | ---------- | ------------------------------------------------------ |
| `SUPER_ADMIN`    | Global     | All permissions including impersonation, tenant CRUD   |
| `INTERNAL_ADMIN` | Global     | Read all tenants, users, analytics, audit logs         |
| `INTERNAL_STAFF` | Global     | Read platform dashboard and tenant overview            |
| `TENANT_ADMIN`   | Per-tenant | Full management of their university                    |
| `FACULTY`        | Per-tenant | Course/content management, student analytics           |
| `STUDENT`        | Per-tenant | Read courses, documents, use AI chat, take assessments |

### 28 Granular Permissions

**Global scope:** `GLOBAL_DASHBOARD_READ`, `TENANT_CREATE`, `TENANT_READ`, `TENANT_UPDATE`, `TENANT_DELETE`, `INTERNAL_USER_READ`, `INTERNAL_USER_WRITE`, `IMPERSONATE_TENANT_ADMIN`, `AUDIT_LOG_READ`, `GLOBAL_ANALYTICS_READ`

**Tenant scope:** `TENANT_USER_READ`, `TENANT_USER_WRITE`, `COURSE_READ`, `COURSE_WRITE`, `KB_READ`, `KB_WRITE`, `CONNECTOR_CONFIGURE`, `AI_SETTINGS_UPDATE`, `TENANT_ANALYTICS_READ`, `DOCUMENT_READ`, `DOCUMENT_WRITE`, `DOCUMENT_DELETE`, `VIDEO_READ`, `VIDEO_WRITE`, `ASSESSMENT_READ`, `ASSESSMENT_WRITE`, `CHAT_USE`, `STUDENT_PROGRESS_READ`

---

## Quick Start

### Prerequisites

- Node.js 20+
- Python 3.11+
- Docker & Docker Compose (recommended)
- PostgreSQL 16 with pgvector (included in Docker setup)

### Option A: Docker Compose (Recommended)

```bash
# Clone/extract the project
cd lms-rbac

# Start all services
docker-compose up -d

# Wait ~30 seconds for DB initialization, then open:
open http://localhost:3000
```

### Option B: Manual Setup

#### 1. Database

```bash
# Start PostgreSQL with pgvector
docker run -d \
  --name lms-postgres \
  -e POSTGRES_USER=lms_user \
  -e POSTGRES_PASSWORD=lms_pass \
  -e POSTGRES_DB=lms_db \
  -p 5432:5432 \
  pgvector/pgvector:pg16

# Run schema
psql postgresql://lms_user:lms_pass@localhost:5432/lms_db < database/schema.sql
```

#### 2. Backend

```bash
cd backend
cp .env.example .env
# Edit .env with your values

npm install
npm run dev
# Runs on http://localhost:3001
```

#### 3. AI Service

```bash
cd ai-service
cp .env.example .env
# Edit .env — JWT_SECRET must match backend's JWT_SECRET

python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
# Runs on http://localhost:8000
```

#### 4. Frontend

```bash
cd frontend
npm install
npm run dev
# Runs on http://localhost:3000
```

#### 5. Build / Lint / Basic Validation

```bash
# Backend
cd backend
npm run build
npm run lint

# Frontend
cd ../frontend
npm run build

# AI Service (syntax validation)
cd ../ai-service
./.venv/bin/python -m py_compile main.py
```

Note: scaffold integration/unit test files and related Jest config were removed during cleanup. The repository currently ships build/lint/syntax validation commands only.

### Refactored Modular Structure (In-Place)

#### Frontend

- `frontend/src/shared/ui/theme.css` central teal design tokens
- `frontend/src/shared/api/client.ts` shared API client and token refresh logic
- `frontend/src/shared/auth/rbac.ts` role and permission helper registry
- `frontend/src/shared/auth/RouteGuards.tsx` auth/role/permission route guards
- `frontend/src/shared/auth/useAuth.tsx` normalized auth state logic
- `frontend/src/hooks/useAuth.tsx` compatibility wrapper export
- `frontend/src/utils/api.ts` compatibility wrapper export

#### Backend

- `backend/src/infrastructure/config/env.ts` centralized env loading
- `backend/src/infrastructure/db/tenantScope.ts` tenant scoping helpers
- `backend/src/infrastructure/logging/auditLogger.ts` reusable audit logging service
- `backend/src/policies/rbac.ts` centralized role-permission registry and checks
- `backend/src/middleware/types.ts` shared authenticated request type
- `backend/src/middleware/tenantIsolation.ts` reusable tenant-isolation middleware
- `backend/src/modules/courses/*` modular repository/service/controller/schema scaffolding
- `backend/src/server.ts` still preserves existing routes but now imports centralized RBAC/config/logging

#### AI Service

- `ai-service/src/config/settings.py` AI/RAG runtime config
- `ai-service/src/rag/chunking/*` chunking interfaces and adapters
- `ai-service/src/rag/embedding/*` embedding interfaces and adapters
- `ai-service/src/rag/vector/*` vector-store interfaces and adapters
- `ai-service/src/rag/retrieval/*` retrieval interfaces and adapters
- `ai-service/src/rag/rerank/*` rerank interfaces and adapters
- `ai-service/src/rag/llm/*` LLM interfaces and adapters
- `ai-service/src/rag/ingest/pipeline.py` ingestion pipeline
- `ai-service/src/rag/orchestration/*` pluggable orchestrator
- `ai-service/main.py` now routes chat/ingest/embeddings through modular orchestration

---

## Demo Accounts

| Role             | Email                     | Password           | Portal            |
| ---------------- | ------------------------- | ------------------ | ----------------- |
| Super Admin      | superadmin@platform.local | `SAdm!2026#T7kL`   | /super-admin      |
| University Admin | admin@state.edu           | `TA  dm!2026#P4qN` | /university-admin |
| Faculty          | faculty@state.edu         | `Fac!2026#R8mV`    | /portal           |
| Student          | student@state.edu         | `Stu!2026#W2xJ`    | /portal           |

---

## Security Features Implemented

### Authentication & Token Handling

- Short-lived access tokens (8h) + rotating refresh tokens (7d, httpOnly cookie)
- JWT validated with issuer/audience claims + expiry enforcement
- Refresh token rotation with automatic access token renewal
- Token revocation via `jti` tracking in logout flow

### RBAC & Tenant Isolation

- Role-permission matrix enforced at API middleware layer (not just UI)
- Tenant ID extracted from trusted JWT claim only — never user-provided body field
- Object-level authorization: every resource access verified against requesting user's tenant
- IDOR prevention: all IDs validated against tenant scope before response

### Impersonation (Super Admin Only)

- Time-limited impersonation sessions (default 60 min, configurable)
- Full audit trail: impersonator, target, reason, timestamps
- Impersonation token explicitly marked in claims (`isImpersonating: true`)
- One-click session termination

### Input Validation & Injection Prevention

- Request schema validation via `express-validator` on all routes
- Parameterized queries only (no raw string interpolation in SQL)
- File upload restrictions: allowlist of extensions + MIME check + size limit (50MB default)
- YouTube URL validation before ingestion

### Rate Limiting

- Global: 300 req/15min
- Auth endpoints: 5 attempts/15min (login brute-force protection)
- AI chat: 30/min per user
- Document ingest: 10/min

### Security Headers

- `helmet()` sets: CSP, HSTS, X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy
- CORS: allowlist-only, credentials mode

### Logging & Auditing

- Structured JSON logs via `winston` (backend) and `structlog` (AI service)
- Correlation IDs on every request (`X-Correlation-ID`)
- Security events logged: failed auth, permission denials, impersonation, user CRUD
- Audit log table with tenant scope, user, action, resource, IP, user-agent

### Secrets Management

- All secrets in environment variables (never hardcoded)
- `.env.example` provided, `.env` in `.gitignore`
- Internal service-to-service auth via shared secret (`X-Internal-Secret` header)

---

## API Reference

### Auth

| Method | Path                | Description                 |
| ------ | ------------------- | --------------------------- |
| POST   | `/api/auth/login`   | Login, returns access token |
| POST   | `/api/auth/logout`  | Invalidate refresh token    |
| POST   | `/api/auth/refresh` | Refresh access token        |
| GET    | `/api/auth/me`      | Current user profile        |

### Super Admin

| Method | Path                               | Permission                 |
| ------ | ---------------------------------- | -------------------------- |
| GET    | `/api/super-admin/dashboard`       | `GLOBAL_DASHBOARD_READ`    |
| GET    | `/api/super-admin/tenants`         | `TENANT_READ`              |
| POST   | `/api/super-admin/tenants`         | `TENANT_CREATE`            |
| PUT    | `/api/super-admin/tenants/:id`     | `TENANT_UPDATE`            |
| DELETE | `/api/super-admin/tenants/:id`     | `TENANT_DELETE`            |
| GET    | `/api/super-admin/internal-users`  | `INTERNAL_USER_READ`       |
| POST   | `/api/super-admin/internal-users`  | `INTERNAL_USER_WRITE`      |
| POST   | `/api/super-admin/impersonate`     | `IMPERSONATE_TENANT_ADMIN` |
| POST   | `/api/super-admin/impersonate/end` | Auth required              |
| GET    | `/api/super-admin/audit-logs`      | `AUDIT_LOG_READ`           |
| GET    | `/api/super-admin/analytics`       | `GLOBAL_ANALYTICS_READ`    |

### University Admin

| Method | Path                             | Permission            |
| ------ | -------------------------------- | --------------------- |
| GET    | `/api/tenant-admin/dashboard`    | `TENANT_USER_READ`    |
| GET    | `/api/tenant-admin/users`        | `TENANT_USER_READ`    |
| POST   | `/api/tenant-admin/users/invite` | `TENANT_USER_WRITE`   |
| PUT    | `/api/tenant-admin/users/:id`    | `TENANT_USER_WRITE`   |
| DELETE | `/api/tenant-admin/users/:id`    | `TENANT_USER_WRITE`   |
| GET    | `/api/tenant-admin/courses`      | `COURSE_READ`         |
| POST   | `/api/tenant-admin/courses`      | `COURSE_WRITE`        |
| PUT    | `/api/tenant-admin/ai-settings`  | `AI_SETTINGS_UPDATE`  |
| PUT    | `/api/tenant-admin/connectors`   | `CONNECTOR_CONFIGURE` |

### User Portal

| Method | Path                                 | Permission                        |
| ------ | ------------------------------------ | --------------------------------- |
| GET    | `/api/portal/courses`                | `COURSE_READ`                     |
| POST   | `/api/portal/chat`                   | `CHAT_USE`                        |
| GET    | `/api/portal/assessments`            | `ASSESSMENT_READ`                 |
| POST   | `/api/portal/assessments/:id/submit` | `ASSESSMENT_READ`                 |
| POST   | `/api/portal/assessments`            | `ASSESSMENT_WRITE` (Faculty)      |
| GET    | `/api/portal/student-progress`       | `STUDENT_PROGRESS_READ` (Faculty) |

---

## File Structure

```
lms-rbac/
├── database/
│   └── schema.sql              # Full PostgreSQL schema with seed data
├── backend/
│   ├── src/
│   │   └── server.ts           # Express server: auth, RBAC, all routes
│   ├── package.json
│   ├── tsconfig.json
│   ├── Dockerfile
│   └── .env.example
├── ai-service/
│   ├── main.py                 # FastAPI with full auth middleware
│   ├── middleware/
│   │   └── auth.py             # JWT validation, RBAC, tenant scope
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── App.tsx             # Router: 3 portals + login
│   │   ├── main.tsx
│   │   ├── hooks/
│   │   │   └── useAuth.ts      # Auth context with JWT refresh
│   │   ├── utils/
│   │   │   └── api.ts          # Typed API clients for all portals
│   │   ├── components/
│   │   │   ├── auth/
│   │   │   │   └── Login.tsx   # Shared login page
│   │   │   └── shared/
│   │   │       ├── UI.tsx      # Reusable components library
│   │   │       └── SidebarLayout.tsx
│   │   └── portals/
│   │       ├── SuperAdminPortal.tsx
│   │       ├── UniversityAdminPortal.tsx
│   │       └── UserPortal.tsx
│   ├── package.json
│   ├── vite.config.ts
│   ├── Dockerfile
│   └── nginx.conf
├── docker-compose.yml
└── README.md
```
