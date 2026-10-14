@echo off
setlocal
title Neev CMS - Update

rem ---- Set these two values once, when the server is installed -------------
rem DISTRO : the WSL distro name shown by "wsl -l -v"
rem APPDIR : the folder inside that distro that holds docker-compose.yml,
rem          .env and update.sh
set "DISTRO=Ubuntu"
set "APPDIR=~/neev-cms"
rem --------------------------------------------------------------------------

echo.
echo   Neev CMS updater
echo   ----------------
echo.

wsl -d %DISTRO% -e bash -c "cd %APPDIR% && bash <(tr -d '\r' < update.sh)"
set "RC=%ERRORLEVEL%"

echo.
if "%RC%"=="0" goto done
echo   The update did NOT complete. Please send the newest file in the
echo   update-logs folder to support.
goto end
:done
echo   Finished. You can close this window.
:end
echo.
pause
exit /b %RC%
