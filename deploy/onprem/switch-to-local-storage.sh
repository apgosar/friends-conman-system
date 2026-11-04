#!/usr/bin/env bash
# Neev CMS: move an existing server's uploaded documents from the MinIO container to the app's own
# `files` volume, and retire MinIO. Run once per server that was installed before v0.0.42.
# (New installs already use the files volume; this script then says "nothing to do".)
#
#   cd to the folder holding docker-compose.yml and .env, then
#     bash switch-to-local-storage.sh [-y]
#
# Needs the app to be on v0.0.42 or newer first (run Update Neev CMS), because that image has the
# folder the files volume mounts onto.
#
# Order of operations: check -> get the new docker-compose.yml for this release -> copy the files
# (once while the app runs, again after stopping it so nothing is missed) and prove the copy is exact ->
# switch .env and docker-compose.yml, start without MinIO -> check the app is healthy.
# If anything fails after the app was stopped, the old files are put back and the old setup is started
# again. The MinIO data volume is never deleted by this script.

# ---- Vendor settings ---------------------------------------------------------
REPO_RAW="https://raw.githubusercontent.com/apgosar/friends-conman-system"
SUPPORT="your Neev CMS vendor"
HEALTH_TIMEOUT="${NEEV_HEALTH_TIMEOUT:-180}"   # seconds to wait for the app to become healthy
APP_UID=1001         # the app's user inside the image (see Dockerfile)
# ------------------------------------------------------------------------------

set -u
set -o pipefail

ASSUME_YES="${NEEV_ASSUME_YES:-0}"
COMPOSE_SRC=""   # --compose FILE: use this docker-compose.yml instead of downloading one (testing, offline)
while [ $# -gt 0 ]; do
  case "$1" in
    -y|--yes) ASSUME_YES=1 ;;
    --compose) shift; COMPOSE_SRC="${1:-}" ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
  shift
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
LOG="update-logs/switch-storage-$STAMP.log"
SAVE="backups/storage-switch-$STAMP"
exec > >(tee -a "$LOG") 2>&1

TOTAL=6
WEB_STOPPED=0
SWITCHED=0
NEW_COMPOSE=""

say()  { printf '%s\n' "$*"; }
step() { printf '\n[%s/%s] %s\n' "$1" "$TOTAL" "$2"; }
ok()   { printf '  [ok] %s\n' "$*"; }
warn() { printf '  [!!] %s\n' "$*"; }

fail() {
  printf '\n  [FAILED] %s\n' "$*"
  rollback
  printf '  Log file: %s/%s\n  If you need help, send that file to %s.\n' "$APP_DIR" "$LOG" "$SUPPORT"
  exit 1
}

# Put the old setup back. Safe to call at any point: it only acts on what this run changed.
rollback() {
  [ -n "$NEW_COMPOSE" ] && rm -f "$NEW_COMPOSE"
  if [ "$SWITCHED" = "1" ]; then
    warn "Putting the previous docker-compose.yml and .env back"
    cp -p "$SAVE/docker-compose.yml" docker-compose.yml && cp -p "$SAVE/.env" .env
    docker compose up -d --remove-orphans </dev/null 2>&1 | sed 's/^/      /'
    SWITCHED=0; WEB_STOPPED=0
  elif [ "$WEB_STOPPED" = "1" ]; then
    warn "Starting the app again"
    docker compose up -d --no-deps web </dev/null 2>&1 | sed 's/^/      /'
    WEB_STOPPED=0
  fi
}

confirm() {
  [ "$ASSUME_YES" = "1" ] && return 0
  if ! read -r -p "$1" REPLY; then printf '\n'; fail "No input was received."; fi
  case "$REPLY" in y|Y|yes|YES|Yes) return 0 ;; esac
  return 1
}

# env_get KEY: the value in .env without quotes or a Windows line ending
env_get() {
  grep -E "^$1=" .env | tail -1 | tr -d '\r' | sed -E "s/^$1=//; s/^[\"']//; s/[\"']\$//"
}

# env_set KEY VALUE: replace the line, or add it at the end
env_set() {
  local tmp
  tmp="$(mktemp ".env.XXXXXX")" || return 1
  awk -v k="$1" -v v="$2" '
    BEGIN { done = 0 }
    $0 ~ "^" k "=" { if (!done) { print k "=\"" v "\""; done = 1 }; next }
    { print }
    END { if (!done) print k "=\"" v "\"" }
  ' .env > "$tmp" || { rm -f "$tmp"; return 1; }
  chmod --reference=.env "$tmp" 2>/dev/null || chmod 600 "$tmp"
  mv "$tmp" .env
}

wait_healthy() {
  local waited=0
  while [ "$waited" -lt "$1" ]; do
    if docker compose exec -T web wget -qO- http://localhost:8080/api/health </dev/null >/dev/null 2>&1; then return 0; fi
    sleep 3; waited=$((waited + 3))
  done
  return 1
}

