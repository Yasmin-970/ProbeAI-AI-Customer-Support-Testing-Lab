@echo off
node "%~dp0Start-ProbeAI.mjs" %*
if errorlevel 1 pause
