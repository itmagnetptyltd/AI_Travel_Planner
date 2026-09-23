@echo off
rem Belt B — open Chromium and run the browser tests.
rem Same as typing /run-browsertest in Cursor.

setlocal
cd /d "%~dp0.."

where node >nul 2>&1
if errorlevel 1 (
    echo Node.js is required to run browser tests.
    pause
    exit /b 1
)

if not exist ".claude\itm-sdlc\scripts\run-browsertest.js" (
    echo vendored toolkit predates run-browsertest.js - re-run install.js from the itm-sdlc clone
    pause
    exit /b 1
)

node .claude\itm-sdlc\scripts\run-browsertest.js --project . --headed
echo.
pause
