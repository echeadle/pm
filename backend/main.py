import os
import time
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from openai import APIConnectionError, APIStatusError, APITimeoutError, RateLimitError

from backend.ai_client import AI_MODEL, OpenAIPingClient
from backend.service import KanbanService

logger = logging.getLogger("pm.ai")

BASE_DIR = Path(__file__).parent
STATIC_DIR = BASE_DIR / "static"
DEFAULT_DATABASE_URL = "postgresql://pm_user:pm_password@db:5432/pm_db"
SESSION_COOKIE_NAME = "pm_session"
SESSION_COOKIE_VALUE = "mvp-user-session"


def _get_mvp_credentials() -> tuple[str, str]:
    username = os.getenv("MVP_USERNAME", "user")
    password = os.getenv("MVP_PASSWORD", "password")
    return username, password


MVP_USERNAME, MVP_PASSWORD = _get_mvp_credentials()
CANONICAL_COLUMNS = [
    ("col-backlog", "Backlog"),
    ("col-discovery", "Discovery"),
    ("col-progress", "In Progress"),
    ("col-review", "Review"),
    ("col-done", "Done"),
]


class LoginRequest(BaseModel):
    username: str
    password: str


class BoardCard(BaseModel):
    id: str
    title: str
    details: str


class BoardColumn(BaseModel):
    id: str
    title: str
    cards: list[BoardCard]


class BoardBody(BaseModel):
    columns: list[BoardColumn]


class BoardPayload(BaseModel):
    version: int = Field(..., ge=1, le=1)
    board: BoardBody


class ChatHistoryMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatHistoryMessage] = Field(default_factory=list)


def get_database_url() -> str:
    return os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL)


def _skip_db_init() -> bool:
    return os.getenv("PM_SKIP_DB_INIT") == "1"


def get_openai_api_key() -> str | None:
    key_file = os.getenv("OPENAI_API_KEY_FILE")
    if key_file:
        try:
            with open(key_file, "r", encoding="utf-8") as file:
                key = file.read().strip()
            if key:
                return key
        except OSError:
            return None

    key = os.getenv("OPENAI_API_KEY", "").strip()
    return key or None


def get_ai_client():
    client = getattr(app.state, "ai_client", None)
    if client is not None:
        return client

    api_key = get_openai_api_key()
    if not api_key:
        return None

    client = OpenAIPingClient(api_key=api_key)
    app.state.ai_client = client
    return client


def get_service() -> KanbanService:
    service = getattr(app.state, "kanban_service", None)
    if service is None:
        if _skip_db_init():
            raise RuntimeError("kanban service not initialized in test mode")
        service = KanbanService(get_database_url(), mvp_username=MVP_USERNAME)
        service.init()
        app.state.kanban_service = service
    return service


def is_authenticated(request: Request) -> bool:
    return request.cookies.get(SESSION_COOKIE_NAME) == SESSION_COOKIE_VALUE


def _normalize_card(card: dict) -> dict | None:
    card_id = card.get("id")
    if not isinstance(card_id, str) or not card_id:
        return None
    title = card.get("title")
    details = card.get("details")
    return {
        "id": card_id,
        "title": title if isinstance(title, str) else "",
        "details": details if isinstance(details, str) else "",
    }


def _normalize_board_payload(board: dict) -> dict:
    columns_raw = board.get("board", {}).get("columns", [])
    by_id = {
        column.get("id"): column
        for column in columns_raw
        if isinstance(column, dict) and isinstance(column.get("id"), str)
    }

    seen_card_ids: set[str] = set()
    normalized_columns: list[dict] = []

    for column_id, default_title in CANONICAL_COLUMNS:
        source = by_id.get(column_id, {})
        source_title = source.get("title")
        title = (
            source_title
            if isinstance(source_title, str) and source_title
            else default_title
        )
        source_cards = source.get("cards", [])

        cards: list[dict] = []
        if isinstance(source_cards, list):
            for card in source_cards:
                if not isinstance(card, dict):
                    continue
                normalized = _normalize_card(card)
                if normalized is None:
                    continue
                if normalized["id"] in seen_card_ids:
                    continue
                seen_card_ids.add(normalized["id"])
                cards.append(normalized)

        normalized_columns.append({"id": column_id, "title": title, "cards": cards})

    # Preserve cards from unexpected columns by appending them to Backlog.
    for column in columns_raw:
        if not isinstance(column, dict):
            continue
        column_id = column.get("id")
        if not isinstance(column_id, str):
            continue
        if any(column_id == canonical_id for canonical_id, _ in CANONICAL_COLUMNS):
            continue
        cards = column.get("cards")
        if not isinstance(cards, list):
            continue
        for card in cards:
            if not isinstance(card, dict):
                continue
            normalized = _normalize_card(card)
            if normalized is None:
                continue
            if normalized["id"] in seen_card_ids:
                continue
            seen_card_ids.add(normalized["id"])
            normalized_columns[0]["cards"].append(normalized)

    return {"version": 1, "board": {"columns": normalized_columns}}


