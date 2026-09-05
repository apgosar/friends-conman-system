# Installing Neev CMS on a Windows on-prem server

For a blank Windows machine, going from nothing to a running, internet-reachable, reboot-proof deployment.

**Why this looks the way it does**: everything in [docker-compose.yml](docker-compose.yml) (the app, Postgres, MinIO, Cloudflare Tunnel) is built from Linux container images — that's not changing, porting to native Windows containers isn't practical here since Postgres/MinIO/cloudflared don't ship Windows images. So the plan is: run a lightweight Linux environment on the Windows box via **WSL2**, install plain **Docker Engine** inside it (not Docker Desktop — see below for why), and make sure that Linux environment boots automatically with Windows so the app survives reboots **without anyone logging in**. Everything from `deploy/onprem/README.md` onward runs unchanged inside that Linux shell.

**Why not Docker Desktop**: it's built for a logged-in user's desktop session, its background service's unattended-reboot behavior is less predictable than a plain systemd service, and it requires a paid subscription once a company crosses certain size/revenue thresholds — a licensing question about the *customer's* company that's better avoided. Docker Engine (Community) inside WSL2 is free, headless, and this exact combination is Docker's own documented supported path.

---

## Step 0 — Confirm this machine can run WSL2

Run as Administrator in PowerShell:

```powershell
[System.Environment]::OSVersion.Version
Get-ComputerInfo | Select-Object WindowsProductName, OsBuildNumber, HyperVRequirementVirtualizationFirmwareEnabled
```

You need build **19041+** (Windows 10 2004 or later), any Windows 11, or **Windows Server 2022** (build 20348+), and `HyperVRequirementVirtualizationFirmwareEnabled` must be `True` (virtualization enabled in BIOS/firmware — if `False`, enable it there first).

If this is **Windows Server 2019** (build 17763) or virtualization can't be enabled, WSL2 isn't a good fit — stop here and ask for the Hyper-V Linux VM fallback instead (run a small Ubuntu VM under Hyper-V and treat that VM as the actual host; everything from Step 5 onward is identical inside it).

---

## Step 1 — Install WSL2 + Ubuntu

```powershell
wsl --install -d Ubuntu-22.04
```

Reboot if prompted. If this command errors (more likely on Server 2022 than Windows 11), do it manually:

```powershell
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
# reboot the machine, then:
wsl --set-default-version 2
wsl --install -d Ubuntu-22.04
```

Launch **Ubuntu 22.04** once from the Start Menu — first launch asks you to set a UNIX username/password. This is the one and only interactive setup step; do it now.

---

## Step 2 — Enable systemd inside the distro

Without this, WSL2 has no real init system, `dockerd` has nothing to keep it running as a service, and the whole Linux environment shuts itself down after a period of idleness. Inside the Ubuntu shell:

```bash
sudo tee /etc/wsl.conf > /dev/null <<'EOF'
[boot]
systemd=true
EOF
exit
```

Back in PowerShell, restart the distro to pick it up:

```powershell
wsl --shutdown
wsl -d Ubuntu-22.04
```

---

## Step 3 — Install Docker Engine inside WSL2

Inside the Ubuntu shell (standard Docker-on-Ubuntu install — nothing WSL-specific here):

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

sudo systemctl enable docker
sudo systemctl start docker

