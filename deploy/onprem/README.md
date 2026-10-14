# On-prem deployment stack

Companion files for [DEPLOYMENT_ONPREM.md](../../DEPLOYMENT_ONPREM.md). Run these on the customer's server, not on your own machine (except the one-time `cloudflared tunnel create` step, which needs your Cloudflare login).

**Target server is Windows?** Start with [WINDOWS-INSTALL.md](WINDOWS-INSTALL.md) first — it gets Docker running headlessly inside WSL2, persistent across reboots with nobody logged in. Everything below then runs inside that Linux shell, unchanged.

## Files

- `docker-compose.yml` — app + local Postgres + MinIO + Cloudflare Tunnel. No host ports are published; `cloudflared` is the only path in.
- `.env.onprem.example` — template for the real `.env` you create on the server. Copy it, fill in generated secrets, never commit the filled-in version.
- `cloudflared/config.yml` — tunnel routing config template; needs a real tunnel ID and credentials file (see below).
- [../../.github/workflows/release-onprem.yml](../../.github/workflows/release-onprem.yml) — builds, pushes, and signs the image customers pull, triggered by pushing a `v*.*.*` git tag.
- `docker-compose.override.yml.example` — for testing on the host machine only, before touching Cloudflare Tunnel/DNS at all. Copy to `docker-compose.override.yml` (Compose merges it automatically) to expose the app at `http://localhost:8080` on the host only, then delete it again before going live.
- `update.sh` + `Update-NeevCMS.bat` — the one-click updater for a customer's server; see "Updating a customer's server" below.

## Test locally before wiring up internet access

Confirm the stack actually works before spending any time on Cloudflare/DNS:

```bash
cp docker-compose.override.yml.example docker-compose.override.yml
docker compose up -d
docker compose exec web npx prisma db push
docker compose exec web npx prisma db seed   # starter logins; the default password is in prisma/seed.ts
# open http://localhost:8080 in a browser on the host machine
rm docker-compose.override.yml   # remove before going live — no ports should be published in production
```

## Two placeholders used throughout this doc

- **`<customer-slug>`** — a short identifier for this customer (e.g. `acme`), used only so multiple customers' Cloudflare Tunnels are distinguishable in your dashboard (`neev-cms-acme`, `neev-cms-shreeconstructions`, ...). No other meaning — pick anything short and unique.
- **`<your-domain>`** — **your** domain (whatever you already use for your business/product), not the customer's. `cloudflared tunnel route dns` needs a DNS zone added to your own Cloudflare account, and every customer just gets a free subdomain under it: `<customer-slug>.<your-domain>`. **The customer does not need to own a domain at all** — if they don't have one (common), this is simply the answer: they never need one, everything hangs off a domain you already control.

## First-time setup on a new customer's server

```powershell
# 1) One-time, from your own machine — creates the tunnel and DNS record
cloudflared tunnel login
cloudflared tunnel create neev-cms-<customer-slug>
cloudflared tunnel route dns neev-cms-<customer-slug> <customer-slug>.<your-domain>

# 2) Copy the generated <TUNNEL_ID>.json credentials file into
#    deploy/onprem/cloudflared/ on the customer's server, then edit
#    cloudflared/config.yml with the real tunnel ID and hostname.

# 3) One-time, from your own machine — only needed once ever for your product,
#    not per customer. Skip if you already have license-private-key.jwk.json.
npx tsx scripts/license/generate-keypair.ts
# paste the printed public JWK into src/lib/license/public-key.ts and commit that.

# 4) Per customer, from your own machine — issue this deployment's license.
#    Never run this on the customer's server; the private key never leaves you.
npx tsx scripts/license/issue-license.ts --customer "<Customer Name>" --host <customer-slug>.<your-domain> --days 365

# 5) Cut the release this customer gets, from your own machine — only if the
#    version you want isn't already released. Triggers .github/workflows/release-onprem.yml.
git tag v1.2.0
git push origin v1.2.0

# 6) On the customer's server: fill in the env file
Copy-Item .env.onprem.example .env
# edit .env — generate NEXTAUTH_SECRET, CRON_SECRET, POSTGRES_PASSWORD, and
# MinIO access/secret keys fresh for this deployment, paste the contents of
# the license.jwt file from step 4 into LICENSE_TOKEN, and set IMAGE_TAG to
# the version from step 5 (e.g. "v1.2.0")

# 7) On the customer's server: authenticate to the private registry, once
#    (persists in the server's Docker credential store — not stored in .env)
docker login ghcr.io -u <your-github-username>
# password: a fine-grained personal access token scoped to read:packages only
# for this one package — generate it at github.com/settings/tokens, and give
# it a name that identifies which customer/server it's for, so you can
# revoke just that one if the relationship ends.

# 8) Bring the stack up — pulls the pinned image, never builds from source
docker compose pull
docker compose up -d

# 9) Create the database tables. This project has no migration history, so it
#    is `db push` (what update.sh uses too), not `migrate deploy` — that finds
#    nothing to apply and leaves the database empty.
docker compose exec web npx prisma db push
#    First install only: create the starter logins, then change their
#    passwords straight away — the default is in the public repo (prisma/seed.ts).
docker compose exec web npx prisma db seed
```

