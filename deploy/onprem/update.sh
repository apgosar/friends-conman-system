#!/usr/bin/env bash
# Neev CMS on-prem updater.
#
#   Customer:  double-click Update-NeevCMS.bat (it runs this script inside WSL).
#   Manual:    cd to the folder holding docker-compose.yml and .env, then
#                bash update.sh [vX.Y.Z] [-y]
#
# Order of operations: check the machine -> choose the release tag -> download the
# new image (the running app is untouched if this fails) -> back up the database ->
# apply database structure changes using the NEW image (stops before the switch if
# it fails) -> switch the app over -> wait for it to become healthy -> roll back to
# the previous version if it does not -> run any one-time data conversion the release
# ships with (once per server; see run_data_migrations below).

# ---- Vendor settings ---------------------------------------------------------
IMAGE_REPO="ghcr.io/apgosar/friends-conman-system"
SUPPORT="your Neev CMS vendor"
HEALTH_TIMEOUT=180   # seconds to wait for the new version to become healthy
KEEP_BACKUPS=10
# ------------------------------------------------------------------------------

set -u
set -o pipefail

ASSUME_YES="${NEEV_ASSUME_YES:-0}"
TAG_ARG=""
for arg in "$@"; do
  case "$arg" in
    -y|--yes) ASSUME_YES=1 ;;
    *) TAG_ARG="$arg" ;;
  esac
done

if [ -f "${BASH_SOURCE[0]:-}" ]; then
  APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
else
  APP_DIR="$PWD"
fi
cd "$APP_DIR" || { echo "Cannot open $APP_DIR"; exit 1; }

STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p update-logs backups || { echo "Cannot create folders in $APP_DIR"; exit 1; }
chmod 700 backups 2>/dev/null
LOG="update-logs/update-$STAMP.log"

TOTAL=9
OLD_TAG=""
TAG=""
BACKUP=""
ENV_COPY=""
LEDGER="data-migrations.applied"   # one line per one-time data conversion already run on this server
CONVERTED=()
TMPFILES=()
TAG_RE='^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z][0-9A-Za-z.]*)?$'

say()  { printf '%s\n' "$*"; }
step() { printf '\n[%s/%s] %s\n' "$1" "$TOTAL" "$2"; }
ok()   { printf '  [ok] %s\n' "$*"; }
warn() { printf '  [!!] %s\n' "$*"; }

fail() {
  printf '\n  [FAILED] %s\n' "$*"
  printf '  Log file: %s/%s\n  If you need help, send that file to %s.\n' "$APP_DIR" "$LOG" "$SUPPORT"
  exit 1
}

ask() {
  if ! read -r -p "$1" REPLY; then
    printf '\n'
    fail "No input was received."
  fi
}

confirm() {
  [ "$ASSUME_YES" = "1" ] && return 0
  ask "$1"
  case "$REPLY" in y|Y|yes|YES|Yes) return 0 ;; esac
  return 1
}

cleanup() { rm -f ${TMPFILES[@]+"${TMPFILES[@]}"} 2>/dev/null; }

get_env_tag() {
  grep -E '^IMAGE_TAG=' .env | tail -1 | tr -d '\r' | sed -E "s/^IMAGE_TAG=//; s/^[\"']//; s/[\"']\$//"
}

set_env_tag() {
  local tmp
  tmp="$(mktemp ".env.XXXXXX")" || return 1
  awk -v tag="$1" '
    BEGIN { done = 0 }
    /^IMAGE_TAG=/ { if (!done) { print "IMAGE_TAG=\"" tag "\""; done = 1 }; next }
    { print }
    END { if (!done) print "IMAGE_TAG=\"" tag "\"" }
  ' .env > "$tmp" || { rm -f "$tmp"; return 1; }
  chmod --reference=.env "$tmp" 2>/dev/null || chmod 600 "$tmp"
  mv "$tmp" .env
}

