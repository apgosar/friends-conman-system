@echo off
setlocal
title Neev CMS - Update

rem ---- Set these once, when the server is installed -------------------------
rem DISTRO  : the WSL distro name shown by "wsl -l -v"
rem APPDIR  : the folder inside that distro that holds docker-compose.yml, .env
rem           and update.sh. To find it, run "docker compose ls" in the Ubuntu
rem           window: it is the folder part of the docker-compose.yml path.
rem WSLUSER : leave empty to use the distro's default user. Set it (for example
rem           to root) only if the app was installed under a different Linux user.
set "DISTRO=Ubuntu"
set "APPDIR=~/neev-cms"
set "WSLUSER="
rem --------------------------------------------------------------------------

set "WSLARGS=-d %DISTRO%"
if defined WSLUSER set "WSLARGS=%WSLARGS% -u %WSLUSER%"

echo.
echo   Neev CMS updater
echo   ----------------
echo.

wsl %WSLARGS% -e bash -c "cd %APPDIR% || exit 91; [ -f update.sh ] || exit 92; bash <(tr -d '\r' < update.sh)"
set "RC=%ERRORLEVEL%"

echo.
if "%RC%"=="0" echo   Finished. You can close this window.
if "%RC%"=="91" echo   Could not open the folder %APPDIR% inside %DISTRO%. Fix APPDIR at the top of this file, or set WSLUSER if the app belongs to another Linux user.
if "%RC%"=="92" echo   update.sh is not in %APPDIR%. Copy it into that folder, next to docker-compose.yml.
if not "%RC%"=="0" if not "%RC%"=="91" if not "%RC%"=="92" echo   The update did NOT complete. Please send the newest file in the update-logs folder to support.
echo.
pause
exit /b %RC%
