@echo off
cd /d "%~dp0"
echo Starting Weather Lizard at http://localhost:8000
start "" http://localhost:8000
where python >nul 2>nul
if %errorlevel%==0 (
  python -m http.server 8000
) else (
  py -m http.server 8000
)