is_downgrade() {
  local o n
  o="$(printf '%s' "$1" | sed -E 's/^v//; s/[-+].*$//')"
  n="$(printf '%s' "$2" | sed -E 's/^v//; s/[-+].*$//')"
  [[ "$o" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ && "$n" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || return 1
  [ "$o" != "$n" ] || return 1
  [ "$(printf '%s\n%s\n' "$o" "$n" | sort -V | head -1)" = "$n" ]
}

wait_healthy() {
  local deadline=$((SECONDS + $1)) cid status restarts
  printf '  waiting for the app to become healthy '
  while [ "$SECONDS" -lt "$deadline" ]; do
    cid="$(docker compose ps -q web 2>/dev/null | head -1)"
    if [ -n "$cid" ]; then
      status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}nohealthcheck{{end}}' "$cid" 2>/dev/null)"
      restarts="$(docker inspect --format '{{.RestartCount}}' "$cid" 2>/dev/null)"
      case "$status" in
        healthy) printf ' ok\n'; return 0 ;;
        unhealthy) printf ' unhealthy\n'; return 1 ;;
        nohealthcheck)
          if docker compose exec -T web wget -qO- http://localhost:8080/api/health </dev/null >/dev/null 2>&1; then
            printf ' ok\n'; return 0
          fi ;;
      esac
      if [ "${restarts:-0}" -ge 2 ]; then printf ' keeps restarting\n'; return 1; fi
    fi
    printf '.'
    sleep 3
  done
  printf ' timed out\n'
  return 1
}

rollback() {
  warn "Rolling back to $OLD_TAG ..."
  set_env_tag "$OLD_TAG" || warn "Could not restore .env automatically; the previous copy is $APP_DIR/$ENV_COPY"
  if docker compose up -d --no-deps web 2>&1 && wait_healthy 120; then
    ok "Rolled back: $OLD_TAG is running again."
    ok "Your data backup from before this attempt: $APP_DIR/$BACKUP"
  else
    warn "The previous version did not start either. Contact $SUPPORT right away and send the log file."
  fi
}

# One-time data conversions ship inside the image as /app/data-migrations/*.js (the
# Dockerfile builds them from scripts/). Each runs once per server, in file-name order,
# and is recorded in $LEDGER. They are written to be safe to repeat, so one that failed
# or was interrupted is simply retried the next time this script runs. They run only
# after the new version is healthy; if one fails the app is left on the new version
# (switching back would not undo a half-finished conversion) and the backup from
# step 4 is the way back.
migration_applied() {
  [ -f "$LEDGER" ] || return 1
  awk -v n="$1" '{ sub(/\r$/, "") } $1 == n { found = 1 } END { exit !found }' "$LEDGER"
}

conversion_problem() {
  warn "$1"
  warn "$TAG is running, but existing records may not be converted yet."
  warn "Run this updater again with $TAG to retry; it is safe to repeat."
  warn "Your backup from before this update: $APP_DIR/$BACKUP"
  fail "The data conversion did not complete."
}

run_data_migrations() {
  local listing err name
  local -a names=()
  err="$(mktemp)"; TMPFILES+=("$err")
  if ! listing="$(IMAGE_TAG="$TAG" docker compose run --rm --no-deps -T web \
      sh -c 'if [ -d /app/data-migrations ]; then ls -1 /app/data-migrations | sort; fi' </dev/null 2>"$err")"; then
    sed 's/^/      /' "$err"
    conversion_problem "Could not check whether this version has data to convert."
  fi
  while IFS= read -r name; do
    name="${name%$'\r'}"
    [[ "$name" =~ ^[A-Za-z0-9._-]+\.js$ ]] || continue
    migration_applied "$name" || names+=("$name")
  done <<< "$listing"
  if [ "${#names[@]}" -eq 0 ]; then
    ok "No data conversion is needed"
    return 0
  fi
  say "  This can take a few minutes on a large database. Please keep this window open."
  for name in "${names[@]}"; do
    say "  Converting existing data: $name"
    IMAGE_TAG="$TAG" docker compose run --rm --no-deps -T web node "/app/data-migrations/$name" </dev/null 2>&1 | sed 's/^/      /'
    if [ "${PIPESTATUS[0]}" -ne 0 ]; then
      conversion_problem "The data conversion \"$name\" did not finish."
    fi
    printf '%s %s %s\n' "$name" "$(date '+%Y-%m-%dT%H:%M:%S')" "$TAG" >> "$LEDGER" \
      || warn "Could not record $name in $LEDGER; it will simply run again next time."
    CONVERTED+=("$name")
    ok "Converted: $name"
  done
}

