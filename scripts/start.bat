@echo off
setlocal

docker compose version >nul 2>&1
if errorlevel 1 (
  echo docker compose is required but not installed
  exit /b 1
)

docker compose up -d --build
if errorlevel 1 exit /b 1

echo Services started with Docker Compose: http://localhost:8000
