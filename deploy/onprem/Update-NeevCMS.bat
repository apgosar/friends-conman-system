@echo off
setlocal
title Neev CMS - Update

rem ---- Set these once, when the server is installed -------------------------
rem DISTRO  : the WSL distro name shown by "wsl -l -v"
rem APPDIR  : the folder inside that distro that holds docker-compose.yml and .env
rem           (update.sh is downloaded into it automatically). To find it, run
rem           "docker compose ls" in the Ubuntu window: it is the folder part of
rem           the docker-compose.yml path.
rem WSLUSER : leave empty to use the distro's default user. Set it (for example
rem           to root) only if the app was installed under a different Linux user.
rem REPO    : where the updater script is downloaded from (vendor setting).
set "DISTRO=Ubuntu"
set "APPDIR=~/neev-cms"
set "WSLUSER="
set "REPO=apgosar/friends-conman-system"
rem --------------------------------------------------------------------------

rem --cd ~ starts WSL in the Linux home folder. Without it WSL tries to open the folder this window was started from
rem (often C:\Windows when run as administrator), which the Linux side may not be allowed to enter ("chdir(/mnt/c/Windows) failed 5").
set "WSLARGS=-d %DISTRO% --cd ~"
if defined WSLUSER set "WSLARGS=%WSLARGS% -u %WSLUSER%"

echo.
echo   Neev CMS updater
echo   ----------------
echo.

rem The version can be given on the command line (Update-NeevCMS.bat v1.2.0) or typed here.
set "TAG=%~1"
if not defined TAG set /p "TAG=  Which version do you want to install? (for example v1.2.0): "
set "TAG=%TAG:"=%"
set "TAG=%TAG: =%"

rem What runs inside WSL, in order:
rem   1. go to the app folder
rem   2. tidy and check the version (1.2.0 and V1.2.0 both become v1.2.0)
rem   3. download update.sh FOR THAT VERSION and keep it only if it is a valid script
rem      (the previous copy is kept as update.sh.previous; if the download fails the copy already
rem      on this server is used and a message says so)
rem   4. run it, passing the version so it does not ask again
set "S=cd %APPDIR% || exit 91; tag=$1;"
set "S=%S% case $tag in V*) tag=v${tag#V};; [0-9]*) tag=v$tag;; esac;"
set "S=%S% echo $tag | grep -Eq '^v[0-9]+[.][0-9]+[.][0-9]+(-[0-9A-Za-z][0-9A-Za-z.]*)?$' || exit 93;"
set "S=%S% url=https://raw.githubusercontent.com/%REPO%/$tag/deploy/onprem/update.sh;"
set "S=%S% if curl -fsSL --max-time 60 -o update.sh.new $url && bash -n update.sh.new && head -c 2 update.sh.new | grep -q '#!';"
set "S=%S% then [ -f update.sh ] && cp update.sh update.sh.previous; mv update.sh.new update.sh; echo '  Updater downloaded for '$tag;"
set "S=%S% else rm -f update.sh.new; echo '  Could not download the updater for '$tag' - using the copy already on this server.'; fi;"
set "S=%S% [ -f update.sh ] || exit 92;"
set "S=%S% bash <(tr -d '\r' < update.sh) $tag"

wsl %WSLARGS% -e bash -c "%S%" _ "%TAG%"
set "RC=%ERRORLEVEL%"

echo.
if "%RC%"=="0" echo   Finished. You can close this window.
if "%RC%"=="91" echo   Could not open the folder %APPDIR% inside %DISTRO%. Fix APPDIR at the top of this file, or set WSLUSER if the app belongs to another Linux user.
if "%RC%"=="92" echo   update.sh could not be downloaded and is not in %APPDIR% either. Check the internet connection and try again.
if "%RC%"=="93" echo   "%TAG%" is not a valid version. It should look like v1.2.0.
if not "%RC%"=="0" if not "%RC%"=="91" if not "%RC%"=="92" if not "%RC%"=="93" echo   The update did NOT complete. Please send the newest file in the update-logs folder to support.
echo.
pause
exit /b %RC%
