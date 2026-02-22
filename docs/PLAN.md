# Project Plan

## Final Status (2026-02-22)

Overall status: MVP complete for planned Parts 2 through 10.

Completed implementation areas:

- Dockerized runtime with two services (`web` + `db`) and persistent PostgreSQL volume.
- Backend auth (`user` / `password`), Kanban read/write API, and AI routes (`/api/ai/ping`, `/api/ai/chat`).
- Frontend login gate, Kanban interactions (rename/add/delete/move), backend persistence, and AI sidebar.
- Cross-platform start/stop/smoke scripts in `scripts/`.
- Database schema and contract docs in `docs/DB_SCHEMA.md`.

Final validation run:

- Backend tests in container: `docker compose exec -T web pytest -q backend/tests` -> 15 passed.
- Frontend unit tests: `npm run test:unit` -> 10 passed.
- Frontend E2E tests against Docker app (`http://127.0.0.1:8000`): `npm run test:e2e` -> 3 passed.

Accepted warning/debt:

- FastAPI deprecation warning for `@app.on_event("startup")` in `backend/main.py` (functional, but should migrate to lifespan handlers in a follow-up).

## Part 1: Plan (Detailed)

### Goal

Produce a concrete, testable implementation plan and validate the current frontend baseline before proceeding with scaffolding and full integration work.

### Deliverables

- `frontend/AGENTS.md` updated with accurate structure, tests, and workflows.
- `docs/PLAN.md` updated with atomic tasks, rough estimates, and success criteria for Parts 2..10.
- Frontend baseline checks run and reported (`npm run test`, `npm run build`).
- Approval checklist captured below.

### Part 1 checklist

1. Inventory frontend codebase and workflows. (0.5h)
2. Update `frontend/AGENTS.md` with responsibilities and exact commands. (0.5h)
3. Expand Parts 2..10 into atomic tasks with estimates and tests. (1.5h)
4. Run frontend baseline checks (`test`, `build`) and record status. (0.5h)
5. Request approval to start Part 2 implementation. (0.1h)

### Part 1 success criteria

- `frontend/AGENTS.md` matches actual source layout under `frontend/src`.
- Every Part (2..10) includes 3–8 atomic tasks and at least one verifiable test/success criterion.
- Frontend unit tests and build both pass.
- Explicit user choice captured: approve or request plan changes.

## Implementation Order (Updated)

Execution sequence:

1. Part 2: Scaffolding
2. Part 3: Add Frontend (Static Build Served by Backend)
3. Part 4: Fake User Sign-In Experience
4. Part 5: Database Modeling
5. Part 5.5: Two-Container Runtime (Web + PostgreSQL)
6. Part 6: Backend (Persistent Kanban API)
7. Part 7: Frontend + Backend Integration
8. Part 8: AI Connectivity
9. Part 9: AI Kanban-Aware Structured Outputs
10. Part 10: AI Sidebar UI + Board Sync

Notes:

- Part 5.5 is now a required prerequisite for Part 6 implementation.
- Any temporary single-container or non-PostgreSQL persistence work should be replaced/updated to match Part 5.5 before advancing.

## Part 2: Scaffolding

### Atomic tasks

1. Define container runtime contract (ports, env vars, working dirs). (0.5h)
2. Build Dockerfile for FastAPI backend + static frontend artifact serving. (1.0h)
3. Add FastAPI app bootstrap with `/hello` and a sample API route (`/api/kanban`). (0.8h)
4. Add static serving path to prove backend can host HTML at `/`. (0.6h)
5. Add cross-platform start/stop scripts in `scripts/` and document usage. (0.8h)
6. Add a smoke integration check script for `/` and `/hello`. (0.8h)

### Tests and success criteria

- `docker build` succeeds.
- `scripts/start.*` starts server and `scripts/stop.*` stops it cleanly.
- `GET /` returns HTML 200.
- `GET /hello` returns JSON 200 with expected payload.
- `GET /api/kanban` returns valid board JSON shape.

## Part 3: Add Frontend (Static Build Served by Backend)

### Atomic tasks

1. Configure Next.js production build output for backend static serving target. (1.0h)
2. Add build step that produces frontend artifacts consumed by FastAPI. (0.8h)
3. Mount frontend static assets and route `/` to built app shell. (1.0h)
4. Preserve API routes under `/api/*` without static routing conflicts. (0.8h)
5. Add integration test for combined backend+frontend serve path. (1.0h)

### Tests and success criteria

- `npm run build` succeeds in `frontend/`.
- Backend serves built frontend at `/` with no missing asset errors.
- `GET /api/kanban` remains reachable while static frontend is enabled.
- Integration smoke test passes for page load + API request.

## Part 4: Fake User Sign-In Experience

### Atomic tasks

1. Add login view at `/` requiring credentials `user` / `password`. (0.8h)
2. Implement minimal backend auth endpoint with hardcoded validation. (0.8h)
3. Store auth state in secure cookie/session token for MVP scope. (1.0h)
4. Gate Kanban rendering behind auth state and add logout action. (0.8h)
5. Add unit/component tests for login form validation and auth gate. (0.8h)
6. Add E2E scenario: unauthenticated -> login -> board visible -> logout. (1.0h)

### Tests and success criteria

- Wrong credentials keep user blocked with clear error.
- Valid credentials show board.
- Logout clears auth and returns to login screen.
- E2E login/logout smoke test passes.

## Part 5: Database Modeling

