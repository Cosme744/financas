@echo off
cd /d "%~dp0"
set /p MSG=O que mudou? 
git add -A
git commit -m "%MSG%"
git push
echo.
echo Publicado. Em 1-2 minutos o celular pega a versao nova.
pause