sudo usermod -aG docker $USER
```

Log out of the Ubuntu shell and back in (`exit`, then `wsl -d Ubuntu-22.04`) so the group membership applies, then confirm:

```bash
docker run hello-world
```

---

## Step 4 — Make WSL2 (and Docker) start automatically at Windows boot, with nobody logged in

This is the actual "persistent across restarts" requirement. WSL2's own service starts with Windows, but a specific *distro* only boots when something invokes it — that's the gap this closes. A Scheduled Task set to run **at startup**, **whether a user is logged on or not**, fills that gap by just touching the distro once, which brings systemd (and via `systemctl enable docker` above, `dockerd`) up.

```powershell
schtasks /create /tn "Start-WSL-Docker" /tr "wsl.exe -d Ubuntu-22.04 -u root -e /bin/true" /sc onstart /ru "<local-admin-username>" /rp "<that-account's-password>" /rl highest /f
```

Use a real local admin account here, not `SYSTEM` — WSL commands invoked from a `SYSTEM`-context task are known to behave unreliably since WSL expects a normal user profile/token. Once `dockerd` is running, any container with `restart: always` in `docker-compose.yml` (that's every service in ours) gets restarted by Docker itself — you don't need the scheduled task to re-run `docker compose up`, only to get `dockerd` alive again.

**Test it for real** before trusting it: `Restart-Computer`, let it fully boot with nobody logging in (or log in as a *different* account than the task's), then from any admin PowerShell session:

```powershell
wsl -d Ubuntu-22.04 -u root docker ps
```

All containers should show `Up`. If they don't, check `schtasks /query /tn "Start-WSL-Docker" /v` for the task's last run result before troubleshooting further.

---

## Step 5 — Put the deployment files on the server

Only these files go on the customer's box — never this git repo, never source code:

- [docker-compose.yml](docker-compose.yml)
- [.env.onprem.example](.env.onprem.example) (copied to `.env` and filled in)
- [cloudflared/config.yml](cloudflared/config.yml) (filled in) and the `<TUNNEL_ID>.json` credentials file from your Cloudflare tunnel setup

Put them inside the **Linux filesystem**, not under `/mnt/c/...` — cross-filesystem access from WSL2 to Windows drives is noticeably slower and has occasional file-permission/inotify quirks; keep it native:

```bash
mkdir -p ~/neev-cms/cloudflared
cd ~/neev-cms
```

Copy the files in however's convenient (`scp` from your machine, a USB drive staged via `/mnt/c/...` then `cp`'d in, pasting content directly). End state: `~/neev-cms/docker-compose.yml`, `~/neev-cms/.env`, `~/neev-cms/cloudflared/config.yml`, `~/neev-cms/cloudflared/<TUNNEL_ID>.json`.

---

## Step 6 — Fill in `.env`, log in to the registry, bring it up

From here it's identical to the Linux instructions in [README.md](README.md) steps 6–9 — run them inside this same WSL2 shell:

```bash
cd ~/neev-cms
# edit .env: NEXTAUTH_SECRET, CRON_SECRET, POSTGRES_PASSWORD, MinIO keys,
# LICENSE_TOKEN (from you), IMAGE_TAG (the version you released)

docker login ghcr.io -u <your-github-username>
# password: the read:packages-scoped PAT for this customer, see README.md

docker compose pull
docker compose up -d
docker compose exec web npx prisma migrate deploy
```

---

## Step 7 — Confirm it actually survives a reboot

Don't skip this — it's the specific requirement that started this whole runbook.

```powershell
Restart-Computer
```

After it comes back, **without logging in**, check from another machine:

- `https://app.<customerdomain>.com/api/health` responds.
- If you can reach the server another way (RDP, a colleague's session): `wsl -d Ubuntu-22.04 -u root docker compose -f /home/<user>/neev-cms/docker-compose.yml ps` shows every service `Up`.

---

## Step 8 — Disk encryption

Windows' equivalent of the LUKS recommendation in [DEPLOYMENT_ONPREM.md](../../DEPLOYMENT_ONPREM.md) §3 — WSL2's virtual disk lives on the Windows drive, so encrypting that drive covers it:

```powershell
Enable-BitLocker -MountPoint "C:" -EncryptionMethod XtsAes256 -UsedSpaceOnly -RecoveryPasswordProtector
```

Store the recovery key somewhere you control, not on the server itself.

---

## Step 9 — Firewall

Cloudflare Tunnel is outbound-only, so **no inbound firewall rule is needed for the app** — don't open one. Review existing inbound allow rules (`Get-NetFirewallRule -Direction Inbound -Enabled True -Action Allow`) and remove anything not deliberately needed; if RDP is enabled for your own remote admin access, scope it to your own IP/VPN, not left open.

---

## Day-2 operations

- **Logs**: `docker compose logs -f web` (from `~/neev-cms` inside the WSL2 shell).
- **Updating**: tag and push a new release from your machine (`git tag vX.Y.Z && git push origin vX.Y.Z`), then on the server: edit `IMAGE_TAG` in `.env`, `docker compose pull && docker compose up -d`.
- **Remote access without physically touching the Windows box**: RDP, or enable the OpenSSH Server Windows feature and SSH in, then `wsl -d Ubuntu-22.04` from there.
- **If the scheduled task's account password changes** (password rotation policy, etc.), the task silently stops working — `schtasks /change /tn "Start-WSL-Docker" /rp "<new-password>"` to update it, and re-test with a reboot.
