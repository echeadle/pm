# Changelog

## v0.1.0-mvp - 2026-02-22

### Added

- Full Docker Compose runtime with `web` (FastAPI + static Next.js) and `db` (PostgreSQL).
- Auth endpoints and MVP login flow (`user` / `password`).
- Persistent Kanban API with PostgreSQL-backed board storage.
- AI routes for ping and Kanban-aware chat updates.
- Frontend auth gate, Kanban board editing/drag-drop, and AI sidebar integration.
- Cross-platform scripts for start/stop/smoke checks.
- GitHub Actions CI for backend tests, frontend unit tests, and Docker-based E2E.

### Changed

- Playwright now targets Docker-served app on `http://127.0.0.1:8000` by default.
- Drag/drop ergonomics improved for easier cross-column moves.
- Layout updated so board header is full width and AI sidebar aligns with the columns row.
- FastAPI startup initialization migrated from deprecated `@app.on_event("startup")` to lifespan.

### Validation

- Backend tests: 15 passed.
- Frontend unit tests: 10 passed.
- Playwright E2E: 3 passed.
