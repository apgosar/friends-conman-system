@echo off
setlocal
title Neev CMS - Daily job

rem ---- Set these once, the same way as in Update-NeevCMS.bat ------------------
rem DISTRO  : the WSL distro name shown by "wsl -l -v"
rem APPDIR  : the folder inside that distro that holds docker-compose.yml and .env
rem WSLUSER : leave empty to use the distro's default user
set "DISTRO=Ubuntu"
set "APPDIR=~/neev-cms"
set "WSLUSER="
rem --------------------------------------------------------------------------

rem Runs the app's daily job: ages overdue demands and posts each late demand's interest for the day.
rem The job uses the CRON_SECRET the app already has, so no secret is written here. Run it once a day
rem (see "Daily job" in README.md): a missed day is made up by the next run.
set "WSLARGS=-d %DISTRO% --cd ~"
if defined WSLUSER set "WSLARGS=%WSLARGS% -u %WSLUSER%"

wsl %WSLARGS% -e bash -c "cd %APPDIR% || exit 91; docker compose exec -T web node -e \"fetch('http://localhost:8080/api/cron/daily',{method:'POST',headers:{authorization:'Bearer '+process.env.CRON_SECRET}}).then(async r=>{console.log(r.status,await r.text());process.exit(r.ok?0:1)}).catch(e=>{console.error(e.message);process.exit(1)})\""
set "RC=%ERRORLEVEL%"

if "%RC%"=="0" (echo   Daily job done.) else (echo   The daily job did not complete ^(code %RC%^). Check that the app is running: docker compose ps)
exit /b %RC%
