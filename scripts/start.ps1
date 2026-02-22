$ErrorActionPreference = "Stop"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Error "docker is required but not installed"
}

$envFile = if ($env:KANBAN_ENV_FILE) {
    $env:KANBAN_ENV_FILE
} else {
    Join-Path $HOME ".config/kanban/kanban.secrets.env"
}

$fallbackEnvFile = Join-Path (Get-Location) "secrets/kanban.secrets.env"
if (-not (Test-Path $envFile) -and (Test-Path $fallbackEnvFile)) {
    $envFile = $fallbackEnvFile
}

if (-not (Test-Path $envFile)) {
    throw "Missing secrets env file. Expected at $HOME/.config/kanban/kanban.secrets.env or set KANBAN_ENV_FILE."
}

docker compose version | Out-Null
docker compose --env-file $envFile up -d --build

Write-Host "Services started with Docker Compose: http://localhost:8000"
