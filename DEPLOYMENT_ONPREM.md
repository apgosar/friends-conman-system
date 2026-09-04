# On-Premise Deployment Plan — Neev CMS

**Scenario**: Deployed on hardware owned and administered by the customer (construction company). The customer's IT staff will have root/SSH access to the box. Internet access via Cloudflare Tunnel (no inbound ports opened).

**Read this first**: When the party running the server has root, no technical control makes the code unreadable — a determined admin can eventually inspect anything the machine executes. Nothing below is a silver bullet. The realistic goal is:
1. Never hand over anything more than a compiled, running application (no source tree, no build tooling, no `.git` history).
2. Make the app **non-functional without your license server** — copying the container buys them a dead app, not a working clone.
3. Back both of the above with a **signed legal agreement** with real teeth, since that's what actually gets enforced if someone crosses the line.

---

## 1. What ships to the customer (and what never does)

| Never leaves your side | Ships to customer |
|---|---|
| This git repo, `.git` history, `Dockerfile`, `docker-compose.yml` source, CI config | A pre-built, tagged Docker image pulled from your **private** registry |
| `.ts`/`.tsx` source, Prisma schema comments, internal docs (`quotation_paradigm.md`, `proforma_invoice_paradigm.md`, etc.) | Compiled `.next/standalone` output only (already the case via the multi-stage [Dockerfile](Dockerfile)) |
| Signing keys, license private key, Sentry auth tokens | A signed per-deployment license file (see §4) |

