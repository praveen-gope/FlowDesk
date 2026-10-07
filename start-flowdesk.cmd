@echo off
setlocal
cd /d "%~dp0"
if not defined FLOWDESK_PYTHON set "FLOWDESK_PYTHON=python"
if exist "backend\.venv\Scripts\python.exe" set "FLOWDESK_PYTHON=%CD%\backend\.venv\Scripts\python.exe"
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Install Node.js and reopen this terminal before starting FlowDesk.
  pause
  exit /b 1
)
echo Starting FlowDesk. Keep this window open while testing.
echo Wait for the "FlowDesk preview verified" message below.
node preview.cjs
echo.
echo FlowDesk stopped. Any error is shown above.
pause
