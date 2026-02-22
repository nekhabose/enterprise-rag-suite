# Integration Test Guide (Strict Groq)

This project includes a strict integration suite:

- File: `tests/integration/security.test.ts`
- Runner config: `backend/jest.integration.config.cjs`
- Script: `npm run test:integration`

## 1) Prerequisites

You must have all services running before tests:

1. PostgreSQL with schema loaded (`database/schema.sql`)
2. AI service running at `http://localhost:8000`
3. Backend running at `http://localhost:3000`
4. Groq key configured in `ai-service/.env`:
   - `GROQ_API_KEY=...`

## 2) Install Test Dependencies

From `backend/`:

```bash
npm install
```

This installs Jest + ts-jest from `backend/package.json` devDependencies.

## 3) Start Services

Terminal A:

```bash
cd ai-service
python main.py
```

Terminal B:

```bash
cd backend
npm run dev
```

## 4) Run Tests

From `backend/`:

```bash
npm run test:integration
```

CI mode (fail fast + compact section summary):

```bash
npm run test:integration:ci
```

Watch mode:

```bash
npm run test:integration:watch
```

## 5) Scope Covered (Strict 200 Path)

- Security / tenant isolation
- RBAC permissions
- Retrieval strategies (`bm25`, `semantic`, `hybrid`)
- Reranking (`enable_reranking` true/false)
- LLM provider path (Groq)
- E2E document->chat and assessment generation

## 6) Common Failures

1. `jest: command not found`
   - Run `cd backend && npm install`

2. `expected 200, got 500` on chat/assessment
   - Confirm AI service is running
   - Confirm `GROQ_API_KEY` is set in `ai-service/.env`
   - Restart AI service after env change

3. DB connection errors
   - Verify `DATABASE_URL` in `backend/.env` and `ai-service/.env`
   - Ensure DB exists and schema is applied
