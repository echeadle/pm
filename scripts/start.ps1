$ErrorActionPreference = "Stop"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Error "docker is required but not installed"
}

docker compose version | Out-Null
docker compose up -d --build

Write-Host "Services started with Docker Compose: http://localhost:8000"
