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
- **Read-only root filesystem + dropped capabilities**: done — `read_only: true`, `tmpfs: [/tmp]`, `cap_drop: [ALL]` are set on the `web` service in [deploy/onprem/docker-compose.yml](deploy/onprem/docker-compose.yml).
- **Distroless runtime**: considered, skipped for now. Puppeteer/Chromium's shared-library footprint makes a shell-less base image a nontrivial migration on its own, and it wouldn't meaningfully raise the bar against an operator who already has `docker exec` on the host — see the note in [deploy/onprem/README.md](deploy/onprem/README.md).
- **No debug/admin surfaces in prod**: confirm `prisma studio` is never started in the compose file, and there's no debug/test API route reachable in production (grep `src/app/api` for anything gated only by `NODE_ENV !== 'production'` checks vs. actually removed).
- **Signed images**: sign pushed images with `cosign` so a tampered/rebuilt image is detectable if you ever need to verify what's actually running. Not yet done.

None of this stops a root user from reading container memory or `docker export`-ing the filesystem — it stops casual poking and makes tampering detectable, which matters for support/audit purposes as much as for anti-RE.

---

## 3. Data & storage layer for on-prem — implemented

- **Database**: run Postgres in a container on the same host, data volume on an **encrypted disk** (LUKS). Not for RE protection — for data-at-rest protection if the machine is later resold, seized, or the disk removed. Wired up in [deploy/onprem/docker-compose.yml](deploy/onprem/docker-compose.yml) (`db` service).
- **Object storage**: `src/lib/storage/` is now a pluggable adapter (`gcsAdapter` / `s3Adapter`) selected by [deployment-config.ts](src/lib/deployment-config.ts) — cloud keeps using GCS, on-prem uses the S3 adapter pointed at a self-hosted **MinIO** container (`minio` service in the compose file, bootstrapped by `minio-init`). No rewrite needed elsewhere; every caller still imports `uploadFile`/`downloadFile`/etc. from `@/lib/storage`.
- The existing `/api/files/[...path]` authenticated-proxy pattern is unchanged — MinIO/S3 is never reachable directly from the browser, only through that route.

---

## 4. License gating (the actual anti-clone mechanism) — implemented

This is the single highest-leverage technical control when the operator has root, because it means **a copied container doesn't run**, or stops running once the license lapses.

