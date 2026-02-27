import json
from typing import Any

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Json


DEFAULT_BOARD: dict[str, Any] = {
    "version": 1,
    "board": {
        "columns": [
            {"id": "col-backlog", "title": "Backlog", "cards": []},
            {"id": "col-discovery", "title": "Discovery", "cards": []},
            {"id": "col-progress", "title": "In Progress", "cards": []},
            {"id": "col-review", "title": "Review", "cards": []},
            {"id": "col-done", "title": "Done", "cards": []},
        ]
    },
}


class KanbanService:
    def __init__(self, database_url: str, mvp_username: str = "user") -> None:
        self.database_url = database_url
        self.mvp_username = mvp_username

    def init(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                  id BIGSERIAL PRIMARY KEY,
                  username TEXT NOT NULL UNIQUE,
                  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS kanban_boards (
                  id BIGSERIAL PRIMARY KEY,
                  user_id BIGINT NOT NULL UNIQUE,
                  schema_version INTEGER NOT NULL DEFAULT 1,
                  board_json JSONB NOT NULL,
                  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                  CONSTRAINT fk_kanban_user
                    FOREIGN KEY(user_id)
                    REFERENCES users(id)
                    ON DELETE CASCADE
                )
                """
            )
            conn.commit()

        self.ensure_user_and_board(self.mvp_username)

    def ensure_user_and_board(self, username: str) -> None:
        with self._connect() as conn:
            user_id = self._get_or_create_user_id(conn, username)
            row = conn.execute(
                "SELECT id FROM kanban_boards WHERE user_id = %s",
                (user_id,),
            ).fetchone()

            if row is None:
                conn.execute(
                    """
                    INSERT INTO kanban_boards (user_id, schema_version, board_json)
                    VALUES (%s, %s, %s)
                    """,
                    (user_id, 1, Json(DEFAULT_BOARD)),
                )
                conn.commit()

    def get_board(self, username: str) -> dict[str, Any]:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT kb.board_json::text AS board_json
                FROM kanban_boards kb
                INNER JOIN users u ON u.id = kb.user_id
                WHERE u.username = %s
                """,
                (username,),
            ).fetchone()

        if row is None:
            self.ensure_user_and_board(username)
            return self.get_board(username)

        return json.loads(row["board_json"])

    def replace_board(self, username: str, board_payload: dict[str, Any]) -> dict[str, Any]:
        if board_payload.get("version") != 1:
            raise ValueError("Board payload version must be 1")

        with self._connect() as conn:
            user_id = self._get_or_create_user_id(conn, username)
            conn.execute(
                """
                INSERT INTO kanban_boards (user_id, schema_version, board_json, updated_at)
                VALUES (%s, %s, %s, NOW())
                ON CONFLICT(user_id)
                DO UPDATE SET
                  schema_version = EXCLUDED.schema_version,
                  board_json = EXCLUDED.board_json,
                  updated_at = NOW()
                """,
                (user_id, 1, Json(board_payload)),
            )
            conn.commit()

        return board_payload

    def _connect(self):
        return psycopg.connect(self.database_url, row_factory=dict_row)

    def _get_or_create_user_id(self, conn, username: str) -> int:
        row = conn.execute("SELECT id FROM users WHERE username = %s", (username,)).fetchone()
        if row is not None:
            return int(row["id"])

        created = conn.execute(
            "INSERT INTO users (username) VALUES (%s) RETURNING id",
            (username,),
        ).fetchone()
        if created is None:
            raise RuntimeError("Failed to create user")
        conn.commit()
        return int(created["id"])
