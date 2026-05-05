@echo off
title Lecture Minutes
cd /d E:\research-development\lecture-minutes
taskkill /F /IM node.exe > nul 2>&1
start /b cmd /c "timeout /t 8 /nobreak > nul && start http://localhost:3000"
node node_modules\next\dist\bin\next start
