# On-prem deployment stack

Companion files for [DEPLOYMENT_ONPREM.md](../../DEPLOYMENT_ONPREM.md). Run these on the customer's server, not on your own machine (except the one-time `cloudflared tunnel create` step, which needs your Cloudflare login).

**Target server is Windows?** Start with [WINDOWS-INSTALL.md](WINDOWS-INSTALL.md) first — it gets Docker running headlessly inside WSL2, persistent across reboots with nobody logged in. Everything below then runs inside that Linux shell, unchanged.

## Files

- `docker-compose.yml` — app + local Postgres + MinIO + Cloudflare Tunnel. No host ports are published; `cloudflared` is the only path in.
- `.env.onprem.example` — template for the real `.env` you create on the server. Copy it, fill in generated secrets, never commit the filled-in version.
- `cloudflared/config.yml` — tunnel routing config template; needs a real tunnel ID and credentials file (see below).
- [../../.github/workflows/release-onprem.yml](../../.github/workflows/release-onprem.yml) — builds, pushes, and signs the image customers pull, triggered by pushing a `v*.*.*` git tag.

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

# 9) Apply the schema
docker compose exec web npx prisma migrate deploy
```

Verify `https://<customer-slug>.<your-domain>/api/health` responds before considering the deployment live.

## ⚠ One-time: lock down the package's visibility

The first time `release-onprem.yml` runs, it creates a new GHCR package (`ghcr.io/apgosar/friends-conman-system`). **A freshly created GHCR package can default to public visibility even when the parent repo is private** — GHCR's visibility is a separate setting from the repo's. Before shipping this to any customer, go to the package's settings (from the repo page: right sidebar → Packages → the package → Package settings, or `github.com/users/apgosar/packages/container/friends-conman-system/settings`) and confirm/set it to **Private**. Do this after the very first tag push, before you rely on it being private.

## Notes

- `web` carries both `build:` (local testing, from the repo's root [Dockerfile](../../Dockerfile)) and `image:` (real deployments, pulled from GHCR — see steps 5–8 above and [DEPLOYMENT_ONPREM.md](../../DEPLOYMENT_ONPREM.md) §1). Real customer deployments should only ever run `docker compose pull`, never `docker compose build`.
- Storage defaults to the S3/MinIO adapter automatically (`DEPLOYMENT_TARGET=onprem` in the env template) — see [src/lib/deployment-config.ts](../../src/lib/deployment-config.ts).
- `minio-init` is a one-shot job that creates the document bucket on first boot; it exits after running and that's expected.
- License checks are cached in-process for ~15 minutes (`src/lib/license/verify.ts`), so renewing a license means updating `LICENSE_TOKEN` in `.env` and restarting the `web` container (`docker compose up -d web`), not just editing the file. `/api/health` is exempt from the license gate so uptime monitoring keeps working even on an expired deployment; every other route (pages and API) blocks once the grace period ends. See [DEPLOYMENT_ONPREM.md](../../DEPLOYMENT_ONPREM.md) §4 for the full design.
- Distroless/shell-less runtime images were considered for extra hardening but skipped for now — Puppeteer/Chromium's shared-library requirements make that a nontrivial change on its own, and it wouldn't meaningfully raise the bar against an operator who already has `docker exec` access to the host. Read-only root filesystem + dropped capabilities (already in `docker-compose.yml`) are the practical hardening at this layer.
