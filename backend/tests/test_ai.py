import os
from copy import deepcopy

from fastapi.testclient import TestClient

from backend.main import app
from backend.service import DEFAULT_BOARD


class FakeAIClientSuccess:
    def ping(self) -> str:
        return "4"


class FakeAIClientFailure:
    def ping(self) -> str:
        raise RuntimeError("provider unavailable")


class FakeKanbanService:
    def __init__(self) -> None:
        self.board = deepcopy(DEFAULT_BOARD)

    def get_board(self, username: str):
        return self.board

    def replace_board(self, username: str, board_payload):
        self.board = board_payload
        return board_payload


class FakeAIClientChatNoUpdate:
    def chat(self, board_payload, history, user_message):
        return {"assistant_message": "No changes applied.", "board_update": None}

    def ping(self) -> str:
        return "4"


class FakeAIClientChatWithUpdate:
    def chat(self, board_payload, history, user_message):
        updated = deepcopy(board_payload)
        updated["board"]["columns"][0]["title"] = "Backlog Updated"
        return {"assistant_message": "Updated the first column title.", "board_update": updated}

    def ping(self) -> str:
        return "4"


class FakeAIClientChatMalformed:
    def chat(self, board_payload, history, user_message):
        return {"bad": "shape"}

    def ping(self) -> str:
        return "4"


class FakeAIClientChatDropsCards:
    def chat(self, board_payload, history, user_message):
        # Simulates model returning a schema-valid board that accidentally drops cards.
        return {
            "assistant_message": "Moved the requested card.",
            "board_update": {
                "version": 1,
                "board": {
                    "columns": [
                        {"id": "col-backlog", "title": "AI Backlog", "cards": []},
                        {"id": "col-discovery", "title": "Discovery", "cards": []},
                        {"id": "col-progress", "title": "In Progress", "cards": []},
                        {
                            "id": "col-review",
                            "title": "Review",
                            "cards": [
                                {
                                    "id": "card-moved",
                                    "title": "Moved Card Title",
                                    "details": "Only moved card left",
                                }
                            ],
                        },
                        {"id": "col-done", "title": "Done", "cards": []},
                    ]
                },
            },
        }

    def ping(self) -> str:
        return "4"


def _login(client: TestClient) -> None:
    response = client.post(
        "/api/auth/login",
        json={"username": "user", "password": "password"},
    )
    assert response.status_code == 200


def test_ai_ping_requires_authentication() -> None:
    os.environ["PM_SKIP_DB_INIT"] = "1"
    app.state.ai_client = FakeAIClientSuccess()
    app.state.kanban_service = FakeKanbanService()

    with TestClient(app) as client:
        response = client.post("/api/ai/ping")

    assert response.status_code == 401


def test_ai_ping_returns_answer_with_mocked_client() -> None:
    os.environ["PM_SKIP_DB_INIT"] = "1"
    app.state.ai_client = FakeAIClientSuccess()
    app.state.kanban_service = FakeKanbanService()

    with TestClient(app) as client:
        _login(client)
        response = client.post("/api/ai/ping")

    assert response.status_code == 200
    body = response.json()
    assert body["answer"] == "4"
    assert body["model"] == "openai/gpt-4o-mini"


def test_ai_ping_returns_provider_error() -> None:
    os.environ["PM_SKIP_DB_INIT"] = "1"
    app.state.ai_client = FakeAIClientFailure()
    app.state.kanban_service = FakeKanbanService()

    with TestClient(app) as client:
        _login(client)
        response = client.post("/api/ai/ping")

    assert response.status_code == 502
    assert "provider" in response.json()["error"].lower()


def test_ai_ping_returns_missing_key_error() -> None:
    os.environ["PM_SKIP_DB_INIT"] = "1"
    app.state.ai_client = None
    app.state.kanban_service = FakeKanbanService()
    os.environ.pop("OPENAI_API_KEY", None)
    os.environ.pop("OPENAI_API_KEY_FILE", None)

    with TestClient(app) as client:
        _login(client)
        response = client.post("/api/ai/ping")

    assert response.status_code == 503
    assert "openai_api_key" in response.json()["error"].lower()


def test_ai_chat_no_update_response() -> None:
    os.environ["PM_SKIP_DB_INIT"] = "1"
    app.state.ai_client = FakeAIClientChatNoUpdate()
    app.state.kanban_service = FakeKanbanService()

    with TestClient(app) as client:
        _login(client)
        response = client.post(
            "/api/ai/chat",
            json={"message": "Any suggestions?", "history": []},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["assistant_message"] == "No changes applied."
    assert body["board_update"] is None
    assert body["model"] == "openai/gpt-4o-mini"


def test_ai_chat_applies_valid_board_update() -> None:
    os.environ["PM_SKIP_DB_INIT"] = "1"
    fake_service = FakeKanbanService()
    app.state.ai_client = FakeAIClientChatWithUpdate()
    app.state.kanban_service = fake_service

    with TestClient(app) as client:
        _login(client)
        response = client.post(
            "/api/ai/chat",
            json={
                "message": "Rename the first column",
                "history": [{"role": "user", "content": "Please rename backlog"}],
            },
        )

    assert response.status_code == 200
    body = response.json()
    assert body["board_update"]["board"]["columns"][0]["title"] == "Backlog Updated"
    assert fake_service.get_board("user")["board"]["columns"][0]["title"] == "Backlog Updated"


def test_ai_chat_rejects_malformed_model_output_without_db_change() -> None:
    os.environ["PM_SKIP_DB_INIT"] = "1"
    fake_service = FakeKanbanService()
    original = deepcopy(fake_service.get_board("user"))
    app.state.ai_client = FakeAIClientChatMalformed()
    app.state.kanban_service = fake_service

    with TestClient(app) as client:
        _login(client)
        response = client.post(
            "/api/ai/chat",
            json={"message": "Do something", "history": []},
        )

    assert response.status_code == 502
    assert "schema" in response.json()["error"].lower()
    assert fake_service.get_board("user") == original


def test_ai_chat_ignores_semantically_destructive_update() -> None:
    os.environ["PM_SKIP_DB_INIT"] = "1"
    fake_service = FakeKanbanService()
    fake_service.board = {
        "version": 1,
        "board": {
            "columns": [
                {"id": "col-backlog", "title": "Backlog", "cards": []},
                {"id": "col-discovery", "title": "Discovery", "cards": []},
                {"id": "col-progress", "title": "In Progress", "cards": []},
                {"id": "col-review", "title": "Review", "cards": []},
                {
                    "id": "col-done",
                    "title": "Done",
                    "cards": [
                        {
                            "id": "card-a",
                            "title": "First Done Card",
                            "details": "Must not disappear",
                        },
                        {
                            "id": "card-moved",
                            "title": "Moved Card Title",
                            "details": "Requested move target",
                        },
                    ],
                },
            ]
        },
    }
    original = deepcopy(fake_service.board)
    app.state.ai_client = FakeAIClientChatDropsCards()
    app.state.kanban_service = fake_service

    with TestClient(app) as client:
        _login(client)
        response = client.post(
            "/api/ai/chat",
            json={"message": "Move Moved Card Title card to Review", "history": []},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["board_update"] is None
    assert "removed cards unexpectedly" in body.get("warning", "").lower()
    assert fake_service.get_board("user") == original