# Copy (mirror) the bucket into the files volume, exactly: new and changed files are copied and files that
# are gone from MinIO are removed. Runs mc from the MinIO image already on this server.
mirror_files() {
  docker run --rm --user 0 --network "$MINIO_NET" -v "$FILES_VOLUME":/data/files \
    -e SRC_KEY="$AWS_KEY" -e SRC_SECRET="$AWS_SECRET" -e BUCKET="$BUCKET" -e APP_UID="$APP_UID" \
    --entrypoint sh "$MINIO_IMAGE" -c '
      set -e
      mc --config-dir /tmp/mc --quiet alias set src http://minio:9000 "$SRC_KEY" "$SRC_SECRET" >/dev/null
      mc --config-dir /tmp/mc --quiet mirror --overwrite --remove "src/$BUCKET" /data/files >/dev/null
      chown -R "$APP_UID:$APP_UID" /data/files
      echo "SIZE: $(mc --config-dir /tmp/mc du "src/$BUCKET" | head -1)"
    ' </dev/null 2>&1
}

# Empty output = the volume and the bucket hold the same files
diff_files() {
  docker run --rm --user 0 --network "$MINIO_NET" -v "$FILES_VOLUME":/data/files:ro \
    -e SRC_KEY="$AWS_KEY" -e SRC_SECRET="$AWS_SECRET" -e BUCKET="$BUCKET" \
    --entrypoint sh "$MINIO_IMAGE" -c '
      mc --config-dir /tmp/mc --quiet alias set src http://minio:9000 "$SRC_KEY" "$SRC_SECRET" >/dev/null &&
      mc --config-dir /tmp/mc diff "src/$BUCKET" /data/files
    ' </dev/null 2>&1
}

say "Neev CMS: move the uploaded documents from MinIO to the app's own files volume"
say "Log file: $APP_DIR/$LOG"

# ---- 1. Check ----------------------------------------------------------------
step 1 "Checking this server"
command -v docker >/dev/null 2>&1 || fail "Docker was not found."
docker compose version >/dev/null 2>&1 || fail "The 'docker compose' command is missing."
[ -f docker-compose.yml ] || fail "docker-compose.yml was not found in $APP_DIR."
[ -f .env ] || fail ".env was not found in $APP_DIR."

PROVIDER="$(env_get STORAGE_PROVIDER)"
if [ "$PROVIDER" = "local" ]; then
  ok "This server already keeps its files on the app's own volume. Nothing to do."
  exit 0
fi
[ "$PROVIDER" = "s3" ] || fail "STORAGE_PROVIDER in .env is '${PROVIDER:-empty}', expected 's3'. Contact $SUPPORT."

BUCKET="$(env_get AWS_S3_BUCKET)"
AWS_KEY="$(env_get AWS_ACCESS_KEY_ID)"
AWS_SECRET="$(env_get AWS_SECRET_ACCESS_KEY)"
IMAGE_TAG="$(env_get IMAGE_TAG)"
[ -n "$BUCKET" ] && [ -n "$AWS_KEY" ] && [ -n "$AWS_SECRET" ] || fail "AWS_S3_BUCKET, AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY is missing in .env."

MINIO_ID="$(docker compose ps -q minio 2>/dev/null | head -1)"
[ -n "$MINIO_ID" ] || fail "The minio container is not running, so the files cannot be read. Start the app first (docker compose up -d)."
WEB_ID="$(docker compose ps -q web 2>/dev/null | head -1)"
[ -n "$WEB_ID" ] || fail "The web container is not running. Start the app first (docker compose up -d)."

PROJECT="$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$MINIO_ID")"
MINIO_IMAGE="$(docker inspect -f '{{.Config.Image}}' "$MINIO_ID")"
MINIO_NET="$(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$MINIO_ID" | awk '{print $1}')"
WEB_IMAGE="$(docker inspect -f '{{.Config.Image}}' "$WEB_ID")"
[ -n "$PROJECT" ] && [ -n "$MINIO_IMAGE" ] && [ -n "$MINIO_NET" ] || fail "Could not read the MinIO container's settings."
FILES_VOLUME="${PROJECT}_files"

docker run --rm --entrypoint sh "$WEB_IMAGE" -c 'test -d /data/files' </dev/null >/dev/null 2>&1 \
  || fail "The running app ($WEB_IMAGE) is too old for this. Run Update Neev CMS to v0.0.42 or newer first, then run this again."
ok "App image $WEB_IMAGE has the folder for the files volume"
ok "MinIO is running ($MINIO_IMAGE), bucket '$BUCKET'"

