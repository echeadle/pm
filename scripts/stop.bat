@echo off
setlocal

docker compose version >nul 2>&1
if errorlevel 1 (
  echo docker compose is required but not installed
  exit /b 1
)

set "ENV_FILE=%KANBAN_ENV_FILE%"
if "%ENV_FILE%"=="" set "ENV_FILE=%USERPROFILE%\.config\kanban\kanban.secrets.env"
if not exist "%ENV_FILE%" if exist "secrets\kanban.secrets.env" set "ENV_FILE=secrets\kanban.secrets.env"
if not exist "%ENV_FILE%" (
  echo Missing secrets env file.
  echo Expected at %USERPROFILE%\.config\kanban\kanban.secrets.env
  echo Or set KANBAN_ENV_FILE to a different path.
  exit /b 1
)

docker compose --env-file "%ENV_FILE%" down
if errorlevel 1 exit /b 1

echo Stopped Docker Compose services
