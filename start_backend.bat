@echo off
title MoodLens Backend Server
color 0B

echo.
echo  ============================================================
echo     MoodLens -- Mood-Based Music ^& Movie Recommender
echo     Backend Server
echo  ============================================================
echo.

REM ── Resolve paths relative to THIS .bat file's location ──────
set "PROJECT_DIR=%~dp0"
set "BACKEND_DIR=%PROJECT_DIR%backend"

REM ── Verify backend directory exists ──────────────────────────
if not exist "%BACKEND_DIR%\" (
    color 0C
    echo  [ERROR] Backend directory not found: %BACKEND_DIR%
    echo  [ERROR] Make sure start_backend.bat is in the project root.
    echo.
    pause
    exit /b 1
)

cd /d "%BACKEND_DIR%"

REM ── Create venv if it doesn't exist ──────────────────────────
if not exist "venv\" (
    echo  [Setup] Creating virtual environment...
    python -m venv venv
    if errorlevel 1 (
        color 0C
        echo  [ERROR] Failed to create virtual environment.
        echo  [ERROR] Make sure Python is installed and on your PATH.
        echo.
        pause
        exit /b 1
    )
    echo  [Setup] Virtual environment created.
)

REM ── Activate venv ────────────────────────────────────────────
echo  [Setup] Activating virtual environment...
call "%BACKEND_DIR%\venv\Scripts\activate.bat"

REM ── Install/verify dependencies ──────────────────────────────
echo  [Setup] Installing/verifying dependencies...
pip install -r "%BACKEND_DIR%\requirements.txt" --quiet 2>nul
if errorlevel 1 (
    color 0E
    echo  [WARN] Some dependencies may have failed to install.
    echo  [WARN] Attempting to start anyway...
    echo.
)

echo.
echo  [Server] Starting Flask backend...
echo  [Server] The server will be available at:
echo.
echo           http://localhost:5000
echo.
echo  [Server] Keep this window open while using the extension.
echo  [Server] Press Ctrl+C to stop the server.
echo  ------------------------------------------------------------
echo.

python "%BACKEND_DIR%\app.py"

echo.
echo  [Server] Backend stopped.
pause