**How it works:**
- `scripts/license/generate-keypair.ts` (run once, on your own machine) creates an ECDSA P-256 keypair. The public half lives in [src/lib/license/public-key.ts](src/lib/license/public-key.ts) (committed — public keys aren't secret). The private half never leaves your machine.
- `scripts/license/issue-license.ts` (run per customer, on your own machine) signs a token containing `customerId`, `issuedAt`, `expiresAt`, `allowedHosts`, `graceDays`. Its output is the literal value of that deployment's `LICENSE_TOKEN` env var — shipping the token to a customer is fine, since it's *signed*, not secret; only the private key that produced it matters.
- [src/lib/license/verify.ts](src/lib/license/verify.ts) verifies the signature and evaluates state (`valid` / `grace` / `expired` / `invalid` / `host-mismatch` / `not-configured`) purely with Web Crypto + Web APIs (`crypto.subtle`, `atob`, `TextEncoder`) — no `fs`, no `Buffer` — so it runs correctly regardless of whether Next.js executes [src/proxy.ts](src/proxy.ts) in the Edge runtime or Node.js. Results are cached in-process for 15 minutes so it's cheap to call on every request.
- [src/proxy.ts](src/proxy.ts) enforces it: when `deploymentConfig.licenseEnforced` is true (i.e. `LICENSE_MODE=onprem`), every request except health checks/static assets/the license-expired page itself is gated. Blocked API requests get a `402`; blocked page requests redirect to `/license-expired` ([src/app/license-expired/page.tsx](src/app/license-expired/page.tsx)). **Fails closed** — a missing `LICENSE_TOKEN` blocks the app, it doesn't silently allow it.
- [src/instrumentation.ts](src/instrumentation.ts) logs license status loudly at boot and every 6h afterward (`info`/`warn`/`error` by state), so status shows up in `docker compose logs` instead of only being discovered when a customer complains the app is down.
- [env.ts](src/lib/env.ts) treats a missing `LICENSE_TOKEN` as a hard startup error when license mode is on, and warns if it still looks like the example placeholder.

**Grace period**: `graceDays` (default 14, set per-token via `--grace`) means an expired license keeps the app fully working for that many extra days before blocking — so a firewall hiccup or a slightly late renewal doesn't take production down instantly. `grace` state is logged as a warning, not an error.

**What this does not (yet) do**: there's no phone-home / revocation server — verification is entirely offline against the baked-in public key. That's a deliberate scope cut for now (it needs vendor-side server infrastructure that doesn't exist yet); it means a customer who blocks all outbound network access can still run out a token's full grace period, and a token can't be revoked early short of shipping a new build with a different public key. If early revocation ever matters more than the added infrastructure cost, that's the natural next increment.

There's also no build-time watermarking (hidden per-customer build IDs to trace leaked source/images) — not implemented, listed under open work below.

---

## 5. Internet exposure via Cloudflare Tunnel

No inbound ports opened on the customer's router/firewall — `cloudflared` makes an outbound-only connection to Cloudflare's edge.

**Steps** (implemented in [deploy/onprem/](deploy/onprem/)):
1. `cloudflared` service is in `docker-compose.yml`, on the same Docker network as `web`, with no published ports.
2. On your Cloudflare account: `cloudflared tunnel login`, `cloudflared tunnel create neev-cms-<customer-slug>`, then `cloudflared tunnel route dns neev-cms-<customer-slug> app.<customerdomain>.com` (creates the proxied CNAME automatically). Full sequence in [deploy/onprem/README.md](deploy/onprem/README.md).
3. `cloudflared/config.yml` maps the public hostname straight to `http://web:8080` (the app's actual listen port per the `Dockerfile`) over the internal Docker network — the app container itself binds only to the Docker bridge, not the host's public interface.
4. Cloudflare-side hardening (all free/Pro tier) — still manual, do this in the dashboard per deployment:
   - Force HTTPS, minimum TLS 1.2.
   - WAF managed rules + rate limiting on `/api/*` (also throttles anyone scripting requests to probe the app).
   - Bot Fight Mode.
   - Optionally, **Cloudflare Access** (Zero Trust) in front of the app for an extra login gate before NextAuth is even reached — cheap extra friction against casual poking, doesn't defeat a root admin but adds an audit trail (Access logs every authentication attempt).
5. Host firewall (`ufw`/`nftables`): default-deny inbound entirely (not even 443, since Cloudflare Tunnel needs no inbound rule), allow outbound. This is simpler and safer than the port-forward model — there is no open port for anyone to scan or attack from outside.

---

## 6. `docker-compose.yml` (on-prem) — implemented

Live in [deploy/onprem/](deploy/onprem/): `docker-compose.yml` (`web` + `db` + `minio` + `minio-init` + `cloudflared`, no host ports published), `.env.onprem.example`, and `cloudflared/config.yml`. See [deploy/onprem/README.md](deploy/onprem/README.md) for the first-time setup sequence (tunnel creation, env file, bringing the stack up, running migrations).

The current root [docker-compose.yml](docker-compose.yml) (single `web` service, host port 3000 published) is unrelated dev-only scaffolding — leave it as is; it isn't what customer deployments use.

Nothing in the on-prem stack publishes a host port; `cloudflared` is the only path in.

Not yet done: swapping `build:` for a pulled `image:` tag once the private registry is set up (§1), and the license-token secret mount (§4, still unimplemented).

---

## 7. Secrets & config management

- `.env` created directly on the server by you during deployment from [deploy/onprem/.env.onprem.example](deploy/onprem/.env.onprem.example) (not committed, not emailed) — `chmod 600`, owned by a dedicated non-interactive service account rather than the customer's general admin login where their IT process allows it.
- `NEXTAUTH_SECRET`, `CRON_SECRET`, `POSTGRES_PASSWORD`, MinIO access/secret keys all generated fresh per deployment (`openssl rand -base64 32` / `openssl rand -hex 32`) — never reused across customers. [env.ts](src/lib/env.ts) validates the required ones are present and non-placeholder, and now also warns if the active storage provider (`STORAGE_PROVIDER`, driven by [deployment-config.ts](src/lib/deployment-config.ts)) is missing its bucket/endpoint config.
- License private key, registry credentials: yours, rotated per deployment, never shared with the customer. (Cloudflare Tunnel credentials are per-deployment too — see `deploy/onprem/cloudflared/`, gitignored.)

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
4. [ ] License issued for this customer (`scripts/license/issue-license.ts`, from your machine) — get `LICENSE_TOKEN`'s value before touching the server.
5. [ ] `deploy/onprem/.env` (from `.env.onprem.example`, including `LICENSE_TOKEN`) placed on server by you; `docker compose up -d`.
6. [ ] `cloudflared` tunnel created, DNS routed, WAF/rate-limit rules configured on Cloudflare — see [deploy/onprem/README.md](deploy/onprem/README.md).
7. [ ] `docker compose exec web npx prisma migrate deploy` run against the fresh Postgres container.
8. [ ] `minio-init` ran successfully (bucket created) — check `docker compose logs minio-init`.
9. [ ] Backups scheduled and one restore tested.
10. [ ] Sentry + uptime monitoring receiving data.
11. [ ] License logged as `valid` in `docker compose logs web` at boot; confirm the app actually blocks with a deliberately wrong `LICENSE_TOKEN` before shipping the real one.
12. [ ] `/api/health` returns healthy through the public Cloudflare hostname.

---

## Open engineering work (not yet implemented)

- Phone-home / revocation server for the license gate — current verification is fully offline against the baked-in public key (§4).
- Build-time watermarking (hidden per-customer build IDs) to trace leaked source/images (§2, §4).
- Swapping `build:` for a pulled `image: <registry>/neev-cms:<tag>` in `deploy/onprem/docker-compose.yml` once the private registry exists (§1).
- Signed images via `cosign` (§2).

Done: storage adapter (`src/lib/storage/`, §3), deployment-config module (`src/lib/deployment-config.ts`), on-prem `docker-compose.yml` + `cloudflared` config + env template (§6, in `deploy/onprem/`), license-verification module + issuing CLI + enforcement in `proxy.ts` (§4).

Say the word on any of the remaining items and I'll implement it.