def _collect_column_ids(board: dict) -> set[str]:
    return {
        column.get("id")
        for column in board.get("board", {}).get("columns", [])
        if isinstance(column, dict) and isinstance(column.get("id"), str)
    }


def _collect_card_ids(board: dict) -> list[str]:
    ids: list[str] = []
    for column in board.get("board", {}).get("columns", []):
        if not isinstance(column, dict):
            continue
        for card in column.get("cards", []):
            if isinstance(card, dict) and isinstance(card.get("id"), str):
                ids.append(card["id"])
    return ids


def _ai_intends_delete(user_message: str) -> bool:
    text = user_message.lower()
    keywords = ("delete", "remove", "drop", "archive")
    return any(keyword in text for keyword in keywords)


def _semantic_validate_ai_board_update(
    current_board: dict, proposed_board: dict, user_message: str
) -> str | None:
    current_column_ids = _collect_column_ids(current_board)
    proposed_column_ids = _collect_column_ids(proposed_board)
    if current_column_ids != proposed_column_ids:
        return "AI board update changed column set; ignored"

    current_card_ids = _collect_card_ids(current_board)
    proposed_card_ids = _collect_card_ids(proposed_board)

    if len(set(proposed_card_ids)) != len(proposed_card_ids):
        return "AI board update contains duplicate card ids; ignored"

    missing_cards = set(current_card_ids) - set(proposed_card_ids)
    if missing_cards and not _ai_intends_delete(user_message):
        return "AI board update removed cards unexpectedly; ignored"

    return None


def _ai_error_response(exc: Exception) -> JSONResponse:
    logger.exception("AI request failed: %s", exc)

    if isinstance(exc, (TimeoutError, APITimeoutError)):
        return JSONResponse({"error": "AI provider timeout"}, status_code=504)
    if isinstance(exc, RateLimitError):
        return JSONResponse(
            {"error": "AI provider rate limited. Please retry in a few seconds."},
            status_code=429,
        )
    if isinstance(exc, APIConnectionError):
        return JSONResponse({"error": "AI provider connection failed"}, status_code=502)
    if isinstance(exc, RuntimeError):
        message = str(exc).lower()
        if "valid json" in message:
            return JSONResponse(
                {"error": "AI response was not valid JSON"}, status_code=502
            )
        return JSONResponse(
            {"error": f"AI provider request failed: {str(exc)}"}, status_code=502
        )
    if isinstance(exc, APIStatusError):
        status = getattr(exc, "status_code", 502) or 502
        return JSONResponse(
            {"error": f"AI provider status error ({status})"},
            status_code=502 if status < 400 else min(status, 599),
        )
    return JSONResponse({"error": "AI provider request failed"}, status_code=502)


def _init_service_with_retry(app: FastAPI) -> None:
    if _skip_db_init():
        return

    service = KanbanService(get_database_url(), mvp_username=MVP_USERNAME)

    last_error: Exception | None = None
    for _ in range(30):
        try:
            service.init()
            app.state.kanban_service = service
            return
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            time.sleep(1)

    if last_error is not None:
        raise last_error


@asynccontextmanager
async def lifespan(app: FastAPI):
    _init_service_with_retry(app)
    yield


app = FastAPI(lifespan=lifespan)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:3000", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/hello")
def hello():
    return JSONResponse({"message": "hello world"})