**Action items:**
- Push images to a **private** registry (GitHub Container Registry `ghcr.io` with a private repo, or Docker Hub private repo). Customer's server only ever runs `docker login` + `docker pull` — it never clones this repo.
- Confirm `.dockerignore` (already excludes `.git`, `.env*`, `*.pdf`, `README.md` — good) also excludes the paradigm/spec markdown files and any `docs/` folder if added later.
- Set `productionBrowserSourceMaps: false` explicitly in [next.config.ts](next.config.ts) (currently relies on Next's default). Sentry already uploads source maps to Sentry's servers only via `withSentryConfig` — verify no `.map` files land in `.next/standalone` or `public/` in the shipped image (`docker run --rm <image> find / -name '*.map'` as a build-time check).
- Audit client components for business logic that shouldn't be visible in the browser bundle — [BuildingViewer.tsx](src/components/projects/BuildingViewer.tsx), [NewSaleForm.tsx](src/components/sales/NewSaleForm.tsx), [QuoteModal.tsx](src/components/projects/QuoteModal.tsx) are the likely spots. Pricing/interest/TDS/GST calculations should be computed server-side (API route or Server Action) and only the *result* sent to the client — not the formula.

---

## 2. Container hardening (defense in depth, even under customer root)

The [Dockerfile](Dockerfile) already runs as a non-root `nextjs` user — good. Add:

- **Distroless/minimal runtime**: drop to a distroless Node base for the `runner` stage so there's no shell, package manager, or `apt` in the running container — raises the bar above "just `docker exec` in and look around."
- **Read-only root filesystem**: `docker-compose` — `read_only: true` with explicit `tmpfs` mounts for `/tmp` and Next.js cache dirs.
- **Drop capabilities**: `cap_drop: [ALL]`, add back only what's needed.
- **No debug/admin surfaces in prod**: confirm `prisma studio` is never started in the compose file, and there's no debug/test API route reachable in production (grep `src/app/api` for anything gated only by `NODE_ENV !== 'production'` checks vs. actually removed).
- **Signed images**: sign pushed images with `cosign` so a tampered/rebuilt image is detectable if you ever need to verify what's actually running.

None of this stops a root user from reading container memory or `docker export`-ing the filesystem — it stops casual poking and makes tampering detectable, which matters for support/audit purposes as much as for anti-RE.

---

## 3. Data & storage layer for on-prem

Current code uses `@google-cloud/storage` ([storage.ts](src/lib/storage.ts)) and Supabase Postgres — both cloud-managed. For a true on-prem deployment:

- **Database**: run Postgres in a container on the same host, data volume on an **encrypted disk** (LUKS). Not for RE protection — for data-at-rest protection if the machine is later resold, seized, or the disk removed.
- **Object storage**: replace the GCS client with **MinIO** (self-hosted, S3-compatible) run as another container. Since `@aws-sdk/client-s3` is already a dependency, this is a moderate code change (swap `storage.ts` to the S3 SDK pointed at the MinIO endpoint) rather than a rewrite — I can do this as a follow-up task if you want.
- Keep the existing `/api/files/[key]` authenticated-proxy pattern (already in place per `storage.ts` comments) — never let MinIO/S3 be reachable directly from the browser.

---

## 4. License gating (the actual anti-clone mechanism)

This is the single highest-leverage technical control when the operator has root, because it means **a copied container doesn't run**, or stops running once the license lapses.

Design:
- At build time, bake a **public key** into the image. You hold the private key.
- Issue each customer a signed license token (JWT or similar) containing: customer ID, issued/expiry dates, allowed hostname(s), feature flags. Delivered as a file mounted into the container (`/run/secrets/license.jwt`), not baked into the image (so it's per-deployment and revocable without a rebuild).
- On startup and on a recurring interval (e.g., every 24h) the app:
  - Verifies the token signature locally (works offline).
  - Optionally phones home to a license server you control to refresh/confirm the token hasn't been revoked and pull an updated one.
  - If the token is expired/invalid/revoked **and** the grace period (e.g., 7–14 days offline tolerance, so a firewall hiccup doesn't brick production) has elapsed, the app degrades to a "contact vendor" screen instead of serving the CMS.
- Add a build-time watermark (a hidden per-customer build ID string, e.g. in a response header or an obscure settings page) so that if source or a container image surfaces somewhere it shouldn't, you can trace which deployment it came from.

This is a real implementation task (a license-verification module + a small license-issuing service on your side) — worth scoping separately once the hosting plan is agreed. Happy to design/build it when you're ready.

---

## 5. Internet exposure via Cloudflare Tunnel

No inbound ports opened on the customer's router/firewall — `cloudflared` makes an outbound-only connection to Cloudflare's edge.

**Steps:**
1. Add a `cloudflared` service to `docker-compose.yml`, on the same Docker network as `web`, with no published ports.
2. On your Cloudflare account: `cloudflared tunnel login`, `cloudflared tunnel create neev-cms-<customer-slug>`, then `cloudflared tunnel route dns neev-cms-<customer-slug> app.<customerdomain>.com` (creates the proxied CNAME automatically).
3. `cloudflared` config (`config.yml`) maps the public hostname straight to `http://web:3000` over the internal Docker network — the app container itself binds only to the Docker bridge, not the host's public interface.
4. Cloudflare-side hardening (all free/Pro tier):
   - Force HTTPS, minimum TLS 1.2.
   - WAF managed rules + rate limiting on `/api/*` (also throttles anyone scripting requests to probe the app).
   - Bot Fight Mode.
   - Optionally, **Cloudflare Access** (Zero Trust) in front of the app for an extra login gate before NextAuth is even reached — cheap extra friction against casual poking, doesn't defeat a root admin but adds an audit trail (Access logs every authentication attempt).
5. Host firewall (`ufw`/`nftables`): default-deny inbound entirely (not even 443, since Cloudflare Tunnel needs no inbound rule), allow outbound. This is simpler and safer than the port-forward model — there is no open port for anyone to scan or attack from outside.

---

## 6. `docker-compose.yml` shape (on-prem)

Replace the current minimal [docker-compose.yml](docker-compose.yml) (single `web` service, SQLite-style volume, host port 3000 published) with a stack roughly like:

```yaml
services:
  web:
    image: <your-registry>/neev-cms:<tag>   # pulled, never built on customer's box
    restart: always
    read_only: true
    tmpfs: [/tmp]
    cap_drop: [ALL]
    env_file: .env
    secrets: [license]
    depends_on: [db, minio]
    networks: [internal]
    # no ports: — only reachable via cloudflared on the internal network

  db:
    image: postgres:16
    restart: always
    volumes: [pgdata:/var/lib/postgresql/data]   # lives on the LUKS-encrypted volume
    env_file: .env
    networks: [internal]

  minio:
    image: minio/minio
    restart: always
    command: server /data
    volumes: [minio-data:/data]
    env_file: .env
    networks: [internal]

  cloudflared:
    image: cloudflare/cloudflared
    restart: always
    command: tunnel run
    volumes: [./cloudflared:/etc/cloudflared]
    networks: [internal]

secrets:
  license:
    file: ./license.jwt

networks:
  internal:

volumes:
  pgdata:
  minio-data:
```

Nothing publishes a host port; the only path in is through `cloudflared`.

---

## 7. Secrets & config management

- `.env` created directly on the server by you during deployment (not committed, not emailed) — `chmod 600`, owned by a dedicated non-interactive service account rather than the customer's general admin login where their IT process allows it.
- `NEXTAUTH_SECRET`, `CRON_SECRET` generated fresh per deployment (`openssl rand -base64 32` / `openssl rand -hex 32`) — never reused across customers. [env.ts](src/lib/env.ts) already validates these are present and warns on placeholder values — good, keep it.
- License private key, registry credentials, MinIO root credentials: yours, rotated per deployment, never shared with the customer.

---

## 8. Backups & disaster recovery

- Nightly `pg_dump` + MinIO bucket sync, encrypted (age/gpg) and pushed to storage **you** control (your own S3/GCS bucket), not just kept on the customer's box. This also gives you an audit trail independent of the customer's server.
- Document a restore runbook and test it once before go-live.

---

## 9. Monitoring & updates

- Sentry is already wired ([next.config.ts](next.config.ts), `sentry.*.config.ts`) — confirm `SENTRY_DSN`/org/project env vars are set per deployment so errors route to your dashboard, not the customer's.
- Add uptime monitoring from your side (UptimeRobot hitting the public hostname, or a self-hosted Uptime Kuma you control) — don't rely on the customer to tell you it's down.
- **Update channel stays yours**: you push new image tags to the private registry; a small pull/redeploy script (or a `watchtower` instance scoped only to your registry) applies updates. Keeping the update path in your hands also means the license-gate logic itself can be improved/patched over time without needing the customer to do anything.

---

## 10. Legal layer (do this in parallel, not after)

Technical controls above raise cost and give you a kill-switch; they don't substitute for a contract. Before go-live, have a lawyer put a **Software License / On-Premise Deployment Agreement** in place covering:
- No reverse engineering, decompilation, disassembly, or extraction of source/algorithms.
- No creation of derivative or competing products.
- Vendor retains all IP; customer receives a runtime license only.
- Audit rights and license-revocation triggers tied to breach.
- Confidentiality of pricing/business logic.

The license-gating mechanism in §4 is what makes that agreement enforceable in practice (you can actually cut off access on breach, not just sue after the fact).

---

## 11. Rollout checklist

1. [ ] Legal agreement signed.
2. [ ] Private registry set up; image built and pushed (never the source repo).
3. [ ] Customer server provisioned: Docker + Compose installed, disk encryption (LUKS) enabled.
4. [ ] `docker-compose.yml` (on-prem variant), `.env`, license file placed on server by you.
5. [ ] `cloudflared` tunnel created, DNS routed, WAF/rate-limit rules configured on Cloudflare.
6. [ ] `npx prisma migrate deploy` run against the fresh Postgres container.
7. [ ] Storage layer confirmed pointing at MinIO (if that migration is done) or interim GCS/S3.
8. [ ] Backups scheduled and one restore tested.
9. [ ] Sentry + uptime monitoring receiving data.
10. [ ] License token verified live; grace-period behavior tested by simulating an outbound-block.
11. [ ] `/api/health` returns healthy through the public Cloudflare hostname.

---

## Open engineering work (not yet implemented)

- License-verification module + minimal license-issuing service (§4).
- `storage.ts` migration from `@google-cloud/storage` to MinIO/S3 SDK (§3).
- Distroless runtime stage + read-only filesystem in `Dockerfile`/compose (§2).
- On-prem `docker-compose.yml` and `cloudflared` config files (§6).

Say the word on any of these and I'll implement it.
