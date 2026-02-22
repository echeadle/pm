param(
    [string]$BaseUrl = "http://localhost:8000"
)

$ErrorActionPreference = "Stop"

$root = Invoke-WebRequest -Uri "$BaseUrl/" -UseBasicParsing
if ($root.Content -notmatch "<html") { throw "FAIL /" }
Write-Host "PASS /"

$hello = Invoke-WebRequest -Uri "$BaseUrl/hello" -UseBasicParsing
if ($hello.Content -notmatch "hello world") { throw "FAIL /hello" }
Write-Host "PASS /hello"

try {
    Invoke-WebRequest -Uri "$BaseUrl/api/kanban" -UseBasicParsing | Out-Null
    throw "FAIL /api/kanban unauth expected 401"
} catch {
    if (-not $_.Exception.Message.Contains("(401)")) { throw }
}
Write-Host "PASS /api/kanban unauth"

$loginBody = @{ username = "user"; password = "password" } | ConvertTo-Json
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$login = Invoke-WebRequest -Uri "$BaseUrl/api/auth/login" -Method Post -Body $loginBody -ContentType "application/json" -WebSession $session -UseBasicParsing
if ($login.StatusCode -ne 200) { throw "FAIL /api/auth/login" }
Write-Host "PASS /api/auth/login"

$authedKanban = Invoke-WebRequest -Uri "$BaseUrl/api/kanban" -WebSession $session -UseBasicParsing
if ($authedKanban.Content -notmatch "columns") { throw "FAIL /api/kanban authed" }
Write-Host "PASS /api/kanban authed"

Write-Host "Smoke checks passed for $BaseUrl"
