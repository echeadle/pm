#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required but not installed"
  exit 1
fi

if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD=(docker-compose)
else
  echo "docker compose (or docker-compose) is required"
  exit 1
fi

ENV_FILE="${KANBAN_ENV_FILE:-$HOME/.config/kanban/kanban.secrets.env}"
if [ ! -f "$ENV_FILE" ] && [ -f "./secrets/kanban.secrets.env" ]; then
  ENV_FILE="./secrets/kanban.secrets.env"
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing secrets env file."
  echo "Expected at: $HOME/.config/kanban/kanban.secrets.env"
  echo "Or set KANBAN_ENV_FILE to a different path."
  exit 1
fi

"${COMPOSE_CMD[@]}" --env-file "$ENV_FILE" up -d --build

echo "Services started with Docker Compose: http://localhost:8000"