@app.post("/api/auth/login")
def login(payload: LoginRequest):
    if payload.username != MVP_USERNAME or payload.password != MVP_PASSWORD:
        return JSONResponse({"error": "Invalid credentials"}, status_code=401)

    response = JSONResponse({"ok": True, "user": {"username": MVP_USERNAME}})
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=SESSION_COOKIE_VALUE,
        httponly=True,
        samesite="lax",
        max_age=60 * 60 * 8,
        secure=False,
        path="/",
    )
    return response


@app.post("/api/auth/logout")
def logout():
    response = JSONResponse({"ok": True})
    response.delete_cookie(SESSION_COOKIE_NAME, path="/")
    return response


@app.get("/api/auth/me")
def me(request: Request):
    if not is_authenticated(request):
        return JSONResponse({"authenticated": False}, status_code=401)
    return JSONResponse({"authenticated": True, "user": {"username": MVP_USERNAME}})


@app.get("/api/kanban")
def get_kanban(request: Request):
    if not is_authenticated(request):
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
    service = get_service()
    board = service.get_board(MVP_USERNAME)
    normalized = _normalize_board_payload(board)
    if normalized != board:
        service.replace_board(MVP_USERNAME, normalized)
        board = normalized
    return JSONResponse(board)


@app.put("/api/kanban")
def put_kanban(request: Request, payload: BoardPayload):
    if not is_authenticated(request):
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    normalized_payload = _normalize_board_payload(payload.model_dump())
    saved = get_service().replace_board(MVP_USERNAME, normalized_payload)
    return JSONResponse(saved)


@app.post("/api/ai/ping")
def ai_ping(request: Request):
    if not is_authenticated(request):
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    client = get_ai_client()
    if client is None:
        return JSONResponse(
            {"error": "OPENAI_API_KEY is not configured"},
            status_code=503,
        )

    try:
        answer = client.ping()
    except Exception as exc:  # noqa: BLE001
        return _ai_error_response(exc)

    return JSONResponse({"answer": answer, "model": AI_MODEL})


@app.post("/api/ai/chat")
def ai_chat(request: Request, payload: ChatRequest):
    if not is_authenticated(request):
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    client = get_ai_client()
    if client is None:
        return JSONResponse(
            {"error": "OPENAI_API_KEY is not configured"},
            status_code=503,
        )

    current_board = get_service().get_board(MVP_USERNAME)

    try:
        raw_response = client.chat(
            board_payload=current_board,
            history=[message.model_dump() for message in payload.history],
            user_message=payload.message,
        )
    except Exception as exc:  # noqa: BLE001
        return _ai_error_response(exc)

    if not isinstance(raw_response, dict):
        return JSONResponse({"error": "AI response schema invalid"}, status_code=502)

    assistant_message = raw_response.get("assistant_message")
    if not isinstance(assistant_message, str):
        return JSONResponse({"error": "AI response schema invalid"}, status_code=502)

    board_update_raw = raw_response.get("board_update")
    if board_update_raw is None:
        return JSONResponse(
            {
                "assistant_message": assistant_message,
                "board_update": None,
                "model": AI_MODEL,
            }
        )

    try:
        board_update = BoardPayload.model_validate(board_update_raw)
    except Exception:
        return JSONResponse(
            {
                "assistant_message": assistant_message,
                "board_update": None,
                "model": AI_MODEL,
                "warning": "AI board update schema invalid; ignored",
            }
        )

    normalized_update = _normalize_board_payload(board_update.model_dump())

    semantic_error = _semantic_validate_ai_board_update(
        current_board=current_board,
        proposed_board=normalized_update,
        user_message=payload.message,
    )
    if semantic_error is not None:
        return JSONResponse(
            {
                "assistant_message": assistant_message,
                "board_update": None,
                "model": AI_MODEL,
                "warning": semantic_error,
            }
        )

    saved_board = get_service().replace_board(MVP_USERNAME, normalized_update)
    return JSONResponse(
        {
            "assistant_message": assistant_message,
            "board_update": saved_board,
            "model": AI_MODEL,
        }
    )


if STATIC_DIR.is_dir():
    # Keep API routes above this mount so /api/* is not shadowed.
    app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
