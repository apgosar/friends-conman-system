# On-prem deployment stack

Companion files for [DEPLOYMENT_ONPREM.md](../../DEPLOYMENT_ONPREM.md). Run these on the customer's server, not on your own machine (except the one-time `cloudflared tunnel create` step, which needs your Cloudflare login).

## Files

- `docker-compose.yml` — app + local Postgres + MinIO + Cloudflare Tunnel. No host ports are published; `cloudflared` is the only path in.
- `.env.onprem.example` — template for the real `.env` you create on the server. Copy it, fill in generated secrets, never commit the filled-in version.
- `cloudflared/config.yml` — tunnel routing config template; needs a real tunnel ID and credentials file (see below).

## First-time setup on a new customer's server

```powershell
# 1) One-time, from your own machine — creates the tunnel and DNS record
cloudflared tunnel login
cloudflared tunnel create neev-cms-<customer-slug>
cloudflared tunnel route dns neev-cms-<customer-slug> app.<customerdomain>.com

# 2) Copy the generated <TUNNEL_ID>.json credentials file into
#    deploy/onprem/cloudflared/ on the customer's server, then edit
#    cloudflared/config.yml with the real tunnel ID and hostname.

# 3) One-time, from your own machine — only needed once ever for your product,
#    not per customer. Skip if you already have license-private-key.jwk.json.
npx tsx scripts/license/generate-keypair.ts
# paste the printed public JWK into src/lib/license/public-key.ts and commit that.

# 4) Per customer, from your own machine — issue this deployment's license.
#    Never run this on the customer's server; the private key never leaves you.
npx tsx scripts/license/issue-license.ts --customer "<Customer Name>" --host app.<customerdomain>.com --days 365

# 5) On the customer's server: fill in the env file
Copy-Item .env.onprem.example .env
# edit .env — generate NEXTAUTH_SECRET, CRON_SECRET, POSTGRES_PASSWORD, and
# MinIO access/secret keys fresh for this deployment, and paste the contents
# of the license.jwt file from step 4 into LICENSE_TOKEN

# 6) Bring the stack up
docker compose up -d

# 7) Apply the schema
docker compose exec web npx prisma migrate deploy
```

Verify `https://app.<customerdomain>.com/api/health` responds before considering the deployment live.

## Notes

- `web` builds from the repo's root [Dockerfile](../../Dockerfile) for local testing of this stack. For a real customer deployment, swap `build:` for `image: <your-registry>/neev-cms:<tag>` so the server only ever pulls a pre-built image — see [DEPLOYMENT_ONPREM.md](../../DEPLOYMENT_ONPREM.md) §1.
- Storage defaults to the S3/MinIO adapter automatically (`DEPLOYMENT_TARGET=onprem` in the env template) — see [src/lib/deployment-config.ts](../../src/lib/deployment-config.ts).
- `minio-init` is a one-shot job that creates the document bucket on first boot; it exits after running and that's expected.
- License checks are cached in-process for ~15 minutes (`src/lib/license/verify.ts`), so renewing a license means updating `LICENSE_TOKEN` in `.env` and restarting the `web` container (`docker compose up -d web`), not just editing the file. `/api/health` is exempt from the license gate so uptime monitoring keeps working even on an expired deployment; every other route (pages and API) blocks once the grace period ends. See [DEPLOYMENT_ONPREM.md](../../DEPLOYMENT_ONPREM.md) §4 for the full design.
- Distroless/shell-less runtime images were considered for extra hardening but skipped for now — Puppeteer/Chromium's shared-library requirements make that a nontrivial change on its own, and it wouldn't meaningfully raise the bar against an operator who already has `docker exec` access to the host. Read-only root filesystem + dropped capabilities (already in `docker-compose.yml`) are the practical hardening at this layer.
