@echo off
setlocal

set BASE_URL=%~1
if "%BASE_URL%"=="" set BASE_URL=http://localhost:8000

curl -s %BASE_URL%/ | findstr /c:"<html" >nul || (echo FAIL / & exit /b 1)
echo PASS /

curl -s %BASE_URL%/hello | findstr /c:"hello world" >nul || (echo FAIL /hello & exit /b 1)
echo PASS /hello

for /f %%i in ('curl -s -o nul -w "%%{http_code}" %BASE_URL%/api/kanban') do set KANBAN_STATUS=%%i
if not "%KANBAN_STATUS%"=="401" (echo FAIL /api/kanban unauth & exit /b 1)
echo PASS /api/kanban unauth

if exist .smoke.cookies del /q .smoke.cookies
for /f %%i in ('curl -s -o nul -w "%%{http_code}" -c .smoke.cookies -H "Content-Type: application/json" -d "{\"username\":\"user\",\"password\":\"password\"}" %BASE_URL%/api/auth/login') do set LOGIN_STATUS=%%i
if not "%LOGIN_STATUS%"=="200" (echo FAIL /api/auth/login & del /q .smoke.cookies & exit /b 1)
echo PASS /api/auth/login

curl -s -b .smoke.cookies %BASE_URL%/api/kanban | findstr /c:"columns" >nul || (echo FAIL /api/kanban authed & del /q .smoke.cookies & exit /b 1)
echo PASS /api/kanban authed

if exist .smoke.cookies del /q .smoke.cookies

echo Smoke checks passed for %BASE_URL%