### Atomic tasks

1. Propose PostgreSQL schema for users and one-board-per-user JSON storage. (0.8h)
2. Write schema doc in `docs/` with rationale/tradeoffs. (0.8h)
3. Define migration/init strategy when DB file does not exist. (0.8h)
4. Define serialization contract for board JSON and versioning field. (0.8h)
5. Request user sign-off before data-layer coding. (0.2h)

### Tests and success criteria

- Schema doc explicitly maps to MVP requirements and future multi-user support.
- JSON board payload structure is versioned and documented.
- User explicitly approves schema direction before Part 6 implementation.

## Part 5.5: Two-Container Runtime (Web + Database)

### Atomic tasks

1. Define container split: web app container + PostgreSQL container. (0.6h)
2. Add Docker Compose config with service networking and persistent DB volume. (1.0h)
3. Add backend DB connection config via env vars (`DATABASE_URL`, credentials, host, port). (0.8h)
4. Update start/stop scripts to use Compose lifecycle for both containers. (0.8h)
5. Add migration/init bootstrap path for first-run PostgreSQL schema creation. (0.8h)
6. Add compose smoke check validating app container can read/write DB container. (0.8h)

### Tests and success criteria

- `docker compose up --build` starts both containers successfully.
- App can connect to PostgreSQL over container network.
- DB data persists across container restarts via volume.
- Smoke test validates `/api/kanban` read/write with database-backed persistence.

## Part 6: Backend (Persistent Kanban API)

### Atomic tasks

1. Add DB initialization on startup (`create if not exists`) against configured DB backend. (1.0h)
2. Implement user bootstrap for MVP login user. (0.6h)
3. Implement `GET /api/kanban` reading board JSON by authenticated user. (1.0h)
4. Implement `PUT /api/kanban` replacing board JSON for authenticated user. (1.0h)
5. Add backend service layer for DB I/O and validation. (1.0h)
6. Add pytest unit tests for service logic and route tests for auth/validation. (1.5h)

### Tests and success criteria

- Database schema is initialized automatically on first startup.
- First valid login user has a default board record.
- `GET` and `PUT` persist and return the same board data.
- Backend pytest suite passes.

## Part 7: Frontend + Backend Integration

### Atomic tasks

1. Replace local board initialization with authenticated API fetch. (0.8h)
2. Persist board mutations (rename/move/add/delete) via backend API. (1.2h)
3. Add optimistic update with rollback on failed save. (1.0h)
4. Show minimal error/loading states for fetch/save failures. (0.8h)
5. Add integration tests for persistence across page reloads. (1.2h)
6. Add E2E scenario for move/edit/add/delete with persisted results. (1.2h)

### Tests and success criteria

- Board edits survive page reload.
- Failed API write does not silently lose state.
- Integration and E2E persistence tests pass.

## Part 8: AI Connectivity

### Atomic tasks

1. Add backend OpenAI client setup using `OPENAI_API_KEY`. (0.8h)
2. Pin model to `openai/gpt-4o-mini` in config. (0.4h)
3. Add `POST /api/ai/ping` route issuing a simple prompt (`2+2`). (0.8h)
4. Add timeout/error handling for missing key and provider failures. (0.8h)
5. Add backend tests with mocked OpenAI client responses. (1.2h)

### Tests and success criteria

- With valid key, `/api/ai/ping` returns expected AI response payload.
- Without key, API returns clear 4xx/5xx error and message.
- Mocked AI tests pass in CI without real network calls.

## Part 9: AI Kanban-Aware Structured Outputs

### Atomic tasks

1. Define structured response schema: assistant reply + optional board update. (1.0h)
2. Build prompt contract including board JSON + conversation history + user message. (1.0h)
3. Add `POST /api/ai/chat` route validating and returning structured output. (1.2h)
4. Enforce schema parsing/validation before applying board updates. (1.0h)
5. Add tests for valid update, no-update response, and malformed model output. (1.5h)

### Tests and success criteria

- API always returns schema-compliant response object.
- Optional board update is rejected if invalid and does not corrupt DB.
- Route tests cover happy path and malformed output path.

## Part 10: AI Sidebar UI + Board Sync

### Atomic tasks

1. Add sidebar chat layout integrated with existing Kanban page. (1.0h)
2. Add chat message state + history rendering in frontend. (1.0h)
3. Connect sidebar to `/api/ai/chat` and show assistant responses. (1.0h)
4. Apply returned board updates to local state and persist via backend API. (1.2h)
5. Add UX states (sending, error, retry) for chat operations. (0.8h)
6. Add E2E test for chat-driven card update and auto-refresh board state. (1.5h)

### Tests and success criteria

- User can open sidebar and chat without breaking board interactions.
- AI response appears in thread and board updates apply automatically when present.
- End-to-end scenario validates AI-triggered card movement/editing.

## Cross-cutting test strategy

1. Backend unit + route tests with `pytest`.
2. Frontend unit/component tests with `vitest`.
3. E2E smoke with Playwright:
   - Load `/`
   - Login with `user` / `password`
   - Verify Kanban appears
   - Perform a board mutation
   - Verify persisted state after reload
4. Integration smoke for containerized run path (`/`, `/hello`, `/api/kanban`, auth flow).
5. Compose integration smoke for two-container runtime (`web` + `postgres`).

## Approval checklist

Choose one:

- Approve and proceed to Part 2.
- Request changes to this plan (list requested changes).
