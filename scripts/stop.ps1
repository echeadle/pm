$ErrorActionPreference = "Stop"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Error "docker is required but not installed"
}

docker compose version | Out-Null
docker compose down

Write-Host "Stopped Docker Compose services"
