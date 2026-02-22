@echo off
setlocal

docker compose version >nul 2>&1
if errorlevel 1 (
  echo docker compose is required but not installed
  exit /b 1
)

docker compose down
if errorlevel 1 exit /b 1

echo Stopped Docker Compose services
