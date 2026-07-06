@echo off
cd /d "%~dp0"
set "NODE_USE_ENV_PROXY=1"
set "HTTPS_PROXY=http://127.0.0.1:7897"
set "HTTP_PROXY=http://127.0.0.1:7897"
set "ALL_PROXY=http://127.0.0.1:7897"
set "NO_PROXY=localhost,127.0.0.1,::1"
set "NEXT_TELEMETRY_DISABLED=1"
echo [%date% %time%] starting V3 on http://localhost:3001 with proxy 127.0.0.1:7897 > v3-dev.log
"C:\Program Files\nodejs\node.exe" node_modules\next\dist\bin\next dev -p 3001 >> v3-dev.log 2>&1