Verify `https://<customer-slug>.<your-domain>/api/health` responds before considering the deployment live.

## Updating a customer's server (one click)

Two small files do this, and neither contains anything secret. They live in **two different places** — the launcher on Windows, the script inside WSL — and the launcher only *starts* the script, so a missing `update.sh` is the most common first-run error.

**Set it up once, on the customer's server:**

1. **Find the app folder** *(Ubuntu window)*. It's the folder holding `docker-compose.yml` and `.env`:
   ```bash
   docker compose ls
   ```
   The `CONFIG FILES` column shows something like `/home/ankur/neev-cms/docker-compose.yml`; the app folder is everything before `/docker-compose.yml`.
2. **Put `update.sh` in that folder** *(Ubuntu window)*. Download it, or copy it in from Windows through `\\wsl$\Ubuntu\home\<linux-user>\neev-cms` in File Explorer:
   ```bash
   cd /home/ankur/neev-cms        # the folder from step 1
   curl -fsSL -o update.sh https://raw.githubusercontent.com/apgosar/friends-conman-system/<tag-or-commit>/deploy/onprem/update.sh
   bash -n update.sh && ls -l update.sh .env docker-compose.yml   # all three must be listed
   ```
   (The download only works while the repository is public; otherwise copy the file over. Use a release tag or commit rather than `main`, so the customer always runs a version you've reviewed.)
3. **Put `Update-NeevCMS.bat` on the Windows side** (`C:\NeevCMS\`, with a Desktop shortcut called "Update Neev CMS"). Open it in Notepad once and set `DISTRO` (the name from `wsl -l -v`) and `APPDIR` (the folder from step 1; an absolute path such as `/home/ankur/neev-cms` is safest). Leave `WSLUSER` empty unless the app was installed under a different Linux user than the distro's default (then set it, for example to `root`).
4. **Dry-run it** (see below), then hand it over.

The launcher prints a specific message if `APPDIR` can't be opened or `update.sh` isn't in it, so a wrong setup is obvious rather than silent.

The customer double-clicks the `.bat`, types the release tag you gave them (for example `v1.2.0`), confirms, and waits a few minutes. The script:

1. checks Docker, `.env` and that the database container is running;
2. asks for the tag, and refuses a downgrade unless they type `DOWNGRADE`;
3. **downloads the new image first** — if that fails (wrong tag, registry login, network) nothing running is touched;
4. backs up the database to `backups/` (gzipped SQL; the last 10 are kept);
5. applies database changes with `prisma db push`, run from the **new** image, and never with `--accept-data-loss` — if a change could delete data it stops here, before the app is touched;
6. switches only the `web` container to the new tag and records it in `.env`;
7. waits for the health check and **rolls back to the previous tag automatically** if the new version doesn't come up;
8. runs any **one-time data conversion** the release ships with, once per server (see "One-time data conversions" below);
9. prints the license status, checks the public URL, and removes old images.

Every run writes a log to `update-logs/` that the customer can send you. The app is unavailable for about a minute during step 6.

**What it deliberately does not do**
- It doesn't change `docker-compose.yml` or add settings to `.env`. If a release needs either, tell the customer separately (and send a new `update.sh` the same way). A missing required setting makes the new version fail its health check, so the script rolls back rather than leaving a broken app.
- It doesn't update Postgres, MinIO or `cloudflared`.
- It uses `db push` because the project has no migration history. If you adopt Prisma migrations, switch step 5 to `migrate deploy` — after baselining existing databases, or the first run on them will fail.

**One-time data conversions**

Some releases change what *existing* records mean. v0.0.3, for example, retired the old unit, sale and demand statuses. `prisma db push` changes structure, not values, so such a release carries a small conversion and the updater runs it:

- The Dockerfile compiles each conversion into the image as `/app/data-migrations/NNN-name.js` (minified; `scripts/` and `src/` are never shipped). Nothing is copied to the server by hand.
- Once the new version is healthy, the updater runs every conversion in the image that this server hasn't run yet, in name order, in a throwaway container of the new image.
- Each success is recorded in `data-migrations.applied` in the app folder, so it runs once per server. A failed one is **not** recorded. The app stays on the new version (switching back would not undo a half-finished conversion), the updater says so and exits with an error, and running it again with the same tag retries. If it keeps failing, the step 4 backup is the way back: restore it (below) and set `IMAGE_TAG` in `.env` back to the old tag.
- To run one by hand: `docker compose run --rm --no-deps web node /app/data-migrations/<name>.js`. That doesn't write the ledger, so the next update runs it once more, which is harmless.

A fresh install needs nothing. Conversions do nothing on a database that never held old data, and the first update on a new server just runs each one once.

**Adding one in a future release:** write the script under `scripts/`, then add an esbuild line for it to the Dockerfile with the next `NNN-` prefix (the existing line is the template). The rule is **safe to repeat, and safe on a database that never needed it**; the ledger avoids repeats but is not what makes them safe. There is no transaction around a conversion, so test it on a copy of real data first. Scripts that write through the shared Prisma client should set `process.env.NEEV_SKIP_AUDIT = '1'` first (see `scripts/migrate-lifecycle-statuses.ts`), otherwise the audit hook prints an error for every row.

**Before you rely on it:** run it once on the real server with the tag that's *already installed*. That's a safe dry run — it downloads (a no-op), backs up, checks the schema and health, and changes nothing apart from running a data conversion that is still pending — and it proves the registry login, the backup and the WSL hand-off work before a real release depends on them.

**Restoring a backup** (vendor only, for example after a failed update that had already changed the database): stop the app, restore, start it again.

```bash
docker compose stop web
gunzip -c backups/<file>.sql.gz | docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"'
docker compose start web
```

If the backup was taken before a data conversion ran, also delete that conversion's line from `data-migrations.applied` (or the whole file), so the next update runs it again.

## ⚠ One-time: lock down the package's visibility

The first time `release-onprem.yml` runs, it creates a new GHCR package (`ghcr.io/apgosar/friends-conman-system`). **A freshly created GHCR package can default to public visibility even when the parent repo is private** — GHCR's visibility is a separate setting from the repo's. Before shipping this to any customer, go to the package's settings (from the repo page: right sidebar → Packages → the package → Package settings, or `github.com/users/apgosar/packages/container/friends-conman-system/settings`) and confirm/set it to **Private**. Do this after the very first tag push, before you rely on it being private.

## Notes

- `web` carries both `build:` (local testing, from the repo's root [Dockerfile](../../Dockerfile)) and `image:` (real deployments, pulled from GHCR — see steps 5–8 above and [DEPLOYMENT_ONPREM.md](../../DEPLOYMENT_ONPREM.md) §1). Real customer deployments should only ever run `docker compose pull`, never `docker compose build`.
- Storage defaults to the S3/MinIO adapter automatically (`DEPLOYMENT_TARGET=onprem` in the env template) — see [src/lib/deployment-config.ts](../../src/lib/deployment-config.ts).
- `minio-init` is a one-shot job that creates the document bucket on first boot; it exits after running and that's expected.
- License checks are cached in-process for ~15 minutes (`src/lib/license/verify.ts`), so renewing a license means updating `LICENSE_TOKEN` in `.env` and restarting the `web` container (`docker compose up -d web`), not just editing the file. `/api/health` is exempt from the license gate so uptime monitoring keeps working even on an expired deployment; every other route (pages and API) blocks once the grace period ends. See [DEPLOYMENT_ONPREM.md](../../DEPLOYMENT_ONPREM.md) §4 for the full design.
- Distroless/shell-less runtime images were considered for extra hardening but skipped for now — Puppeteer/Chromium's shared-library requirements make that a nontrivial change on its own, and it wouldn't meaningfully raise the bar against an operator who already has `docker exec` access to the host. Read-only root filesystem + dropped capabilities (already in `docker-compose.yml`) are the practical hardening at this layer.