# ---- 2. Get the new docker-compose.yml --------------------------------------------------
step 2 "Getting the docker-compose.yml for this release"
NEW_COMPOSE="$(mktemp "docker-compose.new.XXXXXX")" || fail "Cannot create a file in $APP_DIR."
if [ -n "$COMPOSE_SRC" ]; then
  cp "$COMPOSE_SRC" "$NEW_COMPOSE" || fail "Cannot read $COMPOSE_SRC."
else
  [ -n "$IMAGE_TAG" ] || fail "IMAGE_TAG is empty in .env."
  curl -fsSL "$REPO_RAW/$IMAGE_TAG/deploy/onprem/docker-compose.yml" -o "$NEW_COMPOSE" \
    || fail "Could not download docker-compose.yml for $IMAGE_TAG (is the server online, and does that release exist?)."
fi
docker compose -f "$NEW_COMPOSE" config -q 2>/dev/null || fail "The new docker-compose.yml is not valid."
grep -q 'files:/data/files' "$NEW_COMPOSE" || fail "The new docker-compose.yml has no files volume. It is not the one for this release."
if grep -qE '^\s+minio(-init)?:\s*$' "$NEW_COMPOSE"; then fail "The new docker-compose.yml still runs MinIO. It is not the one for this release."; fi
ok "Got it ($( [ -n "$COMPOSE_SRC" ] && echo "from $COMPOSE_SRC" || echo "$IMAGE_TAG" ))"

# ---- 3. Copy the files, the app still running -----------------------------------------
step 3 "Copying the files to the new volume (the app keeps running)"
docker volume inspect "$FILES_VOLUME" >/dev/null 2>&1 || docker volume create \
  --label "com.docker.compose.project=$PROJECT" --label "com.docker.compose.volume=files" "$FILES_VOLUME" >/dev/null \
  || fail "Could not create the volume $FILES_VOLUME."
mirror_files | sed 's/^/      /'
[ "${PIPESTATUS[0]}" = "0" ] || fail "Copying the files failed."
ok "First copy done"

# ---- 4. Stop the app, copy what changed, prove the copy is exact -------------------------
step 4 "Final copy (the app is stopped for about a minute so no upload is missed)"
confirm "  Stop the app now and finish the copy? (y/N): " || { rollback; say "  Cancelled. Nothing was changed except the copy of the files."; exit 1; }
docker compose stop web </dev/null 2>&1 | sed 's/^/      /'
WEB_STOPPED=1
mirror_files | sed 's/^/      /'
[ "${PIPESTATUS[0]}" = "0" ] || fail "Copying the files failed."
DIFF="$(diff_files)"; DIFF_RC=$?
[ "$DIFF_RC" = "0" ] || fail "Could not compare the files."
if [ -n "$DIFF" ]; then
  printf '%s\n' "$DIFF" | head -10 | sed 's/^/      /'
  fail "The copy does not match MinIO. Nothing was switched."
fi
ok "The new volume holds exactly the files MinIO holds"

# ---- 5. Switch ------------------------------------------------------------------
step 5 "Switching the app to the files volume (the database restarts briefly too, because .env changed)"
mkdir -p "$SAVE" && cp -p docker-compose.yml .env "$SAVE/" || fail "Cannot save the current settings to $SAVE."
ok "Previous docker-compose.yml and .env saved in $APP_DIR/$SAVE"
SWITCHED=1
mv "$NEW_COMPOSE" docker-compose.yml && NEW_COMPOSE="" || fail "Cannot replace docker-compose.yml."
env_set STORAGE_PROVIDER local && env_set LOCAL_STORAGE_DIR /data/files || fail "Cannot update .env."
docker compose up -d --remove-orphans </dev/null 2>&1 | sed 's/^/      /'
if wait_healthy "$HEALTH_TIMEOUT"; then
  ok "The app is healthy"
else
  docker compose logs --no-log-prefix --tail=30 web 2>&1 | sed 's/^/      /'
  fail "The app did not become healthy after the switch."
fi
docker compose exec -T web sh -c 'test -w /data/files' </dev/null >/dev/null 2>&1 \
  || fail "The app cannot write to /data/files."
ok "The app can write to /data/files"
WEB_STOPPED=0

# ---- 6. Done --------------------------------------------------------------------
step 6 "Done"
say "  The uploaded documents are now kept in the volume $FILES_VOLUME and MinIO is stopped and removed."
say ""
say "  Check: sign in, open a sale that has documents and open one."
say "  The old MinIO data is still in the volume ${PROJECT}_minio-data as a safety copy. After a week of normal use,"
say "  free the space with:  docker volume rm ${PROJECT}_minio-data"
say "  To undo this switch before then, copy $SAVE/docker-compose.yml and $SAVE/.env back and run: docker compose up -d --remove-orphans"
say "  (documents uploaded since the switch are only in the new volume)."