main() {
  trap cleanup EXIT
  say "Neev CMS updater   ($(date '+%Y-%m-%d %H:%M'))"
  say "Keep this window open until it says the update has finished."

  step 1 "Checking this computer"
  command -v docker >/dev/null 2>&1 || fail "Docker is not installed."
  docker info >/dev/null 2>&1 || fail "Cannot talk to Docker. Wait a minute and try again; if it keeps failing, contact $SUPPORT."
  docker compose version >/dev/null 2>&1 || fail "The 'docker compose' command is missing."
  [ -f docker-compose.yml ] || fail "docker-compose.yml was not found in $APP_DIR."
  [ -f .env ] || fail ".env was not found in $APP_DIR."
  OLD_TAG="$(get_env_tag)"
  [ -n "$OLD_TAG" ] || fail "IMAGE_TAG is missing from .env, so a safe roll-back would not be possible."
  [ -n "$(docker compose ps -q db 2>/dev/null)" ] || fail "The database container is not running. Contact $SUPPORT."
  ok "Docker is working"
  ok "Installed version: $OLD_TAG"
  if [ -z "$(docker compose ps -q web 2>/dev/null)" ]; then
    warn "The app is not running right now; this update will start it."
  fi
  local free_kb
  free_kb="$(df -Pk /mnt/c 2>/dev/null | awk 'NR==2 {print $4}')"
  if [ -n "${free_kb:-}" ] && [ "$free_kb" -lt 5242880 ]; then
    warn "Less than 5 GB is free on drive C:. Free some space if the download fails."
  fi
  if command -v flock >/dev/null 2>&1; then
    exec 9>"$APP_DIR/.update.lock"
    flock -n 9 || fail "Another update is already running."
  fi

  step 2 "Choosing the version"
  TAG="$TAG_ARG"
  local tries=0
  while true; do
    if [ -z "$TAG" ]; then
      ask "Which version do you want to install? (for example v1.2.0): "
      TAG="$REPLY"
    fi
    TAG="$(printf '%s' "$TAG" | tr -d '[:space:]')"
    case "$TAG" in V*) TAG="v${TAG#V}" ;; [0-9]*) TAG="v$TAG" ;; esac
    if [[ "$TAG" =~ $TAG_RE ]]; then break; fi
    tries=$((tries + 1))
    [ "$tries" -ge 3 ] && fail "That is not a valid version. It should look like v1.2.0."
    warn "\"$TAG\" is not a valid version. It should look like v1.2.0"
    TAG=""
  done
  if [ "$TAG" = "$OLD_TAG" ]; then
    warn "$TAG is already installed. Continuing will re-check the download and the database."
  elif is_downgrade "$OLD_TAG" "$TAG"; then
    warn "$TAG is OLDER than the installed $OLD_TAG. Going back can make existing data unreadable."
    warn "Only continue if $SUPPORT told you to."
    [ "$ASSUME_YES" = "1" ] && fail "A downgrade needs a person to confirm it; run this without -y."
    ask "Type DOWNGRADE to continue: "
    [ "$REPLY" = "DOWNGRADE" ] || { say "Cancelled. Nothing was changed."; exit 0; }
  fi
  say ""
  say "  Installed now : $OLD_TAG"
  say "  Will install  : $TAG"
  say "  The app will be unavailable for about a minute during the switch."
  confirm "Continue? [y/N] " || { say "Cancelled. Nothing was changed."; exit 0; }

  step 3 "Downloading $TAG (the running app is not touched yet)"
  local pull_out
  pull_out="$(mktemp)"; TMPFILES+=("$pull_out")
  IMAGE_TAG="$TAG" docker compose pull web </dev/null 2>&1 | tee "$pull_out"
  if [ "${PIPESTATUS[0]}" -ne 0 ]; then
    if grep -qiE 'manifest unknown|not found|no such manifest' "$pull_out"; then
      fail "Version $TAG does not exist. Check the version number with $SUPPORT. Nothing was changed."
    elif grep -qiE 'denied|unauthorized|authentication required|requested access' "$pull_out"; then
      fail "The download was refused (the registry login is missing or has expired). Contact $SUPPORT. Nothing was changed."
    fi
    fail "The download failed. Check the internet connection and try again. Nothing was changed."
  fi
  ok "Downloaded $TAG"

  step 4 "Backing up the database"
  BACKUP="backups/db-$STAMP-before-$TAG.sql.gz"
  docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" --clean --if-exists --no-owner "$POSTGRES_DB"' </dev/null | gzip > "$BACKUP"
  local dump_rc="${PIPESTATUS[0]}"
  if [ "$dump_rc" -ne 0 ] || ! gzip -t "$BACKUP" 2>/dev/null || [ "$(wc -c < "$BACKUP")" -lt 100 ]; then
    rm -f "$BACKUP"
    fail "The database backup failed, so the update was stopped before anything was changed."
  fi
  chmod 600 "$BACKUP"
  ok "Backup saved: $APP_DIR/$BACKUP"

  step 5 "Updating the database structure (only if this version needs it)"
  local push_out
  push_out="$(mktemp)"; TMPFILES+=("$push_out")
  IMAGE_TAG="$TAG" docker compose run --rm --no-deps -T -e CHECKPOINT_DISABLE=1 -e PRISMA_HIDE_UPDATE_MESSAGE=1 web npx prisma db push --skip-generate </dev/null 2>&1 | tee "$push_out"
  if [ "${PIPESTATUS[0]}" -ne 0 ]; then
    if grep -qiE 'data loss|accept-data-loss' "$push_out"; then
      fail "This version changes the database in a way that could delete data, so the update was stopped to protect it. Do not retry; contact $SUPPORT. The app was not changed and is still running $OLD_TAG."
    fi
    fail "The database update did not complete. The app was not changed and is still running $OLD_TAG. Your backup: $APP_DIR/$BACKUP. Contact $SUPPORT."
  fi
  if grep -qi 'already in sync' "$push_out"; then ok "No database changes were needed"; else ok "Database structure updated"; fi

  step 6 "Switching to $TAG"
  ENV_COPY=".env.before-$STAMP"
  cp -p .env "$ENV_COPY" && chmod 600 "$ENV_COPY"
  set_env_tag "$TAG" || fail "Could not update .env. The app was not changed."
  if docker compose up -d --no-deps web 2>&1 && wait_healthy "$HEALTH_TIMEOUT"; then
    ok "$TAG is running and healthy"
  else
    warn "The new version did not start correctly. Last messages from the app:"
    docker compose logs --no-log-prefix --tail=30 web 2>&1 | sed 's/^/      /'
    rollback
    fail "The update to $TAG did not work. See above for what was restored."
  fi

  step 7 "Converting existing data (only if this version needs it)"
  run_data_migrations

  step 8 "Final checks"
  local lic app_url
  lic="$(docker compose logs --no-log-prefix --tail=300 web 2>/dev/null | grep -o '\[License\][^"]*' | tail -1)"
  if [ -n "$lic" ]; then ok "$lic"; fi
  app_url="$(grep -E '^APP_URL=' .env | tail -1 | tr -d '\r' | sed -E "s/^APP_URL=//; s/^[\"']//; s/[\"']\$//")"
  case "$app_url" in
    https://*)
      if command -v curl >/dev/null 2>&1; then
        if curl -fsS -m 20 "$app_url/api/health" >/dev/null 2>&1; then
          ok "Reachable from the internet: $app_url"
        else
          warn "Could not reach $app_url yet. This is usually temporary; check again in a minute."
        fi
      fi ;;
  esac

  step 9 "Tidying up"
  docker images "$IMAGE_REPO" --format '{{.Tag}}' 2>/dev/null \
    | grep -vxF -e "$TAG" -e "$OLD_TAG" -e '<none>' \
    | while read -r old; do docker rmi "$IMAGE_REPO:$old" </dev/null >/dev/null 2>&1; done
  docker image prune -f >/dev/null 2>&1
  ls -1t backups/db-*.sql.gz 2>/dev/null | tail -n +"$((KEEP_BACKUPS + 1))" | while read -r f; do rm -f -- "$f"; done
  ls -1t .env.before-* 2>/dev/null | tail -n +6 | while read -r f; do rm -f -- "$f"; done
  ls -1t update-logs/update-*.log 2>/dev/null | tail -n +21 | while read -r f; do rm -f -- "$f"; done
  ok "Old downloads and old backups removed"

  say ""
  say "============================================================"
  if [ "$TAG" = "$OLD_TAG" ]; then
    say " Checked $TAG - everything is up to date."
  else
    say " Update complete: $OLD_TAG -> $TAG"
  fi
  if [ "${#CONVERTED[@]}" -gt 0 ]; then say " Data converted : ${CONVERTED[*]}"; fi
  say " Database backup : $APP_DIR/$BACKUP"
  say " Log file        : $APP_DIR/$LOG"
  say "============================================================"
}

main "$@" 2>&1 | tee -i -a "$LOG"
exit "${PIPESTATUS[0]}"
