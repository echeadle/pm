#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://localhost:8000}"

check() {
  local path="$1"
  local expected_code="$2"
  local expected_text="$3"

  local body_file
  body_file=$(mktemp)
  local status
  status=$(curl -sS -o "$body_file" -w "%{http_code}" "$BASE_URL$path")

  if [ "$status" != "$expected_code" ]; then
    echo "FAIL $path: expected status $expected_code, got $status"
    cat "$body_file"
    rm -f "$body_file"
    exit 1
  fi

  if ! grep -q "$expected_text" "$body_file"; then
    echo "FAIL $path: expected body to include '$expected_text'"
    cat "$body_file"
    rm -f "$body_file"
    exit 1
  fi

  rm -f "$body_file"
  echo "PASS $path"
}

check "/" "200" "<html"
check "/hello" "200" "hello world"

# Kanban is now auth-gated.
check "/api/kanban" "401" "Unauthorized"

COOKIE_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR"' EXIT

LOGIN_STATUS=$(curl -sS -o /tmp/pm_login_response.json -w "%{http_code}" \
  -c "$COOKIE_JAR" \
  -H "Content-Type: application/json" \
  -d '{"username":"user","password":"password"}' \
  "$BASE_URL/api/auth/login")

if [ "$LOGIN_STATUS" != "200" ]; then
  echo "FAIL /api/auth/login: expected status 200, got $LOGIN_STATUS"
  cat /tmp/pm_login_response.json
  exit 1
fi
echo "PASS /api/auth/login"

AUTH_KANBAN_STATUS=$(curl -sS -o /tmp/pm_kanban_authed_response.json -w "%{http_code}" \
  -b "$COOKIE_JAR" \
  "$BASE_URL/api/kanban")

if [ "$AUTH_KANBAN_STATUS" != "200" ]; then
  echo "FAIL /api/kanban (authed): expected status 200, got $AUTH_KANBAN_STATUS"
  cat /tmp/pm_kanban_authed_response.json
  exit 1
fi

if ! grep -q "columns" /tmp/pm_kanban_authed_response.json; then
  echo "FAIL /api/kanban (authed): expected body to include 'columns'"
  cat /tmp/pm_kanban_authed_response.json
  exit 1
fi
echo "PASS /api/kanban (authed)"

echo "Smoke checks passed for $BASE_URL"
