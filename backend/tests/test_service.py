import os
import uuid

import pytest

from backend.service import KanbanService


def _database_url() -> str:
    return os.getenv("TEST_DATABASE_URL") or os.getenv("DATABASE_URL", "")


@pytest.mark.skipif(not _database_url(), reason="No postgres test database configured")
def test_service_init_bootstraps_user_and_board() -> None:
    service = KanbanService(_database_url())
    service.init()

    username = f"user-{uuid.uuid4().hex[:8]}"
    service.ensure_user_and_board(username)
    board = service.get_board(username)

    assert board["version"] == 1
    assert len(board["board"]["columns"]) == 5


@pytest.mark.skipif(not _database_url(), reason="No postgres test database configured")
def test_replace_board_persists_payload() -> None:
    service = KanbanService(_database_url())
    service.init()

    username = f"user-{uuid.uuid4().hex[:8]}"
    payload = {
        "version": 1,
        "board": {
            "columns": [
                {
                    "id": "col-backlog",
                    "title": "Backlog",
                    "cards": [
                        {
                            "id": "card-1",
                            "title": "Test Card",
                            "details": "Saved to postgres",
                        }
                    ],
                },
                {"id": "col-discovery", "title": "Discovery", "cards": []},
                {"id": "col-progress", "title": "In Progress", "cards": []},
                {"id": "col-review", "title": "Review", "cards": []},
                {"id": "col-done", "title": "Done", "cards": []},
            ]
        },
    }

    service.replace_board(username, payload)
    reloaded = service.get_board(username)

    assert reloaded == payload


def test_replace_board_rejects_invalid_version_without_db_roundtrip() -> None:
    service = KanbanService("postgresql://invalid")
    with pytest.raises(ValueError):
        service.replace_board("user", {"version": 2, "board": {"columns": []}})
