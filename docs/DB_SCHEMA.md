# Database Schema (Part 5)

## Scope

This schema supports:

- Multiple users (future-ready)
- One Kanban board per user for MVP
- Board stored as versioned JSON

Database engine: PostgreSQL
Runtime target: `docker compose` service `db`

## Tables

### `users`

Purpose: user identities and login names.

```sql
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### `kanban_boards`

Purpose: one board payload per user.

```sql
CREATE TABLE IF NOT EXISTS kanban_boards (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE,
  schema_version INTEGER NOT NULL DEFAULT 1,
  board_json JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

Notes:

- `user_id` is `UNIQUE` to enforce one board per user.
- `board_json` is stored as JSON text (simple MVP path, low query complexity).
- `schema_version` is for board payload migrations later.

## Board JSON Contract (v1)

`kanban_boards.board_json` stores JSON:

```json
{
  "version": 1,
  "board": {
    "columns": [
      {
        "id": "col-backlog",
        "title": "Backlog",
        "cards": [
          {
            "id": "card-1",
            "title": "Example",
            "details": "Example details"
          }
        ]
      }
    ]
  }
}
```

Rules:

- Root `version` must match `schema_version` in table (both `1` for MVP).
- `board.columns` is required and ordered.
- Each column must include `id`, `title`, and `cards`.
- Each card must include `id`, `title`, and `details`.

## Initialization and Migration Strategy

On backend startup:

1. Open PostgreSQL connection from `DATABASE_URL`.
2. Run `CREATE TABLE IF NOT EXISTS` for both tables.
3. Ensure MVP user row exists: username `user`.
4. Ensure one board exists for MVP user:
   - If missing, insert default board payload (version `1`, five columns).
5. Commit transaction.

Migration policy:

- For MVP, use startup SQL scripts only (no external migration tool).
- If schema changes later, increment `schema_version` and add explicit migration functions.
- Board JSON migrations are applied during startup/read path when `version` is older than current.

## Tradeoffs

- JSONB-in-table keeps write path simple for MVP and matches `GET/PUT /api/kanban` full-board replacement.
- This is not optimized for analytics queries by card/column, but acceptable for MVP scope.
- Normalized card/column tables can be introduced later without changing auth/user table design.
