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

rem Runs the app's daily job: ages overdue demands, posts each late demand's interest for the day and sends the weekly
rem payment reminders. Every run is added to daily-job.log next to this file (date, time, exit code and the app's answer).
rem The job uses the CRON_SECRET the app already has, so no secret is written here. Run it once a day
rem (see "Daily job" in README.md): a missed day is made up by the next run.
rem The request is made from inside the web container to 127.0.0.1, not "localhost": Node may try the IPv6 ::1 first, and the
rem app listens on IPv4 only, so "localhost" can fail with "fetch failed" / ECONNREFUSED.
rem The script has no > < | & or %: cmd sees it outside quotes (after the \") and would treat those as redirects or pipes,
rem so it uses function(){} and not arrow functions.
set "WSLARGS=-d %DISTRO% --cd ~"
if defined WSLUSER set "WSLARGS=%WSLARGS% -u %WSLUSER%"
set "LOG=%~dp0daily-job.log"
set "OUT=%TEMP%\neev-daily-job-%RANDOM%.txt"
rem Right after the server starts, WSL and the app can take a few minutes to come up, so a failed run is tried again:
rem up to TRIES times, WAIT seconds apart. A wrong APPDIR (code 91) is not retried.
set "TRIES=4"
set "WAIT=300"
set /a TRY=0

:attempt
set /a TRY+=1
wsl %WSLARGS% -e bash -c "cd %APPDIR% || exit 91; docker compose exec -T web node -e \"fetch('http://127.0.0.1:8080/api/cron/daily',{method:'POST',headers:{authorization:'Bearer '+process.env.CRON_SECRET}}).then(function(r){return r.text().then(function(t){console.log(r.status,t);process.exit(r.ok?0:1)})}).catch(function(e){console.error(e.message,e.cause);process.exit(1)})\"" > "%OUT%" 2>&1
set "RC=%ERRORLEVEL%"
type "%OUT%"
>>"%LOG%" echo [%date% %time%] attempt %TRY% of %TRIES%, exit code %RC%
>>"%LOG%" type "%OUT%"
del "%OUT%" 2>nul
if "%RC%"=="0" goto done
if "%RC%"=="91" goto done
if %TRY% GEQ %TRIES% goto done
echo   Not done yet. Trying again in %WAIT% seconds, attempt %TRY% of %TRIES%...
powershell -NoProfile -Command "Start-Sleep -Seconds %WAIT%"
goto attempt

:done

if "%RC%"=="0" (echo   Daily job done.) else (echo   The daily job did not complete ^(code %RC%^). Check that the app is running: docker compose ps)
exit /b %RC%
