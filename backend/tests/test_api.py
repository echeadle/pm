import os
from copy import deepcopy

from fastapi.testclient import TestClient

from backend.main import app
from backend.service import DEFAULT_BOARD


class FakeKanbanService:
    def __init__(self) -> None:
        self.board = deepcopy(DEFAULT_BOARD)

    def get_board(self, username: str):
        return self.board

    def replace_board(self, username: str, board_payload):
        self.board = board_payload
        return board_payload


def _login(client: TestClient, username: str = "user", password: str = "password") -> None:
    response = client.post(
        "/api/auth/login",
        json={"username": username, "password": password},
    )
    assert response.status_code == 200


def test_auth_required_for_kanban() -> None:
    os.environ["PM_SKIP_DB_INIT"] = "1"
    app.state.kanban_service = FakeKanbanService()

    with TestClient(app) as client:
        response = client.get("/api/kanban")

    assert response.status_code == 401


def test_get_kanban_after_login() -> None:
    os.environ["PM_SKIP_DB_INIT"] = "1"
    app.state.kanban_service = FakeKanbanService()

    with TestClient(app) as client:
        _login(client)
        response = client.get("/api/kanban")

    assert response.status_code == 200
    body = response.json()
    assert body["version"] == 1
    assert len(body["board"]["columns"]) == 5


def test_put_kanban_persists_and_returns_payload() -> None:
    os.environ["PM_SKIP_DB_INIT"] = "1"
    app.state.kanban_service = FakeKanbanService()

    payload = {
        "version": 1,
        "board": {
            "columns": [
                {
                    "id": "col-backlog",
                    "title": "Backlog",
                    "cards": [
                        {
                            "id": "card-xyz",
                            "title": "Persisted card",
                            "details": "From route test",
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

    with TestClient(app) as client:
        _login(client)
        put_response = client.put("/api/kanban", json=payload)
        get_response = client.get("/api/kanban")

    assert put_response.status_code == 200
    assert put_response.json() == payload
    assert get_response.status_code == 200
    assert get_response.json() == payload


def test_put_kanban_rejects_invalid_payload() -> None:
    os.environ["PM_SKIP_DB_INIT"] = "1"
    app.state.kanban_service = FakeKanbanService()

    with TestClient(app) as client:
        _login(client)
        response = client.put("/api/kanban", json={"version": 2, "board": {"columns": []}})

    assert response.status_code == 422
