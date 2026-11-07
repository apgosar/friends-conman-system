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
rem The request is made from inside the web container to 127.0.0.1, not "localhost": Node may try the IPv6 ::1 first, and the
rem app listens on IPv4 only, so "localhost" can fail with "fetch failed" / ECONNREFUSED.
rem The script has no > < | & or %: cmd sees it outside quotes (after the \") and would treat those as redirects or pipes,
rem so it uses function(){} and not arrow functions.
set "WSLARGS=-d %DISTRO% --cd ~"
if defined WSLUSER set "WSLARGS=%WSLARGS% -u %WSLUSER%"

wsl %WSLARGS% -e bash -c "cd %APPDIR% || exit 91; docker compose exec -T web node -e \"fetch('http://127.0.0.1:8080/api/cron/daily',{method:'POST',headers:{authorization:'Bearer '+process.env.CRON_SECRET}}).then(function(r){return r.text().then(function(t){console.log(r.status,t);process.exit(r.ok?0:1)})}).catch(function(e){console.error(e.message,e.cause);process.exit(1)})\""
set "RC=%ERRORLEVEL%"

if "%RC%"=="0" (echo   Daily job done.) else (echo   The daily job did not complete ^(code %RC%^). Check that the app is running: docker compose ps)
exit /b %RC%
