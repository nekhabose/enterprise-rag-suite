# Remaining Requirements

This document tracks items that are architecturally complete but require additional configuration, integration work, or production hardening before going live.

---

## 🟡 Partially Complete (Stubbed / Needs Integration)

### AI Service — LLM Integration
**File:** `ai-service/main.py`
**Status:** Auth, validation, rate limiting, and routing are complete. LLM calls return placeholder responses.
**What's needed:**
- Wire Groq/OpenAI/Anthropic SDK to `/api/chat` endpoint
- Implement semantic search against pgvector chunks in `chat()` function
- Implement document chunking + embedding pipeline in `ingest_upload()`
- Implement YouTube transcript extraction (yt-dlp or YouTube Transcript API) in `ingest_youtube()`
- Implement quiz generation prompt in `generate_quiz()`
- Implement actual embedding generation in `create_embeddings()` (sentence-transformers installed)

### Email Invitations
**File:** `backend/src/server.ts` — `/tenant-admin/users/invite` route
**Status:** Invitation record created in DB, token generated. Email delivery not wired up.
**What's needed:**
- Integrate email provider (SendGrid, Resend, Nodemailer + SMTP)
- Create invitation email template
- Build invitation acceptance endpoint (`/api/auth/accept-invitation/:token`)

### File Storage
**File:** `backend/src/server.ts` — document upload routes
**Status:** Files saved to local disk (`/uploads`). Not suitable for production.
**What's needed:**
- Integrate S3 / GCS / Azure Blob for document storage
- Update `UPLOADS_DIR` logic to stream to cloud storage
- Add presigned URL generation for secure document access

### Connector Integrations
**File:** `backend/src/server.ts`, `frontend/.../UniversityAdminPortal.tsx`
**Status:** Connector toggle UI and API endpoint exist. OAuth flows not implemented.
**What's needed:**
- Google Drive OAuth flow + Drive API sync
- Dropbox OAuth + Dropbox API
- OneDrive OAuth + Graph API
- Moodle REST API integration

---

## 🔴 Not Yet Implemented

### Refresh Token Revocation / Token Blocklist
**Status:** Refresh tokens stored in httpOnly cookies. Logout clears cookie but doesn't blocklist the token.
**What's needed:**
- Add `refresh_tokens` table or Redis set of revoked `jti` values
- Check blocklist on every refresh attempt

### Malware Scanning
**Status:** File type and size validation are in place. Content-level scanning is not.
**What's needed:**
- Integrate ClamAV or a cloud scanning API (VirusTotal, Cloudmersive) into the upload pipeline
- Block ingestion if scan returns positive

### Password Reset Flow
**Status:** No forgot-password or password-reset endpoints exist.
**What's needed:**
- `POST /api/auth/forgot-password` — generate reset token, send email
- `POST /api/auth/reset-password` — validate token, update hash

### MFA / 2FA
**Status:** Not implemented.
**What's needed:**
- TOTP (Google Authenticator) or email OTP second factor
- Enforce MFA for SUPER_ADMIN and TENANT_ADMIN roles at minimum

### Billing & Plan Enforcement
**Status:** `plan`, `max_users`, `max_storage_gb` stored in tenants table. Not enforced at API level.
**What's needed:**
- Middleware to check `max_users` on user invite
- Middleware to check `max_storage_gb` on document upload
- Billing webhook integration (Stripe recommended)

### Real-time Notifications
**Status:** Not implemented.
**What's needed:**
- WebSocket or SSE endpoint for live alerts (ingestion complete, new assessment, etc.)

### Session Management UI
**Status:** No UI for users to view/revoke active sessions.
**What's needed:**
- Backend: store active sessions with device info, expose `GET /api/auth/sessions` and `DELETE /api/auth/sessions/:id`
- Frontend: Add "Active Sessions" page in user settings

### Document Viewer
**Status:** Documents are listed but not viewable in-browser.
**What's needed:**
- PDF viewer component (react-pdf or iframe with presigned URL)
- Video player for YouTube videos

### Course Enrollment Management
**Status:** `course_enrollments` table exists. No enrollment management UI.
**What's needed:**
- University Admin: bulk enroll students in courses
- Student: self-enroll (if permitted by course settings)

### AI Settings Hot-Reload
**Status:** AI settings saved to DB but AI service reads them at startup.
**What's needed:**
- AI service to read settings per-tenant on each request from DB or Redis cache
- Cache invalidation when tenant admin updates settings

---

## 🔵 Production Hardening Checklist

- [ ] Change all default secrets in `.env.example` before production
- [ ] Enable PostgreSQL SSL/TLS connection
- [ ] Set up database connection pooling (PgBouncer)
- [ ] Configure Nginx rate limiting at reverse proxy level
- [ ] Enable HSTS preloading for all domains
- [ ] Add CSP nonces for inline scripts
- [ ] Set up log aggregation (Datadog, Loki, CloudWatch)
- [ ] Configure APM tracing (OpenTelemetry)
- [ ] Add database read replicas for analytics queries
- [ ] Implement database row-level security (PostgreSQL RLS) as defense-in-depth
- [ ] Add Dependabot or Renovate for dependency updates
- [ ] Run OWASP ZAP against staging before launch
- [ ] Load test with k6 or Artillery before launch
- [ ] Implement Redis for session store and rate limit counters (current: in-memory, not distributed)

---

## Priority Order

1. **LLM integration** — core product functionality
2. **Email delivery** — user onboarding
3. **Refresh token revocation** — security requirement
4. **File cloud storage** — production readiness
5. **Malware scanning** — security requirement
6. **Password reset** — user experience
7. **Billing enforcement** — business requirement
