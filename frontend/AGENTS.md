# Frontend AGENTS.md

## Overview

The frontend is a Next.js App Router project in `frontend/` with the main UI under `frontend/src/`.
It renders a Kanban board with editable column titles, drag-and-drop cards, and add/delete card actions.
Current state is still frontend-first and not fully wired to authenticated backend APIs.

## Directory map and responsibilities

- `frontend/src/app/layout.tsx`
  - Global app shell and metadata.
- `frontend/src/app/page.tsx`
  - Home route (`/`) that renders `<KanbanBoard />`.
- `frontend/src/app/globals.css`
  - Global design tokens and styling.
- `frontend/src/components/KanbanBoard.tsx`
  - Main board state and drag-and-drop orchestration.
  - Tries to fetch `/api/kanban`; falls back to `http://127.0.0.1:8001/api/kanban`; falls back to local demo state.
- `frontend/src/components/KanbanColumn.tsx`
  - Column UI, title edit, and card list.
- `frontend/src/components/KanbanCard.tsx`
  - Full card item UI and delete action.
- `frontend/src/components/KanbanCardPreview.tsx`
  - Drag preview card.
- `frontend/src/components/NewCardForm.tsx`
  - Add-card form per column.
- `frontend/src/lib/kanban.ts`
  - Pure board data types, seed data, id generation, and card move helper.

## Tests

- `frontend/src/lib/kanban.test.ts`
  - Unit tests for move/reorder behavior.
- `frontend/src/components/KanbanBoard.test.tsx`
  - Component tests for render, rename, add, and delete flows.
- `frontend/tests/kanban.spec.ts`
  - Playwright E2E smoke for loading, add card, and drag/move behavior.
- `frontend/src/test/setup.ts`
  - Vitest setup.

## Developer workflows

Run from `frontend/`:

- `npm install`
- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run lint`
- `npm run test` (unit/component via Vitest)
- `npm run test:e2e` (Playwright)
- `npm run test:all`

## Integration notes for upcoming parts

- Replace fallback demo fetching in `frontend/src/components/KanbanBoard.tsx` with authenticated API calls.
- Add login gate UI at `/` before showing the board.
- Add AI chat sidebar component and backend-backed chat actions in later parts.
