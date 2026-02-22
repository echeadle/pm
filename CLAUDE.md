# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Project Management web app with a Kanban board and AI chat sidebar. Full-stack monorepo: Next.js static frontend served by a Python FastAPI backend, packaged in Docker with PostgreSQL.

MVP auth: hardcoded credentials (`user`/`password`), cookie-based sessions.

## Architecture

```
Next.js (static export) → FastAPI (port 8000) → PostgreSQL 16
                                ↓
                         OpenAI gpt-4o-mini
```

- **Frontend** (`frontend/`): Next.js 16 with App Router, React 19, TypeScript, Tailwind CSS 4, dnd-kit for drag-and-drop. Built as static export (`output: "export"`) and served by FastAPI at `/`.
- **Backend** (`backend/`): FastAPI with raw SQL via psycopg (no ORM). Board state stored as JSONB in PostgreSQL. Single `main.py` has routes, auth, AI integration. `service.py` has DB operations. `ai_client.py` wraps OpenAI.
- **Board sync**: Full board replacement model via `GET /api/kanban` and `PUT /api/kanban` (not granular patches). Frontend does optimistic updates.
- **Docker**: Multi-stage Dockerfile (Node build → Python runtime). Compose runs `web` + `db` services. Secrets loaded from `secrets/` directory (git-ignored).

## Build and Run Commands

### Docker (primary workflow)
```bash
./scripts/start.sh          # Build and start containers
./scripts/stop.sh           # Stop containers
./scripts/smoke.sh          # Validate endpoints after startup
docker compose exec -T web pytest -q backend/tests  # Run backend tests in container
```

### Backend (Python)
```bash
pytest -q backend/tests                              # All tests
pytest backend/tests/test_api.py                     # Specific file
pytest backend/tests/test_api.py::test_auth_required_for_kanban  # Specific test
```

### Frontend (from `frontend/` directory)
```bash
npm install                  # Install dependencies
npm run dev                  # Dev server on :3000
npm run build                # Static export to ./out
npm run lint                 # ESLint
npm run test:unit            # Vitest (unit tests)
npm run test:unit:watch      # Vitest watch mode
npm run test:unit -- kanban.test.ts   # Specific test file
npm run test:e2e             # Playwright (needs backend running on :8000)
npm run test:e2e -- --headed # Playwright with visible browser
npm run test:all             # Unit + E2E
```

### CI (GitHub Actions)
Runs on push to main and PRs: backend pytest, frontend unit tests, Docker E2E with Playwright.

## Key Files

| File | Purpose |
|------|---------|
| `backend/main.py` | FastAPI app, all routes, auth, AI endpoints, static serving |
| `backend/service.py` | KanbanService: DB queries, schema init, board CRUD |
| `backend/ai_client.py` | OpenAI wrapper with retry logic and JSON parsing |
| `frontend/src/app/page.tsx` | Main page: login form, board, AI sidebar |
| `frontend/src/components/KanbanBoard.tsx` | Board container with drag-drop logic |
| `frontend/src/lib/kanban.ts` | Board state logic, normalization, move operations |
| `docs/PLAN.md` | Implementation plan with atomic tasks |
| `docs/DB_SCHEMA.md` | PostgreSQL schema and board JSON contract |

## Conventions

- No emojis in code or docs
- No over-engineering; keep it simple
- Use latest library versions and idiomatic approaches
- Identify root cause with evidence before fixing issues
- Python uses `uv` as package manager (in Docker)
- Color scheme: Accent Yellow `#ecad0a`, Blue Primary `#209dd7`, Purple Secondary `#753991`, Dark Navy `#032147`, Gray Text `#888888`

## Database

PostgreSQL with two tables: `users` and `kanban_boards`. Board stored as JSONB with schema version. Five canonical columns: Backlog, Discovery, In Progress, Review, Done. DB init retries 30 times on startup (Docker race condition handling).

## Secrets

- `secrets/kanban.secrets.env`: Postgres credentials and OpenAI key file path
- `secrets/openai_api_key.txt`: OpenAI API key
- Both git-ignored; required for Docker Compose
